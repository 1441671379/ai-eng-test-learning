"use client";

import { UiText, useUiLocale } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { originLabels, ratingLabels, type VocabularyCard, type WordInput } from "@/lib/vocabulary";
import type { vocabularySnapshot } from "@/lib/vocabulary-store";
import { DeckImporter } from "./DeckImporter";
import { WordAudio, WordAudioPrefetch } from "./WordAudio";
import { vocabularyAudioSettings, type VocabularyAudioSettings } from "@/lib/word-audio";
import { WordPronunciationPractice } from "./WordPronunciationPractice";
import { WordbookShelf } from "./WordbookShelf";
import { VocabularyEditor } from "./VocabularyEditor";
import { PianoIcon } from "@/components/ui/piano-icon";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber, draftChoice, draftFlag } from "@/components/learning/PracticeContinuity";
type Snapshot = Awaited<ReturnType<typeof vocabularySnapshot>>;
type ReviewRequest = { id: string; cardId: string; rating: number; revision: number };


async function json<T>(url: string, options?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...options }), value = await response.json(); if (!response.ok) throw new Error(value.error || "请求失败。"); return value; }
const body = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
function DictionaryNote({ card, en }: { card: VocabularyCard; en: boolean }) {
  if (!card.dictionary) return null;
  const meaning = card.dictionary.fields.includes("meaning");
  return <p className="vocabulary-word-meta">{en ? meaning ? "Dictionary meaning: " : "Phonetic source: " : meaning ? "词典释义：" : "音标来源："}<a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">ECDICT</a>{card.dictionary.match === "lemma" && (en ? ` · word-form reference: ${card.dictionary.headword}` : ` · 词形参考：${card.dictionary.headword}`)}{meaning && (en ? " · General definitions; check the meaning in context." : " · 通用词典义，请结合原句核对。")}</p>;
}
function intervalLabel(minutes: number, en = false) { if (en) { const amount = minutes < 60 ? minutes : minutes < 1440 ? Math.round(minutes / 60) : Math.round(minutes / 1440); const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day"; return `${amount} ${unit}${amount === 1 ? "" : "s"}`; } return minutes < 60 ? `${minutes} 分钟` : minutes < 1440 ? `${Math.round(minutes / 60)} 小时` : `${Math.round(minutes / 1440)} 天`; }
export function VocabularyWorkspace() {
  const { locale, t, dateLocale } = useUiLocale();
  const seed = usePracticeSeed("vocabulary", "/vocabulary");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [deck, setDeck] = useState(draftString(seed, "deck", "all")), [view, setView] = useState<string>(draftChoice(seed, "view", ["review", "personal", "library", "books", "import"], "review"));
  const [snapshotDeck, setSnapshotDeck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [flipped, setFlipped] = useState(draftFlag(seed, "flipped")), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [cards, setCards] = useState<VocabularyCard[]>([]), [total, setTotal] = useState(0), [search, setSearch] = useState(draftString(seed, "search")), [query, setQuery] = useState(draftString(seed, "query")), [page, setPage] = useState(Math.max(0, draftNumber(seed, "page")));
  const [cardsLoading, setCardsLoading] = useState(false);
  const [editing, setEditing] = useState<(WordInput & { id?: string }) | null>(null);
  const [dailyNew, setDailyNew] = useState(20), [retention, setRetention] = useState(90);
  const [audioSettings, setAudioSettings] = useState<VocabularyAudioSettings>(() => vocabularyAudioSettings(null));
  const [retryReview, setRetryReview] = useState<ReviewRequest | null>(null), [syncReview, setSyncReview] = useState<ReviewRequest | null>(null);
  const currentId = useRef(""), mounted = useRef(true), snapshotRequest = useRef(0), listRequest = useRef(0);
  usePracticeCheckpoint("vocabulary", "/vocabulary", { deck, view, flipped, search, query, page, cardId: snapshot?.nextCard?.id }, !loading, busy || Boolean(retryReview));
  const wordHeading = useRef<HTMLHeadingElement>(null), meaningHeading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    const request = ++snapshotRequest.current;
    const value = await json<Snapshot>(`/api/vocabulary?deck=${encodeURIComponent(deck)}`);
    if (!mounted.current || request !== snapshotRequest.current) return;
    if (currentId.current !== (value.nextCard?.id ?? "")) { setFlipped(!currentId.current && seed.cardId === value.nextCard?.id && draftFlag(seed, "flipped")); currentId.current = value.nextCard?.id ?? ""; }
    setSnapshot(value); setSnapshotDeck(deck); setDailyNew(value.settings.dailyNew); setRetention(Math.round(value.settings.retention * 100));
    setAudioSettings(vocabularyAudioSettings(value.settings.audio));
  }, [deck, seed]);
  const loadCards = useCallback(async () => {
    const request = ++listRequest.current;
    setCardsLoading(true);
    try {
      const value = await json<{ cards: VocabularyCard[]; total: number }>(`/api/vocabulary/cards?deck=${encodeURIComponent(deck)}&search=${encodeURIComponent(query)}&page=${page}`);
      if (mounted.current && request === listRequest.current) { setCards(value.cards); setTotal(value.total); }
    } finally { if (mounted.current && request === listRequest.current) setCardsLoading(false); }
  }, [deck, query, page]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "personal") { setDeck("personal"); setView("personal"); } }, []);
  useEffect(() => { mounted.current = true; setLoading(true); setError(""); void load().catch(f => setError(f.message)).finally(() => setLoading(false)); return () => { mounted.current = false; }; }, [load]);
  useEffect(() => { if (view === "library" || view === "personal") void loadCards().catch(f => setError(f.message)); }, [loadCards, view]);
  useEffect(() => { if (snapshot?.nextCard || !snapshot?.nextDue || view !== "review") return; const timer = window.setInterval(() => { void load().catch(() => undefined); }, 15000); return () => window.clearInterval(timer); }, [snapshot, view, load]);
  const snapshotReady = snapshotDeck === deck;
  const card = snapshotReady ? snapshot?.nextCard : null;
  async function rate(input: ReviewRequest) {
    if (busy) return; setBusy(true); setError(""); setMessage(""); setRetryReview(input);
    window.dispatchEvent(new Event("english-stop-word-audio"));
    try {
      const result = await json<{ recordWarning?: string }>("/api/vocabulary/review", body(input));
      setRetryReview(null); setFlipped(false); currentId.current = "";
      if (result.recordWarning) { setMessage(result.recordWarning); setSyncReview(input); }
      else { setMessage(locale === "en" ? `Saved: ${t(ratingLabels[input.rating as keyof typeof ratingLabels])}` : `已保存：${ratingLabels[input.rating as keyof typeof ratingLabels]}`); setSyncReview(null); }
      window.dispatchEvent(new Event("learning-records-updated")); await load();
      requestAnimationFrame(() => { wordHeading.current?.focus({ preventScroll: true }); wordHeading.current?.scrollIntoView({ block: "nearest" }); });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  function answer(rating: number) { if (card && flipped && !retryReview) void rate({ id: crypto.randomUUID(), cardId: card.id, rating, revision: card.revision }); }
  function reveal() { setFlipped(true); requestAnimationFrame(() => { meaningHeading.current?.focus({ preventScroll: true }); meaningHeading.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }); }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (view !== "review" || busy || retryReview || editing || !card || (event.target as HTMLElement)?.closest("input,textarea,select,button,a,[data-pronunciation-practice]")) return;
      if (event.code === "Space") { event.preventDefault(); reveal(); }
      else if (flipped && /^[1-4]$/.test(event.key)) { event.preventDefault(); void rate({ id: crypto.randomUUID(), cardId: card.id, rating: Number(event.key), revision: card.revision }); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
    // The handler intentionally captures only the displayed card and rating state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, busy, retryReview, editing, card, flipped]);
  async function saveWord(event: React.FormEvent) {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setError("");
    try { await json("/api/vocabulary/cards", { ...body(editing), method: editing.id ? "PATCH" : "POST" }); setEditing(null); setMessage("单词已保存。"); await Promise.all([load(), loadCards()]); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败。"); } finally { setBusy(false); }
  }
  async function explain(target: VocabularyCard) {
    if (busy) return; setBusy(true); setError(""); setMessage("正在结合语境生成释义…");
    try { await json("/api/vocabulary/explain", body({ cardId: target.id })); setMessage("AI 释义已保存，可编辑核对后复习。"); await Promise.all([load(), loadCards()]); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "释义生成失败。"); setMessage(""); } finally { setBusy(false); }
  }
  async function suspend(target: VocabularyCard) {
    setBusy(true); setError(""); try { await json("/api/vocabulary/cards", { ...body({ id: target.id, suspended: !target.suspended }), method: "PATCH" }); await Promise.all([load(), loadCards()]); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败。"); } finally { setBusy(false); }
  }
  async function personal(target: VocabularyCard, collect: boolean) {
    if (busy) return; setBusy(true); setError("");
    try {
      await json("/api/vocabulary/personal", body({ cardId: target.id, collect }));
      setMessage(collect ? `已将 ${target.word} 加入生词库，复习进度保留。` : `已将 ${target.word} 移出生词库，原词书与进度保留。`);
      await Promise.all([load(), loadCards()]);
    } catch (f) { setError(f instanceof Error ? f.message : "生词库保存失败。"); } finally { setBusy(false); }
  }
  async function settings(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await json("/api/vocabulary", { ...body({ dailyNew, retention: retention / 100 }), method: "PATCH" }); await load(); setMessage("复习设置已保存。目标记忆率用于后续排期。"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "设置保存失败。"); } finally { setBusy(false); }
  }
  async function changeAudio(next: VocabularyAudioSettings) {
    if (busy) return;
    const previous = audioSettings; setAudioSettings(next); setBusy(true); setError("");
    try { await json("/api/vocabulary", { ...body({ audio: next }), method: "PATCH" }); }
    catch { setAudioSettings(previous); setError(locale === "en" ? "Audio settings were not saved. Please retry." : "发音设置未保存，请重试。"); }
    finally { setBusy(false); }
  }
  async function sync() {
    if (!syncReview) return; setBusy(true);
    try { const result = await json<{ recordWarning?: string }>("/api/vocabulary/review", body(syncReview)); if (result.recordWarning) setMessage(result.recordWarning); else { setSyncReview(null); setMessage("学习记录已同步。"); window.dispatchEvent(new Event("learning-records-updated")); } }
    catch (failure) { setError(failure instanceof Error ? failure.message : "同步失败。"); } finally { setBusy(false); }
  }
  const en = locale === "en";
  const label = (zh: string, english: string) => en ? english : zh;
  const locked = busy || Boolean(retryReview) || loading;
  const libraryView = view === "personal" || view === "library";
  function navigate(next: string) {
    setView(next); if (next === "personal") setDeck("personal");
    if (next === "personal" || next === "library") setCardsLoading(true);
    setPage(0); setError("");
    if (!syncReview) setMessage("");
    document.getElementById("learning-content")?.scrollTo({ top: 0 });
  }
  const editForm = editing && <VocabularyEditor value={editing} busy={busy} onChange={setEditing} onSave={event => void saveWord(event)} onCancel={() => setEditing(null)} />;
  return <main className="vocabulary-page">
      <header className="vocabulary-heading"><h1 tabIndex={-1}>{label("单词", "Vocabulary")}</h1><a className="piano-text-link" href="#vocabulary-settings">{label("复习设置", "Review settings")}</a></header>
    <nav className="vocabulary-nav" aria-label={label("单词功能", "Vocabulary tools")}>
      {[["review", label("复习", "Review")], ["personal", label("生词库", "Word library")], ["books", label("词书", "Wordbooks")], ["import", label("导入", "Import")]].map(([key, text]) => <button key={key} disabled={locked} aria-pressed={key === "personal" ? libraryView : view === key} onClick={() => navigate(key)}>{text}{key === "personal" && snapshot && <span>{snapshot.personalCount}</span>}</button>)}
    </nav>
    {(view === "review" || libraryView) && <div className="vocabulary-deckbar">
      <label>{label("词书", "Wordbook")}<select className="piano-field" value={deck} disabled={locked || view === "personal"} onChange={event => { setDeck(event.target.value); setPage(0); }}><option value="all">{label("全部词书", "All wordbooks")}</option>{snapshot?.decks.map(item => <option key={item.id} value={item.id}>{item.id === "personal" ? label("我的生词库", "Personal words") : item.id === "sample-cet6" ? label("六级附近 · 示例词书", "CET-6 level · sample") : item.name} · {item.count}</option>)}</select></label>
      <div className="vocabulary-counts"><span>{label("到期复习", "Due")} <strong>{snapshotReady ? snapshot?.stats.due ?? "—" : "—"}</strong></span><span>{label("今日可学新词", "Available new")} <strong>{snapshotReady ? snapshot?.stats.new ?? "—" : "—"}</strong></span><span>{label("词数", "Words")} <strong>{snapshotReady ? snapshot?.stats.total ?? "—" : "—"}</strong></span></div>
      <p className="vocabulary-today">{label("今日复习", "Reviewed today")} <strong>{snapshotReady ? snapshot?.stats.reviewedToday ?? "—" : "—"}</strong></p>
    </div>}
    {message && <div className={syncReview ? "vocabulary-notice" : "vocabulary-status"} role="status"><UiText text={message} />{syncReview && <button disabled={busy} onClick={() => void sync()} className="piano-text-button">{label("重试同步记录", "Retry record sync")}</button>}</div>}
    {error && <div className="vocabulary-notice" role="alert"><UiText text={error} /><div className="vocabulary-actions">{retryReview ? <><button disabled={busy} onClick={() => void rate(retryReview)} className="piano-text-button">{label("重试保存本次选择", "Retry saving this rating")}</button><button disabled={busy} onClick={() => { setRetryReview(null); void load().catch(f => setError(f.message)); }} className="piano-text-button">{label("刷新卡片", "Refresh card")}</button></> : <button disabled={busy} onClick={() => { setError(""); void load().catch(f => setError(f.message)); if (libraryView) void loadCards().catch(f => setError(f.message)); }} className="piano-text-button">{label("重试", "Try again")}</button>}</div></div>}
    {loading && <div className="vocabulary-loading" role="status"><span>{label("正在读取词库…", "Loading vocabulary…")}</span><div aria-hidden="true" /><div aria-hidden="true" /></div>}
    {view === "review" && snapshot && <div className="vocabulary-audio-settings" role="group" aria-label={label("单词发音设置", "Word audio settings")}><label><input type="checkbox" checked={audioSettings.autoPlay} disabled={locked} onChange={event => void changeAudio({ ...audioSettings, autoPlay: event.target.checked })} />{label("自动发音", "Auto-play word audio")}</label><label>{label("真人录音口音", "Recorded-voice accent")}<select className="piano-field" value={audioSettings.accent} disabled={locked} onChange={event => void changeAudio({ ...audioSettings, accent: event.target.value as "us" | "uk" })}><option value="us">{label("优先美音", "Prefer US")}</option><option value="uk">{label("优先英音", "Prefer UK")}</option></select></label><span>{label("优先本地预生成示范，缺少时即时合成", "Pre-generated audio first; synthesis when unavailable")}</span></div>}
    <WordAudioPrefetch words={snapshot?.upcomingWords ?? []} accent={audioSettings.accent} enabled={view === "review" && audioSettings.autoPlay && snapshotReady && !loading} />
    {view === "review" && snapshot && snapshotReady && !loading && <section className="vocabulary-study" aria-label={label("单词卡复习", "Flashcard review")} aria-busy={busy}>
      {card ? <>
        <div className="vocabulary-review-grid">
          <section className="vocabulary-word" aria-label={label("当前单词", "Current word")}>
            <h2 ref={wordHeading} tabIndex={-1} lang="en">{card.word}</h2>
            {card.phonetic && <p className="vocabulary-ipa">{card.phonetic}</p>}
            <p className="vocabulary-word-state">{label(card.schedule.state === 0 ? "新词" : "到期复习", card.schedule.state === 0 ? "New word" : "Due for review")} · {label("已复习", "Reviewed")} {card.schedule.reps} {label("次", card.schedule.reps === 1 ? "time" : "times")}</p>
            <div className="vocabulary-word-actions"><WordAudio key={card.id} text={card.word} label="听示范发音" mode="word" autoPlay={audioSettings.autoPlay} accent={audioSettings.accent} download={false} /><button disabled={locked} onClick={() => void personal(card, !card.deckIds.includes("personal"))} className="piano-text-button">{label(card.deckIds.includes("personal") ? "已收藏 · 移出生词库" : "加入生词库", card.deckIds.includes("personal") ? "Saved · remove from library" : "Save to word library")}</button></div>
          </section>
          <section className="vocabulary-reference" aria-label={label("释义与用法", "Meaning and usage")}>
            {flipped ? <div className="vocabulary-revealed"><div className="vocabulary-panel-title"><h2 ref={meaningHeading} tabIndex={-1}>{label("释义", "Meaning")}</h2><button disabled={locked} className="piano-text-button" onClick={() => setEditing({ id: card.id, word: card.word, meaning: card.meaning, phonetic: card.phonetic, example: card.example })}>{label("编辑释义", "Edit meaning")}</button></div>
              {editForm || <><p className="vocabulary-meaning">{card.meaning}</p><DictionaryNote card={card} en={en} />{card.example && <section className="vocabulary-example"><h3>{label("例句与语境", "Example and context")}</h3><p lang="en">{card.example}</p><WordAudio key={card.example} text={card.example.slice(0, 1800)} label="听例句" /></section>}</>}
              <details className="vocabulary-sources"><summary>{label("收藏来源与语境", "Source and context")}</summary>{card.sources.map((source, index) => <div key={index}><strong><UiText text={originLabels[source.module]} />{source.label && ` · ${source.label}`}</strong>{source.context && <p lang="en">{source.context}</p>}{source.resourceId && ["reading", "listening"].includes(source.module) && <Link className="piano-text-link" href={`/${source.module}?id=${encodeURIComponent(source.resourceId)}`}>{label("返回学习材料", "Return to material")}<PianoIcon name="arrow-right" /></Link>}</div>)}</details>
            </div> : <div className="vocabulary-recall"><h2>{label("先回忆，再查看释义。", "Recall before revealing.")}</h2><p>{label("试着想起这个词的含义和用法。发音练习可随时按需开启。", "Try to recall the meaning and usage. Pronunciation practice is optional.")}</p><button disabled={locked} className="piano-button piano-button--primary" onClick={reveal}>{label("显示答案", "Show answer")}<PianoIcon name="arrow-right" /></button><small>{label("也可按空格键", "Or press Space")}</small></div>}
          </section>
        {flipped && <section className="vocabulary-ratings" aria-label={label("记忆自评", "Rate your recall")}><div className="vocabulary-panel-title"><h2>{label("刚才回忆得怎么样？", "How well did you recall it?")}</h2><p>{label("按词义记忆自评，发音评分单独进行。", "Rate your memory; pronunciation is assessed separately.")}</p></div><div className="vocabulary-rating-options">{card.preview.map(item => <button key={item.rating} disabled={locked || Boolean(editing)} onClick={() => answer(item.rating)}><strong>{item.rating}. <UiText text={ratingLabels[item.rating as keyof typeof ratingLabels]} /></strong><span>{intervalLabel(item.intervalMinutes, en)}</span></button>)}</div></section>}
          <WordPronunciationPractice key={`${deck}:${card.id}:${card.word}`} cardId={card.id} word={card.word} accent={audioSettings.accent} download={false} />
        </div>
        <p className="vocabulary-footnote">{label("空格显示答案 · 1–4 记忆自评 · FSRS 间隔复习 · 每日新词额度由所有词书共用", "Space to reveal · 1–4 to rate recall · FSRS spaced repetition · One daily new-word limit across all wordbooks")}</p>
      </> : <div className="vocabulary-empty"><h2>{label("当前没有待复习的卡片", "No cards are ready right now")}</h2><p>{snapshot.nextDue ? label(`下次到期：${new Date(snapshot.nextDue).toLocaleString(dateLocale)}，到时会自动刷新。`, `Next due: ${new Date(snapshot.nextDue).toLocaleString(dateLocale)}. This view refreshes automatically.`) : snapshot.stats.newToday >= snapshot.settings.dailyNew ? label(`今日已学习 ${snapshot.stats.newToday} 个新词，已达到每日上限。明天可以继续，或调整复习设置。`, `You have reached today's limit of ${snapshot.settings.dailyNew} new words. Continue tomorrow or adjust Review settings.`) : label("可以选择其他词书、添加生词，或调整每日新词数量。", "Choose another wordbook, add a word, or adjust your daily limit.")}</p><div className="vocabulary-actions"><button className="piano-button" onClick={() => navigate("books")}>{label("选择词书", "Choose a wordbook")}</button><button className="piano-text-button" onClick={() => navigate("personal")}>{label("打开生词库", "Open word library")}</button></div>{snapshot.stats.pendingMeaning > 0 && <button className="piano-text-button" onClick={() => { setView("library"); setDeck("all"); }}>{label(`${snapshot.stats.pendingMeaning} 个词待补全释义，前往词库`, `${snapshot.stats.pendingMeaning} words need a meaning · open library`)}</button>}</div>}
    </section>}
    {libraryView && <section className="vocabulary-library" aria-label={label("词库管理", "Word library management")}>
      <div className="vocabulary-panel-title"><div className="vocabulary-library-switch" role="group" aria-label={label("词库范围", "Library scope")}><button aria-pressed={view === "personal"} disabled={locked} onClick={() => { setView("personal"); setDeck("personal"); setPage(0); }}>{label("我的生词", "Personal words")}</button><button aria-pressed={view === "library"} disabled={locked} onClick={() => { setView("library"); setDeck("all"); setPage(0); }}>{label("全部词汇", "All words")}</button></div><div className="vocabulary-actions"><a href="/api/vocabulary/export" className="piano-text-link">{label("导出全部 TSV", "Export all as TSV")}</a><button className="piano-button" disabled={busy} onClick={() => setEditing({ word: "", meaning: "", example: "", phonetic: "" })}><PianoIcon name="plus" />{label("添加单词", "Add word")}</button></div></div>
      {view === "personal" && <div className="vocabulary-library-intro"><p>{label("收纳难记的词和各板块收藏的生词。复习时选择“忘记”或“困难”也会加入这里；移出生词库会保留原词书与进度。", "Words you save across modules, including cards rated Forgot or Difficult. Removing a word from this library keeps its original wordbook and progress.")}</p><button className="piano-text-button" onClick={() => setView("review")}>{label("复习生词库", "Review personal words")}<PianoIcon name="arrow-right" /></button></div>}
      <form className="vocabulary-search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(0); }}><label>{label("搜索单词或释义", "Search words or meanings")}<input className="piano-field" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} /></label><button className="piano-button" disabled={busy}>{label("搜索", "Search")}</button></form>
      {editForm}
      <div className="vocabulary-word-list" aria-busy={cardsLoading}>{cardsLoading ? <p role="status" className="vocabulary-loading">{label("正在读取词条…", "Loading words…")}</p> : cards.map(item => <article key={item.id}><div className="vocabulary-library-word"><h3 lang="en">{item.word}</h3>{item.phonetic && <p>{item.phonetic}</p>}<p className="vocabulary-word-meta">{[...new Set(item.sources.map(source => t(originLabels[source.module])))].join(" · ")} · {item.suspended ? label("已暂停", "Paused") : item.schedule.state === 0 ? label("新词", "New") : label("下次 ", "Due ") + new Date(item.schedule.due).toLocaleString(dateLocale)}</p></div><div className="vocabulary-library-definition"><p>{item.meaning || label("待补全释义，暂不进入复习", "Add a meaning to include this word in review")}</p><DictionaryNote card={item} en={en} /><details><summary>{label("例句与来源", "Example and source")}</summary><p lang="en">{item.example || label("暂无例句", "No example saved")}</p>{item.sources.map((source, index) => <p key={index}><UiText text={originLabels[source.module]} />{source.context ? `: ${source.context}` : source.label ? `: ${source.label}` : ""}</p>)}</details><div className="vocabulary-actions"><button disabled={busy} onClick={() => void personal(item, !item.deckIds.includes("personal"))} className="piano-text-button">{label(item.deckIds.includes("personal") ? "移出生词库" : "加入生词库", item.deckIds.includes("personal") ? "Remove from library" : "Save to library")}</button><button disabled={busy} onClick={() => setEditing({ id: item.id, word: item.word, meaning: item.meaning, example: item.example, phonetic: item.phonetic })} className="piano-text-button">{label("编辑", "Edit")}</button>{(!item.meaning || item.dictionary?.fields.includes("meaning")) && <button disabled={busy} onClick={() => void explain(item)} className="piano-text-button">{label(item.meaning ? "AI 语境释义" : "AI 补全释义", item.meaning ? "Explain in context" : "Generate meaning")}</button>}<button disabled={busy} onClick={() => void suspend(item)} className="piano-text-button">{label(item.suspended ? "恢复复习" : "暂停复习", item.suspended ? "Resume review" : "Pause review")}</button></div></div></article>)}</div>
      {!cardsLoading && !cards.length && <div className="vocabulary-empty"><h2>{label("这里还没有单词", "No words found")}</h2><p>{label("试试其他搜索内容、手动添加，或从听、说、读中收藏。", "Try a different search, add a word, or save one while listening, speaking or reading.")}</p></div>}
      <div className="vocabulary-pagination"><p>{label(`共 ${total} 个词 · 第 ${page + 1} 页`, `${total} words · Page ${page + 1}`)}</p><div className="vocabulary-actions"><button disabled={!page || busy || cardsLoading} onClick={() => setPage(value => value - 1)} className="piano-text-button">{label("上一页", "Previous")}</button><button disabled={(page + 1) * 30 >= total || busy || cardsLoading} onClick={() => setPage(value => value + 1)} className="piano-text-button">{label("下一页", "Next")}</button></div></div>
      <p className="vocabulary-footnote">{label("词库保存在本机。AI 补全使用全局模型；释义可手动核对。暂停复习会保留卡片与进度。", "Your library is saved locally. Meaning generation uses your configured model; you can edit its result. Pausing preserves the card and its progress.")}</p>
    </section>}
    {view === "books" && <WordbookShelf onStart={id => { setDeck(id); setView("review"); setPage(0); setMessage("已打开本地词书，可以开始学习。"); }} />}
    {view === "import" && <DeckImporter onImported={id => { setDeck(id); setPage(0); setMessage("词书已导入，可切换到开始复习或全部词汇查看。"); }} />}
    <details className="vocabulary-settings" id="vocabulary-settings"><summary>{label("复习设置与板块联动", "Review settings and connections")}</summary><p>{label("单词示范按当前 Kokoro 音色在本机生成并缓存，可选择单词的不同读法。", "Word references are generated and cached locally with your selected Kokoro voice. Alternative lexical readings remain selectable.")}</p><form onSubmit={event => void settings(event)}><fieldset disabled={locked}><label>{label("每日新词上限", "Daily new-word limit")}<input className="piano-field" type="number" min={0} max={100} value={dailyNew} onChange={event => setDailyNew(Number(event.target.value))} /></label><label>{label("目标记忆率（%）", "Target retention (%)")}<input className="piano-field" type="number" min={80} max={97} value={retention} onChange={event => setRetention(Number(event.target.value))} /></label><button className="piano-button" disabled={locked}>{label("保存复习设置", "Save review settings")}</button></fieldset></form><p>{label("默认每天 20 个新词，先复习到期卡片。今日学过、忘记、困难和历史待巩固的词可成为听、读与口语生成的参考。提高目标记忆率通常会增加复习量。", "Default: 20 new words a day, with due cards first. Today's words and those needing review can inform listening, reading and conversation material. Higher target retention usually increases the review workload.")}</p><Link href="/settings/models" className="piano-text-link">{label("全局语言模型设置", "Language model settings")}</Link></details>
  </main>;
}
