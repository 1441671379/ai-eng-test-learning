"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { readLocalStorage } from "@/lib/browser-storage";
import type { LearningLevel } from "@/lib/learning-generation";
import type { PublicListeningLesson, ListeningSummary } from "@/lib/listening";
import { LISTENING_COLLAPSE_OFFSET, LISTENING_EXPAND_OFFSET, listeningPlayerCompact } from "@/lib/listening-scroll";
import { VocabularyCapture } from "@/components/vocabulary/VocabularyCapture";
import { PianoIcon } from "@/components/ui/piano-icon";
import { PracticeReview } from "@/components/learning/PracticeReview";
import { ListeningAudio } from "./ListeningAudio";
import { ListeningDiscussion } from "./ListeningDiscussion";
import { getListeningCopy, listeningErrorMessage } from "./listening-copy";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber, draftChoice, draftFlag, draftAnswers } from "@/components/learning/PracticeContinuity";

const levels: LearningLevel[] = ["foundation", "standard", "advanced"];
const lengths = ["short", "medium", "long"];
const formats = ["dialogue", "daily", "interview", "science", "podcast"];
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options }), value = await response.json();
  if (!response.ok) throw new Error(value.error || "请求失败，请重试。");
  return value;
}
type Model = { provider: string; model: string; localModel: string; hasApiKey: boolean };

