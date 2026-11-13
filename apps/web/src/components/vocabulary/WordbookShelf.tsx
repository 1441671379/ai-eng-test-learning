"use client";

import { UiText, useUiLocale } from "@/components/i18n/UiLocale";

import { useEffect, useState } from "react";
import type { LocalWordbook } from "@/lib/vocabulary-books";
export function WordbookShelf({ onStart }: { onStart: (id: string) => void }) {
  const { locale } = useUiLocale();
  const [books, setBooks] = useState<(LocalWordbook & { deckId: string | null })[]>([]), [busy, setBusy] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController();
    fetch("/api/vocabulary/books", { signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error); setBooks(value.books);
    }).catch(f => { if (!controller.signal.aborted) setError(f.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function start(book: LocalWordbook & { deckId: string | null }) {
    if (busy) return; setBusy(book.id); setError("");
    try {
      if (book.deckId) { onStart(book.deckId); return; }
      const response = await fetch("/api/vocabulary/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: book.id }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      onStart(value.deckId);
    } catch (f) { setError(f instanceof Error ? f.message : "无法打开词书。"); } finally { setBusy(""); }
  }
  const en = locale === "en";
  return <section className="vocabulary-books" aria-label={en ? "Local wordbooks" : "本地词书"}>
    <div className="vocabulary-panel-title"><h2>{en ? "Choose a wordbook" : "选择词书"}</h2><span className="vocabulary-footnote">{en ? "Available on this computer" : "已保存在本机"}</span></div>
    <p>{en ? "Open a wordbook to study. Each learner keeps their own progress; the same word shares one review schedule across wordbooks." : "选择一本词书开始学习。每位学习者单独保存进度，同一个词在不同词书中共用复习排期。"}</p>
    {loading && <p role="status">{en ? "Loading wordbooks…" : "正在读取词书…"}</p>}
    {error && <p role="alert" className="vocabulary-notice"><UiText text={error} /></p>}
    <div className="vocabulary-book-list">{books.map(book => <article key={book.id}><div><h3>{book.name}</h3><small>{book.level} · {book.count.toLocaleString()} {en ? "words" : "词"}</small><p>{book.description}</p><details><summary>{en ? "Source and licence" : "来源与许可"}</summary><p>{book.license}</p>{book.sources.map(source => /^https:\/\//.test(source) ? <a key={source} href={source} target="_blank" rel="noreferrer">{source}</a> : <p key={source}>{en ? "Locally supplied Anki wordbook" : "本机提供的 Anki 词书"}</p>)}</details></div><button disabled={Boolean(busy)} onClick={() => void start(book)} className={`piano-button${book.deckId ? " piano-button--primary" : ""}`}>{busy === book.id ? en ? "Opening…" : "正在打开…" : book.deckId ? en ? "Continue learning" : "继续学习" : en ? "Start learning" : "开始学习"}</button></article>)}</div>
    {!loading && !books.length && <p>{en ? "No local wordbooks are installed. Use Import to add your own." : "尚无本地词书，可通过“导入”添加自己的词书。"}</p>}
    <p className="vocabulary-footnote">{en ? "IELTS 7 / 8.5 labels describe learning goals, not official score wordlists or score guarantees." : "雅思 7 / 8.5 是训练目标，不代表官方分数词表，也不保证考试分数。"}</p>
  </section>;
}
