"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
export function VocabularyCapture({ children, module, resourceId, appearance }: { children: ReactNode; module: "listening" | "speaking"; resourceId?: string; appearance?: "piano" }) {
  const root = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<{ word: string; context: string } | null>(null), [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  function capture(event: React.MouseEvent | React.KeyboardEvent) {
    if (busy || (event.target as HTMLElement).closest("input,textarea,select,button")) return;
    const selection = window.getSelection(); if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0); if (!root.current?.contains(range.commonAncestorContainer)) return;
    const word = selection.toString().trim().replace(/\s+/g, " ").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (!/^[A-Za-z][A-Za-z'’‘ -]{0,79}$/.test(word) || word.split(" ").length > 8) return;
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const fullContext = (element?.closest("p,blockquote,li")?.textContent || element?.textContent || word).trim();
    const offset = Math.max(0, fullContext.toLowerCase().indexOf(word.toLowerCase()) - 1000);
    const context = fullContext.slice(offset, offset + 2500);
    setSelected({ word, context }); setMeaning(""); setMessage(""); setError("");
    if (event.type === "contextmenu") event.preventDefault();
  }
  async function save() {
    if (!selected || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/vocabulary/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: selected.word, meaning,
        source: { module, resourceId, context: selected.context } }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      setMessage(value.card?.meaning ? `已收藏 ${selected.word}，可在单词模块复习。` : `已收藏 ${selected.word}，可在单词模块补全释义。`); setSelected(null); window.getSelection()?.removeAllRanges();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "收藏失败。"); }
    finally { setBusy(false); }
  }
  return <section ref={root} onMouseUp={capture} onKeyUp={capture} onContextMenu={capture} className={appearance === "piano" ? "piano-vocabulary-capture" : "space-y-3"}><UiText text={children} /><UiText text={selected ? <UiElement as="div" role="dialog" aria-label="收藏到生词库" className={appearance === "piano" ? "piano-vocabulary-collector" : "fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 space-y-2 rounded-2xl border border-sage-green/30 bg-vanilla-cream p-4 shadow-lg"}><div className={appearance === "piano" ? "piano-vocabulary-row" : "flex flex-wrap items-center gap-3"}><span lang="en" className={appearance === "piano" ? "font-semibold" : "font-semibold text-hunter-green"}>{selected.word}</span><UiElement as="input" aria-label="收藏词汇的释义" value={meaning} maxLength={1000} disabled={busy} onChange={e => setMeaning(e.target.value)} placeholder="释义选填，可稍后补全" className={appearance === "piano" ? "piano-field" : "min-w-40 flex-1 rounded-xl border border-hunter-green/20 bg-white px-3 py-2 text-sm"} /><button disabled={busy} onClick={() => void save()} className={appearance === "piano" ? "piano-button piano-button--primary" : "rounded-full bg-hunter-green px-4 py-2 text-sm text-white disabled:opacity-50"}><UiText text={busy ? "收藏中…" : "加入生词库"} /></button><button disabled={busy} onClick={() => setSelected(null)} className={appearance === "piano" ? "piano-text-button" : "text-xs text-iron-grey underline"}><UiText text={"取消"} /></button></div><UiText text={error ? <p role="alert" className="text-sm text-red-800"><UiText text={error} /></p> : null} /></UiElement> : null} /><UiText text={message ? <p role="status" className={appearance === "piano" ? "piano-vocabulary-status" : "rounded-xl bg-yellow-green/20 p-3 text-sm text-hunter-green"}><UiText text={message} /> <Link href="/vocabulary?view=personal" className="underline"><UiText text={"打开生词库"} /></Link></p> : null} /></section>;
}
