"use client";

import { useUiLocale } from "@/components/i18n/UiLocale";
import type { WordInput } from "@/lib/vocabulary";

export type EditableWord = WordInput & { id?: string };

export function VocabularyEditor({ value, busy, onChange, onSave, onCancel }: {
  value: EditableWord; busy: boolean; onChange: (value: EditableWord) => void;
  onSave: (event: React.FormEvent) => void; onCancel: () => void;
}) {
  const { locale } = useUiLocale();
  const en = locale === "en";
  const fields = [
    ["word", en ? "English word or phrase" : "英文单词或短语", 80],
    ["meaning", en ? "Meaning · required for review" : "释义 · 补全后进入复习", 4000],
    ["example", en ? "Example or original context" : "例句或原始语境", 2500],
    ["phonetic", en ? "Phonetic spelling (optional)" : "音标（选填）", 200],
  ] as const;
  return <form className="vocabulary-editor" onSubmit={onSave} aria-label={en ? "Edit vocabulary" : "编辑词条"}>
    <h3>{value.id ? en ? "Edit word" : "编辑单词" : en ? "Add to personal vocabulary" : "添加到生词库"}</h3>
    <fieldset disabled={busy}>
      {fields.map(([key, label, max]) => <label key={key}>{label}{key === "meaning" || key === "example"
        ? <textarea className="piano-field" rows={key === "meaning" ? 4 : 3} maxLength={max} value={value[key] || ""} onChange={event => onChange({ ...value, [key]: event.target.value })} />
        : <input className="piano-field" required={key === "word"} maxLength={max} value={value[key] || ""} onChange={event => onChange({ ...value, [key]: event.target.value })} />}</label>)}
      <div className="vocabulary-actions"><button className="piano-button piano-button--primary" disabled={busy}>{busy ? en ? "Saving…" : "保存中…" : en ? "Save word" : "保存单词"}</button><button type="button" className="piano-text-button" onClick={onCancel}>{en ? "Cancel" : "取消"}</button></div>
    </fieldset>
  </form>;
}