export function ListeningWorkspace({ initialLessonId }: { initialLessonId?: string }) {
  const { locale, t, dateLocale } = useUiLocale(); const copy = getListeningCopy(locale);
  const seed = usePracticeSeed("listening", initialLessonId ? `/listening?id=${initialLessonId}` : "/listening");
  const [topic, setTopic] = useState(draftString(seed, "topic")), [remarks, setRemarks] = useState(draftString(seed, "remarks")), [includeVocabulary, setIncludeVocabulary] = useState(draftFlag(seed, "includeVocabulary", true));
  const [level, setLevel] = useState<LearningLevel>(draftChoice(seed, "level", levels, "standard")), [length, setLength] = useState(draftChoice(seed, "length", lengths, "medium")), [format, setFormat] = useState(draftChoice(seed, "format", formats, "science"));
  const [model, setModel] = useState<Model | null | undefined>(undefined);
  const [lesson, setLesson] = useState<PublicListeningLesson | null>(null), [history, setHistory] = useState<ListeningSummary[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [opening, setOpening] = useState(false), [saving, setSaving] = useState(false), [discussing, setDiscussing] = useState(false);
  const [error, setError] = useState(""), [historyError, setHistoryError] = useState(""), [recordWarning, setRecordWarning] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true), [formOpen, setFormOpen] = useState(draftFlag(seed, "formOpen", !initialLessonId)), [historyOpen, setHistoryOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false), [highlight, setHighlight] = useState<number | null>(null), [keyboardDrawer, setKeyboardDrawer] = useState(false), [compact, setCompact] = useState(false);
  const mounted = useRef(true), openingRequest = useRef<AbortController | null>(null), transcript = useRef<HTMLElement>(null), title = useRef<HTMLHeadingElement>(null), sentinel = useRef<HTMLDivElement>(null);
  const drawerReturn = useRef<HTMLElement | null>(null), transcriptTitle = useRef<HTMLHeadingElement>(null);
  const pendingReviewFocus = useRef(false);
  useEffect(() => {
    if (!lesson?.review || !pendingReviewFocus.current) return;
    pendingReviewFocus.current = false;
    const result = document.getElementById("listening-result");
    result?.focus({ preventScroll: true });
    result?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [lesson]);
  const locked = busy || opening || saving || discussing;
  usePracticeCheckpoint("listening", lesson ? `/listening?id=${lesson.id}` : "/listening", { lessonId: lesson?.id, topic, remarks, level, length, format, includeVocabulary, answers, formOpen, transcriptOpen, highlight }, Boolean(lesson || !initialLessonId && (topic || remarks)), locked);
  const answered = lesson?.questions.filter(question => answers[question.id]?.trim()).length || 0;
  const refreshHistory = useCallback(async () => {
    const value = await json<{ lessons: ListeningSummary[] }>("/api/listening");
    if (mounted.current) { setHistory(value.lessons); setHistoryError(""); }
  }, []);
  const activate = useCallback((value: PublicListeningLesson) => {
    const restoring = seed.lessonId === value.id;
    let draft: Record<string, string> = restoring ? draftAnswers(seed) : {};
    if (!value.review) try {
      const cache = JSON.parse(readLocalStorage(`english-listening-draft:${value.id}`) || "{}");
      if (!restoring) draft = Object.fromEntries(value.questions.filter(question => typeof cache?.[question.id] === "string" && cache[question.id].length <= 120).map(question => [question.id, cache[question.id]]));
    } catch { /* The server owns saved lessons; drafts are optional. */ }
    setLesson(value); setAnswers(value.review ? Object.fromEntries(value.review.questions.map(question => [question.id, question.selected])) : draft);
    setTopic(value.topic); setRemarks(value.remarks); setLevel(value.level); setLength(value.length); setFormat(value.format);
    if (restoring) { setTopic(draftString(seed, "topic", value.topic)); setRemarks(draftString(seed, "remarks", value.remarks)); setLevel(draftChoice(seed, "level", levels, value.level)); setLength(draftChoice(seed, "length", lengths, value.length)); setFormat(draftChoice(seed, "format", formats, value.format)); }
    setFormOpen(restoring && draftFlag(seed, "formOpen")); setHistoryOpen(false); setTranscriptOpen(Boolean(restoring && draftFlag(seed, "transcriptOpen") && value.transcript)); setHighlight(restoring ? draftNumber(seed, "highlight") || null : null); setRecordWarning(""); setDiscussing(false); setCompact(false);
    window.history.replaceState(null, "", `/listening?id=${value.id}`);
    requestAnimationFrame(() => { title.current?.focus({ preventScroll: true }); title.current?.scrollIntoView({ block: "start" }); });
  }, [seed]);
  const openLesson = useCallback(async (id: string) => {
    openingRequest.current?.abort(); const controller = new AbortController(); openingRequest.current = controller; setOpening(true); setError("");
    try { const value = await json<{ lesson: PublicListeningLesson }>(`/api/listening/${id}`, { signal: controller.signal }); if (mounted.current && !controller.signal.aborted) activate(value.lesson); }
    catch (failure) { if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "打开失败。"); }
    finally { if (mounted.current && openingRequest.current === controller) setOpening(false); }
  }, [activate]);
  useEffect(() => {
    mounted.current = true;
    void refreshHistory().catch(() => setHistoryError("历史记录加载失败，请重试。")).finally(() => { if (mounted.current) setLoadingHistory(false); });
    void json<Model>("/api/models/settings").then(value => { if (mounted.current) setModel(value); }).catch(() => { if (mounted.current) setModel(null); });
    if (initialLessonId) void openLesson(initialLessonId);
    return () => { mounted.current = false; openingRequest.current?.abort(); };
  }, [initialLessonId, openLesson, refreshHistory]);
  useEffect(() => {
    if (!lesson) return;
    try { const key = `english-listening-draft:${lesson.id}`; if (lesson.review) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(answers)); }
    catch { /* Optional local answer drafts. */ }
  }, [lesson, answers]);
  useEffect(() => {
    const node = sentinel.current, root = node?.closest(".piano-content"); if (!node || !root) return;
    const observer = new IntersectionObserver(([entry]) => {
      const offset = entry.boundingClientRect.top - root.getBoundingClientRect().top;
      setCompact(current => listeningPlayerCompact(current, offset));
    }, { root, rootMargin: `${compact ? -LISTENING_EXPAND_OFFSET : LISTENING_COLLAPSE_OFFSET}px 0px 0px 0px`, threshold: 0 });
    observer.observe(node); return () => observer.disconnect();
  }, [lesson?.id, compact]);
  useEffect(() => {
    const panel = transcript.current; if (!panel) return;
    if (transcriptOpen && lesson?.transcript) {
      if (!panel.matches(":popover-open")) panel.showPopover();
      const frame = requestAnimationFrame(() => {
        transcriptTitle.current?.focus({ preventScroll: true });
        const paragraph = highlight ? panel.querySelector<HTMLElement>(`[data-paragraph="${highlight}"]`) : null;
        panel.scrollTo({ top: paragraph ? panel.scrollTop + paragraph.getBoundingClientRect().top - panel.getBoundingClientRect().top - 115 : 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (panel.matches(":popover-open")) panel.hidePopover();
  }, [transcriptOpen, lesson?.transcript, highlight]);

  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (locked) return; setBusy(true); setError("");
    try {
      const value = await json<{ lesson: PublicListeningLesson }>("/api/listening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, remarks, level, length, format, includeVocabulary }) });
      if (mounted.current) { activate(value.lesson); await refreshHistory().catch(() => setHistoryError("练习已保存，历史列表刷新失败。")); }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : copy.requestFailed); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function reveal(button: HTMLElement, keyboard: boolean, number?: number) {
    if (!lesson || locked) return;
    drawerReturn.current = button; setKeyboardDrawer(keyboard); setHighlight(number || null); setError("");
    if (lesson.transcript) { setTranscriptOpen(true); return; }
    setSaving(true);
    try { const value = await json<{ lesson: PublicListeningLesson }>(`/api/listening/${lesson.id}/reveal`, { method: "POST" }); if (mounted.current) { setLesson(value.lesson); setTranscriptOpen(true); } }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : copy.requestFailed); }
    finally { if (mounted.current) setSaving(false); }
  }
  async function submit() {
    if (!lesson || locked) return;
    const missing = lesson.questions.find(question => !answers[question.id]?.trim());
    if (!lesson.review && missing) { setError(copy.missing); const node = document.getElementById(`listen-${missing.id}`); node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: "center" }); return; }
    setSaving(true); setError("");
    try {
      const value = await json<{ lesson: PublicListeningLesson; recordWarning?: string }>(`/api/listening/${lesson.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
      if (!mounted.current) return;
      pendingReviewFocus.current = true;
      setLesson(value.lesson); setRecordWarning(value.recordWarning || ""); window.dispatchEvent(new Event("learning-records-updated"));
      await refreshHistory().catch(() => setHistoryError("答题已保存，历史列表刷新失败。"));
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : copy.requestFailed); }
    finally { if (mounted.current) setSaving(false); }
  }
  function closeTranscript() { setTranscriptOpen(false); requestAnimationFrame(() => drawerReturn.current?.focus({ preventScroll: true })); }

  return <div className="learning-page listening-page">
    <header className="listening-heading"><div><h1 ref={title} tabIndex={-1} lang={lesson ? "en" : undefined}>{lesson?.title || copy.title}</h1><p>{lesson ? lesson.topic : copy.intro}</p></div><div className="listening-heading-actions"><button className="piano-button" disabled={locked} aria-expanded={formOpen} aria-controls="listening-generator" onClick={() => setFormOpen(value => !value)}><PianoIcon name="plus" />{copy.newPractice}</button><button className="piano-text-button" disabled={locked} aria-expanded={historyOpen} aria-controls="listening-history" onClick={() => setHistoryOpen(value => !value)}>{copy.history}</button></div></header>
    {formOpen && <section className="listening-generator" id="listening-generator" aria-label={copy.newPractice}><form onSubmit={event => void generate(event)}>
      <div className="listening-generation-grid">
        <label className="listening-topic"><span>{copy.topic}</span><input required maxLength={160} value={topic} disabled={locked} onChange={event => setTopic(event.target.value)} placeholder={copy.topicPlaceholder} className="piano-field" /></label>
        <label className="listening-notes"><span>{copy.notes}</span><input maxLength={100} value={remarks} disabled={locked} onChange={event => setRemarks(event.target.value)} placeholder={copy.notesPlaceholder} className="piano-field" /><small>{copy.notesHint} · {remarks.length}/100 {copy.characters}</small></label>
        <label><span>{copy.level}</span><select value={level} disabled={locked} onChange={event => setLevel(event.target.value as LearningLevel)} className="piano-field">{levels.map((value, index) => <option key={value} value={value}>{copy.levels[index]}</option>)}</select></label>
        <label><span>{copy.length}</span><select value={length} disabled={locked} onChange={event => setLength(event.target.value)} className="piano-field">{lengths.map((value, index) => <option key={value} value={value}>{copy.lengths[index]}</option>)}</select></label>
        <label><span>{copy.format}</span><select value={format} disabled={locked} onChange={event => setFormat(event.target.value)} className="piano-field">{formats.map((value, index) => <option key={value} value={value}>{copy.formats[index]}</option>)}</select></label>
      </div>
      <label className="listening-include"><input type="checkbox" disabled={locked} checked={includeVocabulary} onChange={event => setIncludeVocabulary(event.target.checked)} />{copy.includeWords}</label>
      <div className="listening-generation-footer"><p>{copy.generationNote}<br />{copy.model}: {model === undefined ? copy.modelLoading : !model ? copy.modelUnavailable : `${model.provider === "local" ? copy.local : copy.external} · ${model.provider === "local" ? model.localModel : model.model}${model.provider !== "local" && !model.hasApiKey ? ` · ${copy.keyNeeded}` : ""}`} · <Link href="/settings/models">{copy.modelSettings}</Link></p><button className="piano-button piano-button--primary" disabled={locked || !topic.trim()}>{busy ? copy.generating : copy.generate}<PianoIcon name="arrow-right" /></button></div>
      {busy && <p role="status" className="listening-status">{copy.generatingNote}</p>}
    </form></section>}
    {historyOpen && <section className="listening-history" id="listening-history"><div className="piano-section-heading"><h2>{copy.history}</h2><button className="piano-text-button" disabled={locked} onClick={() => void refreshHistory().catch(() => setHistoryError(copy.historyError))}>{copy.refresh}</button></div>{historyError && <p role="alert">{t(historyError)}</p>}{loadingHistory ? <p role="status">{copy.loading}</p> : !history.length ? <p>{copy.historyEmpty}</p> : <div className="listening-history-list">{history.map(item => <button key={item.id} disabled={locked} aria-current={lesson?.id === item.id ? "true" : undefined} onClick={() => void openLesson(item.id)}><strong lang="en">{item.title}</strong><small>{item.wordCount} {copy.words} · {item.completed ? copy.complete : copy.inProgress} · {new Date(item.generatedAt).toLocaleDateString(dateLocale)}</small></button>)}</div>}</section>}
    {error && <p className="piano-error" role="alert">{listeningErrorMessage(error, locale, t)}</p>}
    {opening && <p className="listening-status" role="status">{copy.opening}</p>}
    {lesson ? <section className="listening-lesson" aria-busy={opening}>
      <div className="listening-metadata"><span>{copy.levels[levels.indexOf(lesson.level)]}</span><span>{copy.formats[formats.indexOf(lesson.format)]}</span><span>{lesson.wordCount} {copy.words}</span><span>{lesson.questions.length} {copy.questions}</span><span>{copy.aiMaterial}</span></div>
      {lesson.remarks && <p className="listening-note">{copy.generationNotes}: {lesson.remarks}</p>}
      <div ref={sentinel} className="listening-player-sentinel" aria-hidden="true" />
      <div className="listening-sticky-player"><ListeningAudio lessonId={lesson.id} compact={compact} /></div>
      <div className="listening-sheet-heading"><div><h2>{copy.answerSheet}</h2><p>{copy.sheetHint}</p></div><span>{answered}/{lesson.questions.length} {copy.answered}</span><button className="piano-text-button" disabled={locked} aria-haspopup="dialog" aria-controls="listening-transcript" aria-expanded={transcriptOpen} onClick={event => void reveal(event.currentTarget, event.detail === 0)}>{!lesson.review && !lesson.transcript ? copy.earlyTranscript : copy.showTranscript}<PianoIcon name="arrow-right" /></button></div>
      {!lesson.review && !lesson.transcript && <p className="listening-note">{copy.earlyHint}</p>}
      {!lesson.review && lesson.revealedAt && <p className="listening-note">{copy.assisted}</p>}
      {lesson.review && <PracticeReview id="listening-result" kind="listening" review={lesson.review} disabled={locked} onSelectQuestion={id => { const node = document.getElementById(`listen-${id}`); node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: "center", behavior: "auto" }); }}><p>{lesson.review.assisted ? copy.assisted : copy.unassisted} · {copy.scoreNote}</p></PracticeReview>}
      <VocabularyCapture module="listening" resourceId={lesson.id} appearance="piano"><div className="listening-question-sheet">{lesson.questions.map((question, index) => {
        const reviewed = lesson.review?.questions.find(value => value.id === question.id);
        return <fieldset key={question.id} className="listening-question" aria-labelledby={`listen-${question.id}`} aria-describedby={`listen-kind-${question.id}`}><legend id={`listen-kind-${question.id}`}><span className="listening-question-number">{index + 1}</span><span>{question.type === "choice" ? copy.choice : copy.gap}</span></legend><h3 id={`listen-${question.id}`} tabIndex={-1} lang="en">{question.prompt}</h3>
          {question.type === "choice" ? <div className="listening-options">{question.options?.map((option, optionIndex) => { const letter = "ABCD"[optionIndex]; return <label key={letter} className="listening-option" data-selected={answers[question.id] === letter}><input type="radio" name={`${lesson.id}-${question.id}`} value={letter} checked={answers[question.id] === letter} disabled={Boolean(lesson.review) || locked} onChange={() => setAnswers(value => ({ ...value, [question.id]: letter }))} /><span className="listening-option-letter">{letter}.</span><span lang="en">{option}</span></label>; })}</div> : <label className="listening-gap"><span id={`listen-answer-${question.id}`} className="sr-only">{index + 1} · {copy.answer}</span><input className="piano-field" aria-labelledby={`listen-${question.id} listen-answer-${question.id}`} maxLength={120} value={answers[question.id] || ""} disabled={Boolean(lesson.review) || locked} onChange={event => setAnswers(value => ({ ...value, [question.id]: event.target.value }))} placeholder={copy.gapPlaceholder} lang="en" /></label>}
          {reviewed && <div className="listening-evidence"><div className="listening-answer-status"><strong><PianoIcon name={reviewed.correct ? "check" : "close"} />{reviewed.correct ? copy.right : copy.wrong}</strong><span>{copy.yourAnswer}: {reviewed.selected || "—"} · {copy.correctAnswer}: <b lang="en">{reviewed.answer}</b></span></div><p>{reviewed.explanation}</p><blockquote lang="en">{reviewed.evidence.quote}</blockquote><button className="piano-text-button" disabled={locked} onClick={event => void reveal(event.currentTarget, event.detail === 0, reviewed.evidence.paragraph)}>{copy.locate} · {reviewed.evidence.paragraph}<PianoIcon name="arrow-right" /></button></div>}
        </fieldset>;
      })}</div></VocabularyCapture>
      {!lesson.review && <div className="listening-submit"><button className="piano-button piano-button--primary" disabled={locked} onClick={() => void submit()}>{saving ? copy.saving : copy.submit}<PianoIcon name="arrow-right" /></button><span>{answered}/{lesson.questions.length} {copy.answered}</span></div>}
      {recordWarning && <p className="piano-error" role="alert">{t(recordWarning)} <button className="piano-text-button" disabled={locked} onClick={() => void submit()}>{copy.sync}</button></p>}
      {lesson.targetWords.length > 0 && <details className="listening-targets"><summary>{copy.targets}</summary><p lang="en">{lesson.targetWords.join(", ")}</p><p>{copy.targetsNote}</p></details>}
      {lesson.review ? <ListeningDiscussion key={lesson.id} lesson={lesson} onUpdate={setLesson} onBusy={setDiscussing} /> : <p className="listening-discussion-locked">{copy.discussLocked}</p>}
      <aside ref={transcript} id="listening-transcript" popover="auto" role="dialog" aria-labelledby="listening-transcript-title" className="listening-transcript" data-keyboard={keyboardDrawer} onToggle={event => { if ((event.nativeEvent as ToggleEvent).newState === "closed") closeTranscript(); }}>
        <div className="listening-transcript-heading"><div><h2 ref={transcriptTitle} tabIndex={-1} id="listening-transcript-title">{copy.transcript}</h2><p lang="en">{lesson.title}</p></div><button className="piano-icon-button" aria-label={copy.close} onClick={closeTranscript}><PianoIcon name="close" /></button></div>
        <p className="listening-note">{copy.transcriptHint}</p>
        <VocabularyCapture module="listening" resourceId={lesson.id} appearance="piano">{lesson.transcript?.map((paragraph, index) => <div key={index} className="listening-transcript-paragraph" data-paragraph={index + 1} data-highlighted={highlight === index + 1}><span aria-label={`${copy.paragraph} ${index + 1}`}>{index + 1}</span><p lang="en">{paragraph}</p></div>)}</VocabularyCapture>
        <button className="piano-text-button listening-transcript-return" onClick={closeTranscript}><PianoIcon name="arrow-left" />{copy.backToQuestion}</button>
      </aside>
    </section> : !opening && <section className="listening-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptyNote}</p></section>}
  </div>;
}
