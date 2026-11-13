"use client";

import { FilePicker } from "@/components/i18n/FilePicker";
import { UiText, useUiLocale } from "@/components/i18n/UiLocale";

import { useState } from "react";
import type { WordInput } from "@/lib/vocabulary";
type Group = { id: string; name: string; fields: string[]; rows: { key: string; values: string[] }[] };
function guess(fields: string[], choices: string[], fallback: number) {
  for (const choice of choices) { const index = fields.findIndex(f => f.toLowerCase().includes(choice)); if (index >= 0) return index; }
  return fallback;
}
export function DeckImporter({ onImported }: { onImported: (id: string) => void }) {
  const { locale } = useUiLocale();
  const [groups, setGroups] = useState<Group[]>([]), [groupId, setGroupId] = useState("");
  const [mapping, setMapping] = useState({ word: 0, meaning: 1, example: -1, phonetic: -1 });
  const [name, setName] = useState(""), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [warnings, setWarnings] = useState<string[]>([]);
  const group = groups.find(g => g.id === groupId);
  function selectGroup(value: Group) {
    setGroupId(value.id); setMapping({ word: guess(value.fields, ["word", "单词", "正面", "front", "expression"], 0),
      meaning: guess(value.fields, ["中文释义", "meaning", "释义", "definition", "translation", "back", "解释", "中文"], 1),
      example: guess(value.fields, ["英语例句", "英文例句", "example", "sentence", "例句"], -1), phonetic: guess(value.fields, ["英美音标", "phonetic", "音标", "ipa", "pronunciation"], -1) });
  }
  async function preview(event: React.FormEvent) {
    event.preventDefault(); if (!file || busy) return; setBusy(true); setError(""); setMessage(""); setGroups([]);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/vocabulary/import/preview", { method: "POST", body });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      setGroups(value.groups); setWarnings(value.warnings); selectGroup(value.groups[0]); setName(file.name.replace(/\.[^.]+$/, "").slice(0, 100));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "预览失败。"); }
    finally { setBusy(false); }
  }
  const mapped = group?.rows.map(row => ({ word: row.values[mapping.word]?.trim() || "", meaning: row.values[mapping.meaning] || "", example: (row.values[mapping.example] || "").slice(0, 2500), phonetic: (row.values[mapping.phonetic] || "").slice(0, 200) })) ?? [];
  const valid = mapped.filter(row => /^[A-Za-z][A-Za-z'’‘ -]{0,79}$/.test(row.word) && row.word.split(/\s+/).length <= 8 && row.meaning.trim());
  async function commit() {
    if (busy || !valid.length || mapping.word === mapping.meaning) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/vocabulary/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, words: valid satisfies WordInput[] }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      setMessage(`导入完成：新增 ${value.added} 个词，关联 ${value.linked} 个已有词，跳过 ${value.duplicates} 条重复项。`); setGroups([]); onImported(value.deckId);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "导入失败。"); }
    finally { setBusy(false); }
  }
  const en = locale === "en";
  const label = (zh: string, english: string) => en ? english : zh;
  return <section className="vocabulary-import" aria-label={label("导入词书", "Import wordbook")}>
    <div className="vocabulary-panel-title"><h2>{label("导入 Anki 或文本词书", "Import an Anki or text wordbook")}</h2></div>
    <p>{label("选择文件，预览并确认字段对应关系，再导入。支持 .apkg、UTF-8 TSV / CSV / TXT，复习由本应用独立安排。", "Choose a file, preview its fields, then confirm the import. Supports .apkg and UTF-8 TSV / CSV / TXT; this app schedules its own reviews.")}</p>
    <p className="vocabulary-footnote">{label("APKG 最大 512 MB，仅导入文本，不导入媒体、模板与 Anki 复习历史。", "APKG: up to 512 MB. Text entries only; Anki media, templates and review history are excluded.")}</p>
    <form onSubmit={event => void preview(event)} className="vocabulary-import-file"><div><span>{label("词书文件", "Wordbook file")}</span><FilePicker label={label("词书文件", "Wordbook file")} accept=".apkg,.tsv,.csv,.txt" disabled={busy} fileName={file?.name} onFile={file => { setFile(file); setGroups([]); setMessage(""); setError(""); }} /></div><button disabled={busy || !file} className="piano-button piano-button--primary">{busy ? label("正在处理…", "Processing…") : label("预览文件", "Preview file")}</button></form>
    {group && <div className="vocabulary-import-mapping">
      <div className="vocabulary-import-fields"><label>{label("词书名称", "Wordbook name")}<input className="piano-field" value={name} disabled={busy} maxLength={100} onChange={event => setName(event.target.value)} /></label><label>{label("笔记类型", "Note type")}<select className="piano-field" value={groupId} disabled={busy} onChange={event => selectGroup(groups.find(item => item.id === event.target.value)!)}>{groups.map(item => <option key={item.id} value={item.id}>{item.name} · {item.rows.length} {label("条", "entries")}</option>)}</select></label></div>
      <div className="vocabulary-import-fields">{([["word", label("单词字段", "Word field")], ["meaning", label("释义字段", "Meaning field")], ["example", label("例句字段", "Example field")], ["phonetic", label("音标字段", "Phonetic field")]] as const).map(([key, text]) => <label key={key}>{text}<select className="piano-field" value={mapping[key]} disabled={busy} onChange={event => setMapping(previous => ({ ...previous, [key]: Number(event.target.value) }))}>{["example", "phonetic"].includes(key) && <option value={-1}>{label("不导入", "Skip this field")}</option>}{group.fields.map((field, index) => <option key={index} value={index}>{index + 1}. {field}</option>)}</select></label>)}</div>
      <p>{label(`可导入 ${valid.length} / ${mapped.length} 条。`, `${valid.length} of ${mapped.length} entries can be imported.`)} {mapped.length - valid.length > 0 && label(`${mapped.length - valid.length} 条格式不符或释义为空，请检查字段。`, `${mapped.length - valid.length} entries have an invalid word or missing meaning; check the field mapping.`)} {groups.length > 1 && label("本次只导入选中的笔记类型，其他类型可再次预览。", "Only the selected note type is imported; preview again for other types.")}</p>
      <div className="vocabulary-table-wrap" role="region" tabIndex={0} aria-label={label("导入预览，可横向滚动", "Import preview, scroll horizontally")}><table><caption className="vocabulary-table-caption">{label("前 3 条预览", "Preview of the first 3 entries")}</caption><thead><tr><th scope="col">{label("单词", "Word")}</th><th scope="col">{label("释义", "Meaning")}</th><th scope="col">{label("例句", "Example")}</th></tr></thead><tbody>{mapped.slice(0, 3).map((row, index) => <tr key={index}><td lang="en">{row.word}</td><td>{row.meaning}</td><td lang="en">{row.example}</td></tr>)}</tbody></table></div>
      {warnings.map(warning => <p className="vocabulary-footnote" key={warning}><UiText text={warning} /></p>)}
      {mapping.word === mapping.meaning && <p role="alert">{label("单词与释义必须使用不同字段。", "Word and meaning must use different fields.")}</p>}
      <div className="vocabulary-actions"><button disabled={busy || !valid.length || !name.trim() || mapping.word === mapping.meaning} onClick={() => void commit()} className="piano-button piano-button--primary">{label(`确认导入 ${valid.length} 条`, `Import ${valid.length} entries`)}</button></div>
    </div>}
    {message && <p role="status" className="vocabulary-notice"><UiText text={message} /></p>}
    {error && <p role="alert" className="vocabulary-notice"><UiText text={error} /></p>}
  </section>;
}
