"""Install read-only local wordbooks with provenance; never extract APKG media."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import httpx

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'services/language'))
SOURCES = OUT / 'book-sources'
BOOKS = OUT / 'books'
SOURCES.mkdir(exist_ok=True)
BOOKS.mkdir(exist_ok=True)
tree = {item['path']: item for item in json.loads((OUT / 'qwerty-tree.json').read_text())['tree']}


def fetch_blob(path):
    entry = tree[path]
    target = SOURCES / Path(path).name
    if target.exists() and hashlib.sha1(b'blob '+str(target.stat().st_size).encode()+b'\0'+target.read_bytes()).hexdigest() == entry['sha']:
        return target.read_bytes()
    with httpx.Client(timeout=25, trust_env=False, follow_redirects=True) as client:
        for attempt in range(3):
            try:
                response = client.get(entry['url']).raise_for_status().json()
                data = base64.b64decode(response['content'])
                assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() == entry['sha']
                target.write_bytes(data)
                print('Downloaded', path, flush=True)
                return data
            except (httpx.TransportError, httpx.HTTPStatusError):
                if attempt == 2: raise
                time.sleep(1)


def clean(rows):
    found, output = set(), []
    for value in rows:
        word = re.sub(r'\s+', ' ', value.get('word', '').strip()).replace('’', "'")
        key = word.lower()
        if not re.fullmatch(r"[A-Za-z][A-Za-z' -]{0,79}", word) or len(word.split()) > 8 or key in found or not value.get('meaning', '').strip(): continue
        found.add(key)
        output.append({'word': word, 'meaning': value['meaning'].strip()[:4000], 'example': value.get('example', '')[:2500], 'phonetic': value.get('phonetic', '')[:200]})
    return output


def qwerty_words(files):
    rows = []
    for file in files:
        for row in json.loads((SOURCES / Path(file).name).read_bytes()):
            translations = row.get('trans', [])
            rows.append({'word': row.get('name', ''), 'meaning': '\n'.join(translations) if isinstance(translations, list) else translations,
                         'phonetic': row.get('usphone', '') or row.get('ukphone', '')})
    return clean(rows)


def main():
    primary = [f'public/dicts/PEPXiaoXue{year}_{term}_T.json' for year in range(3, 7) for term in [1, 2]]
    ielts = ['public/dicts/IELTS_3_T.json', 'public/dicts/IELTS_XDF_7000.json']
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch_blob, [*primary, *ielts, 'LICENSE']))
    manifest = []
    def save(id, name, level, words, description, sources, license):
        words = clean(words)
        data = json.dumps(words, ensure_ascii=False, separators=(',', ':')).encode()
        (BOOKS / (id + '.json')).write_bytes(data)
        manifest.append({'id': id, 'name': name, 'level': level, 'count': len(words), 'description': description,
                         'sources': sources, 'license': license, 'sha256': hashlib.sha256(data).hexdigest()})
        print(name, len(words), flush=True)
    url = 'https://github.com/RealKai42/qwerty-learner'
    save('primary', '小学英语 · 三至六年级', '小学', qwerty_words(primary), '人教版小学三至六年级八册合并去重。', [url], 'GPL-3.0；保留源仓库许可证，数据仅作本地学习')
    with httpx.Client(timeout=30, trust_env=False) as client:
        for id, name, filename in [('junior', '初中英语', '1 初中-乱序.txt'), ('senior', '高中英语', '2 高中-乱序.txt')]:
            target = SOURCES / filename
            if not target.exists():
                response = client.get('https://api.github.com/repos/KyleBing/english-vocabulary/contents/' + filename).raise_for_status().json()
                target.write_bytes(base64.b64decode(response['content']))
            rows = [{'word': parts[0], 'meaning': parts[1]} for line in target.read_text(encoding='utf-8-sig').splitlines() if len(parts := line.split('\t', 1)) == 2]
            save(id, name, name[:2], rows, '公开分阶段词汇表，含中文释义。', ['https://github.com/KyleBing/english-vocabulary'], 'BSD-3-Clause')
        license_path = SOURCES / 'KyleBing-LICENSE'
        if not license_path.exists():
            response = client.get('https://api.github.com/repos/KyleBing/english-vocabulary/contents/LICENSE').raise_for_status().json()
            license_path.write_bytes(base64.b64decode(response['content']))
    save('ielts7', '雅思 7 目标 · 核心词汇', '雅思 7', qwerty_words([ielts[0]]), '雅思核心词汇训练；目标标签不是官方分数词表。', [url], 'GPL-3.0；保留源仓库许可证')
    save('ielts85', '雅思 8.5 目标 · 拓展词汇', '雅思 8.5', qwerty_words([ielts[1]]), '更广的雅思拓展词汇；建议结合核心词书与实际语境学习，不保证考试分数。', [url], 'GPL-3.0；保留源仓库许可证')
    (BOOKS / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__': main()
