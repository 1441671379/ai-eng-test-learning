"""Read text fields from Anki packages without executing templates or extracting media."""
import csv
from contextlib import closing
from html import unescape
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import zipfile
import zstandard

MAX_DB = 64 * 1024 * 1024
MAX_NOTES = 10000
MAX_UPLOAD = 512 * 1024 * 1024


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden = [], 0
    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}: self.hidden += 1
        if tag in {"br", "p", "div", "li"} and not self.hidden: self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in {"script", "style"}: self.hidden = max(0, self.hidden - 1)
        if tag in {"p", "div", "li"} and not self.hidden: self.parts.append("\n")
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def plain(value):
    parser = TextOnly()
    parser.feed(str(value))
    text = re.sub(r"\[sound:[^\]]+\]", "", "".join(parser.parts))
    text = re.sub(r"\{\{c\d+::(.*?)(?:::[^}]*?)?\}\}", r"\1", text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", unescape(text)).strip()[:4000]


def package_preview(content):
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise ValueError("这个文件不是有效的 Anki .apkg 词书。") from None
    with archive:
        names = archive.namelist()
        filename = next((name for name in ["collection.anki21b", "collection.anki21", "collection.anki2"] if name in names), None)
        if filename is None: raise ValueError("未找到 Anki 词书数据库，请导出 .apkg 或 UTF-8 文本。")
        info = archive.getinfo(filename)
        if info.file_size > MAX_DB: raise ValueError("词书数据库超过 64 MB，请从 Anki 分批导出。")
        with archive.open(filename) as file:
            if filename.endswith("21b"):
                with zstandard.ZstdDecompressor().stream_reader(file) as reader: database = reader.read(MAX_DB + 1)
            else: database = file.read(MAX_DB + 1)
        if len(database) > MAX_DB: raise ValueError("解压后的词书数据库超过 64 MB，请分批导出。")
    if not database.startswith(b"SQLite format 3\x00"): raise ValueError("Anki 数据库格式无效。")
    with tempfile.TemporaryDirectory(prefix="english-anki-") as directory:
        path = Path(directory) / "collection.sqlite"
        path.write_bytes(database)
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.execute("PRAGMA trusted_schema=OFF")
            ticks = 0
            def bounded():
                nonlocal ticks
                ticks += 1
                return int(ticks > 20000)
            connection.set_progress_handler(bounded, 1000)
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            models = {}
            if "notetypes" in tables and "fields" in tables:
                for mid, name in connection.execute("SELECT id,name FROM notetypes"):
                    fields = [row[0] for row in connection.execute("SELECT name FROM fields WHERE ntid=? ORDER BY ord", (mid,))]
                    models[mid] = (name, fields)
            else:
                for mid, model in json.loads(connection.execute("SELECT models FROM col LIMIT 1").fetchone()[0]).items():
                    models[int(mid)] = (model.get("name", "Anki"), [f["name"] for f in sorted(model["flds"], key=lambda f: f["ord"])])
            rows = connection.execute("SELECT id,mid,flds FROM notes ORDER BY id LIMIT ?", (MAX_NOTES + 1,)).fetchall()
            if len(rows) > MAX_NOTES: raise ValueError("一次最多预览 10000 条笔记，请分批导出。")
            groups, chars = {}, 0
            for nid, mid, fields in rows:
                name, labels = models.get(mid, ("Anki", []))
                values = fields.split("\x1f")
                if len(values) > 80: raise ValueError("笔记字段过多，请使用单词和释义的文本导出。")
                clean = [plain(field) for field in values]
                chars += sum(map(len, clean))
                if chars > 32_000_000: raise ValueError("词书文本超过 3200 万字符，请分批导出。")
                group = groups.setdefault(mid, {"id": str(mid), "name": name, "fields": labels or [f"字段 {i+1}" for i in range(len(values))], "rows": []})
                group["rows"].append({"key": str(nid), "values": clean})
            return list(groups.values())


def text_preview(content, filename):
    try: text = content.decode("utf-8-sig")
    except UnicodeDecodeError: raise ValueError("请将词书保存为 UTF-8 编码的 TSV、CSV 或 TXT。") from None
    lines, labels, separator = [], None, None
    for line in text.splitlines(keepends=True):
        if line.startswith("#separator:"):
            separator = {"tab": "\t", "comma": ",", "semicolon": ";", "pipe": "|"}.get(line.strip().split(":", 1)[1])
        elif line.startswith("#columns:"): labels = line.strip().split(":", 1)[1].split("\t")
        elif line.startswith("#") and not lines: continue
        else: lines.append(line)
    data = "".join(lines)
    if not separator:
        try: separator = csv.Sniffer().sniff(data[:8000], delimiters="\t,;|").delimiter
        except csv.Error: separator = "\t"
    rows = []
    for row in csv.reader(io.StringIO(data), delimiter=separator):
        if any(field.strip() for field in row): rows.append(row)
        if len(rows) > MAX_NOTES + 1: raise ValueError("一次最多导入 10000 行，请分批导入。")
    if not rows: raise ValueError("词书没有可导入的内容。")
    if not labels and rows[0][0].strip().casefold() in {"word", "front", "单词", "正面"}: labels = rows.pop(0)
    if not rows or len(rows) > MAX_NOTES: raise ValueError("一次导入 1–10000 行，请分批导入。")
    count = max(map(len, rows))
    if count < 2 or count > 80: raise ValueError("词书需要至少两列（单词、释义），最多 80 列。")
    clean_rows, chars = [], 0
    for index, row in enumerate(rows):
        values = [plain(field) for field in row] + [""] * (count-len(row))
        chars += sum(map(len, values))
        if chars > 6_000_000: raise ValueError("词书文本过大，请分批导入。")
        clean_rows.append({"key": str(index), "values": values})
    fields = (labels or [])[:count]
    fields += [f"字段 {i+1}" for i in range(len(fields), count)]
    return [{"id": "text", "name": Path(filename).stem[:100], "fields": fields, "rows": clean_rows}]


def preview_import(content, filename):
    if not content or len(content) > MAX_UPLOAD: raise ValueError("请选择不超过 512 MB 的词书文件。媒体只跳过、不解压，词条数据库上限为 64 MB。")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".apkg", ".csv", ".tsv", ".txt"}: raise ValueError("支持 .apkg、.csv、.tsv、.txt 文件。")
    try: groups = package_preview(content) if suffix == ".apkg" else text_preview(content, filename)
    except (sqlite3.Error, csv.Error, KeyError, TypeError, json.JSONDecodeError, zstandard.ZstdError, RuntimeError, EOFError, zipfile.BadZipFile):
        raise ValueError("词书内容无法读取，请从 Anki 重新导出 .apkg 或 UTF-8 文本。") from None
    if not groups: raise ValueError("词书没有可导入的笔记。")
    return {"groups": groups, "warnings": ["只导入单词、释义、例句等文本字段；不导入模板、脚本、媒体和 Anki 复习历史。", "同一个词会关联到新词书，保留已有释义和复习进度；缺失字段会补齐。"]}
