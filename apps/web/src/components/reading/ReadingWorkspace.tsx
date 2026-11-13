"use client";

import { useUiLocale } from "@/components/i18n/UiLocale";

import { readLocalStorage } from "@/lib/browser-storage";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { selectedVocabularyWord } from "@/lib/vocabulary-text";
import { containsWord, type PublicReadingLesson, type ReadingSummary, type SavedWord } from "@/lib/reading";
import { ReadingAudio } from "./ReadingAudio";
import { getPianoCopy } from "@/components/learning/piano-copy";
import { PianoIcon } from "@/components/ui/piano-icon";
import { PracticeReview } from "@/components/learning/PracticeReview";
import { difficultyLabels, type LearningLevel } from "@/lib/learning-generation";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber, draftChoice, draftFlag, draftAnswers } from "@/components/learning/PracticeContinuity";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请重试。");
  return data as T;
}

export function ReadingWorkspace({ initialLessonId }: { initialLessonId?: string }) {
  const { locale, t, dateLocale } = useUiLocale();
  const copy = getPianoCopy(locale);
  const seed = usePracticeSeed("reading", initialLessonId ? `/reading?id=${initialLessonId}` : "/reading");
  const [formOpen, setFormOpen] = useState(draftFlag(seed, "formOpen", !initialLessonId));
  const [historyOpen, setHistoryOpen] = useState(draftFlag(seed, "historyOpen"));
  const [wordsOpen, setWordsOpen] = useState(draftFlag(seed, "wordsOpen"));
  const [questionIndex, setQuestionIndex] = useState(draftNumber(seed, "questionIndex"));
  const [analysisTab, setAnalysisTab] = useState<"questions" | "sentences" | "vocabulary">(draftChoice(seed, "analysisTab", ["questions", "sentences", "vocabulary"], "questions"));
  const [textSize, setTextSize] = useState(draftNumber(seed, "textSize", 17));
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const workspace = useRef<HTMLDivElement>(null);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const returnAnchor = useRef<HTMLButtonElement | null>(null);
  const returnPosition = useRef({ workspace: 0, page: 0 });
  const [topic, setTopic] = useState(draftString(seed, "topic"));
  const [remarks, setRemarks] = useState(draftString(seed, "remarks"));
  const [level, setLevel] = useState<LearningLevel>(draftChoice(seed, "level", ["foundation", "standard", "advanced"], "standard"));
  const [length, setLength] = useState<string>(draftChoice(seed, "length", ["standard", "long"], "standard"));
  const [targetWords, setTargetWords] = useState(draftString(seed, "targetWords"));
  const [includeVocabulary, setIncludeVocabulary] = useState(draftFlag(seed, "includeVocabulary", true));
  const [lesson, setLesson] = useState<PublicReadingLesson | null>(null);
  const [history, setHistory] = useState<ReadingSummary[]>([]);
  const [words, setWords] = useState<SavedWord[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [upgrading,setUpgrading]=useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [wordError, setWordError] = useState("");
  const [wordMessage, setWordMessage] = useState("");
  const [selectedWord, setSelectedWord] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<{ left: number; top: number } | null>(null);
  const [savingWord, setSavingWord] = useState(false);
  const [recordWarning, setRecordWarning] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [modelLabel, setModelLabel] = useState("读取模型设置中…");
  const article = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const openingRequest = useRef<AbortController | null>(null);
  const pendingReviewFocus = useRef(false);
  const pendingQuestionFocus = useRef(false);
  usePracticeCheckpoint("reading", lesson ? `/reading?id=${lesson.id}` : "/reading", { lessonId: lesson?.id, topic, remarks, level, length, targetWords, includeVocabulary, answers, questionIndex, analysisTab, textSize, formOpen, historyOpen, wordsOpen }, Boolean(lesson || !initialLessonId && (topic || remarks)), busy || submitting || opening || upgrading);

  useEffect(() => {
    if (!lesson?.review || !pendingReviewFocus.current) return;
    pendingReviewFocus.current = false;
    const result = document.getElementById("reading-result");
    result?.focus({ preventScroll: true });
    result?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [lesson]);
  useEffect(()=>{
    if(!lesson?.review&&pendingQuestionFocus.current){pendingQuestionFocus.current=false;questionHeading.current?.focus();}
  },[lesson]);

  const refreshHistory = useCallback(async () => {
    const data = await requestJson<{ lessons: ReadingSummary[] }>("/api/reading"); setHistory(data.lessons);
  }, []);
  const refreshWords = useCallback(async () => {
    const data = await requestJson<{ words: SavedWord[] }>("/api/reading/words"); setWords(data.words);
  }, []);
  const activateLesson = useCallback((value: PublicReadingLesson) => {
    const restoring = seed.lessonId === value.id;
    let draft: Record<string, string> = restoring ? draftAnswers(seed) : {};
    if (!value.review) {
      try {
        const saved = JSON.parse(readLocalStorage(`english-reading-draft:${value.id}`) || "{}");
        if (!restoring) draft = Object.fromEntries(value.questions.filter((question) => typeof saved?.[question.id] === "string" && saved[question.id].length <= 120).map((question) => [question.id, saved[question.id]]));
      } catch { /* Browser storage may be unavailable; the saved lesson still opens. */ }
    }
    draft=Object.fromEntries(value.questions.filter(q=>typeof draft[q.id]==="string"&&(q.type!=="choice"||["A","B","C","D"].includes(draft[q.id]))).map(q=>[q.id,draft[q.id]]));
    setLesson(value); setAnswers(value.review ? Object.fromEntries(value.review.questions.map((question) => [question.id, question.selected])) : draft);
    setSelectedWord(""); setSelectionAnchor(null); setHighlight(null); setRecordWarning(""); setWordMessage("");
    setQuestionIndex(restoring ? Math.max(0, Math.min(value.questions.length - 1, draftNumber(seed, "questionIndex"))) : 0); setAnalysisTab(restoring ? draftChoice(seed, "analysisTab", ["questions", "sentences", "vocabulary"], "questions") : "questions"); setFormOpen(restoring && draftFlag(seed, "formOpen")); setHistoryOpen(restoring && draftFlag(seed, "historyOpen")); setEvidenceQuote("");
    setTopic(restoring ? draftString(seed, "topic", value.topic) : value.topic); setRemarks(restoring ? draftString(seed, "remarks", value.remarks ?? "") : value.remarks ?? ""); setLevel(restoring ? draftChoice(seed, "level", ["foundation", "standard", "advanced"], value.level ?? "standard") : value.level ?? "standard"); setLength(restoring ? draftChoice(seed, "length", ["standard", "long"], value.length) : value.length);
    if (workspace.current) workspace.current.scrollTop = 0;
    window.history.replaceState(null, "", `/reading?id=${value.id}`);
  }, [seed]);
  async function upgradeQuestions(){
    if(!lesson||upgrading)return;
    setUpgrading(true);setError("");
    try{const value=await requestJson<{lesson:PublicReadingLesson}>(`/api/reading/${lesson.id}/choice-questions`,{method:"POST"});
      if(mounted.current){pendingQuestionFocus.current=true;setLesson(value.lesson);setAnswers({});setQuestionIndex(0);setAnalysisTab("questions");}
    }catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:copy.requestFailed);}
    finally{if(mounted.current)setUpgrading(false);}
  }
  const openLesson = useCallback(async (id: string) => {
    openingRequest.current?.abort();
    const controller = new AbortController(); openingRequest.current = controller;
    setError(""); setOpening(true);
    try { const data = await requestJson<{ lesson: PublicReadingLesson }>(`/api/reading/${id}`, { signal: controller.signal }); if (mounted.current && !controller.signal.aborted) activateLesson(data.lesson); }
    catch (failure) { if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "打开失败。"); }
    finally { if (mounted.current && openingRequest.current === controller) setOpening(false); }
  }, [activateLesson]);

  useEffect(() => {
    mounted.current = true;
    void refreshHistory().catch(() => setError("历史记录加载失败，请刷新页面重试。")).finally(() => setLoadingHistory(false));
    void refreshWords().catch(() => setWordError("生词本加载失败，请刷新页面重试。"));
    void requestJson<{ provider: string; model: string; localModel: string; hasApiKey: boolean }>("/api/models/settings")
      .then((data) => setModelLabel(data.provider === "local" ? `本地 · ${data.localModel}` : data.hasApiKey ? `外部 API · ${data.model}` : `外部 API · ${data.model} · 请先填写 API Key`))
      .catch(() => setModelLabel("暂时无法读取全局模型配置，请打开设置检查"));
    if (initialLessonId) void openLesson(initialLessonId);
    return () => { mounted.current = false; openingRequest.current?.abort(); };
  }, [initialLessonId, openLesson, refreshHistory, refreshWords]);

  useEffect(() => {
    if (!lesson) return;
    try {
      const key = `english-reading-draft:${lesson.id}`;
      if (lesson.review) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(answers));
    } catch { /* Keep learning available when browser storage is full or disabled. */ }
  }, [lesson, answers]);

  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (opening || busy || submitting || upgrading) return; setError("");
    const targets = targetWords.split(/[,，;；\n]/).map((word) => word.trim()).filter(Boolean);
    if (targets.length > 8) { setError("目标词汇最多 8 个，请用逗号分隔。"); return; }
    setBusy(true);
    try {
      const data = await requestJson<{ lesson: PublicReadingLesson }>("/api/reading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, remarks, level, length, targetWords: targets, includeVocabulary }) });
      if (!mounted.current) return;
      activateLesson(data.lesson);
      await refreshHistory();
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "生成失败。"); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function submit() {
    if (!lesson || opening || busy || submitting || upgrading) return;
    const missing = lesson.questions.findIndex(question => !answers[question.id]?.trim());
    if (!lesson.review && missing >= 0) { selectQuestion(missing); setError(copy.missingAnswer); return; }
    setSubmitting(true); setError("");
    try {
      const data = await requestJson<{ lesson: PublicReadingLesson; recordWarning?: string }>(`/api/reading/${lesson.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
      pendingReviewFocus.current = true;
      setLesson(data.lesson); setRecordWarning(data.recordWarning || "");
      window.dispatchEvent(new Event("learning-records-updated")); await refreshHistory();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "提交失败。"); }
    finally { setSubmitting(false); }
  }
  const captureSelection = useCallback((event: MouseEvent | KeyboardEvent | React.MouseEvent) => {
    if (savingWord || (event.target instanceof Element && event.target.closest("input,textarea,select,button,.reading-word-capture"))) return;
    if (event instanceof KeyboardEvent && !["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !article.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) { setSelectionAnchor(null); return; }
    const word = selectedVocabularyWord(selection.toString());
    if (!word) { setSelectionAnchor(null); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setSelectedWord(word); setWordMessage(""); setWordError("");
    setSelectionAnchor({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 412)), top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 150)) });
    if (event.type === "contextmenu") event.preventDefault();
  }, [savingWord]);
  useEffect(() => {
    document.addEventListener("mouseup", captureSelection);
    document.addEventListener("keyup", captureSelection);
    return () => { document.removeEventListener("mouseup", captureSelection); document.removeEventListener("keyup", captureSelection); };
  }, [captureSelection]);
  useEffect(() => {
    if (!selectionAnchor) return;
    const close = () => setSelectionAnchor(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("scroll", close, true); document.removeEventListener("keydown", escape); window.removeEventListener("resize", close); };
  }, [selectionAnchor]);
  async function addWord(word: string) {
    if (!lesson || savingWord) return;
    setSavingWord(true); setWordError(""); setWordMessage("");
    try {
      const data = await requestJson<{ words: SavedWord[] }>("/api/reading/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word, lessonId: lesson.id }) });
      setWords(data.words); setWordMessage(`已加入生词本：${word}`); setSelectedWord("");
    } catch (failure) { setWordError(failure instanceof Error ? failure.message : "收藏失败。"); }
    finally { setSavingWord(false); }
  }
  async function toggleWord(word: SavedWord) {
    setWordError("");
    try { const data = await requestJson<{ words: SavedWord[] }>("/api/reading/words", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: word.id, mastered: !word.mastered }) }); setWords(data.words); }
    catch (failure) { setWordError(failure instanceof Error ? failure.message : "保存失败。"); }
  }
  function selectQuestion(index: number) {
    setQuestionIndex(index); setHighlight(null); setEvidenceQuote(""); returnAnchor.current = null;
    requestAnimationFrame(() => {
      questionHeading.current?.focus({ preventScroll: true });
      questionHeading.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  }
  function showEvidence(paragraph: number, quote: string, button: HTMLButtonElement) {
    returnAnchor.current = button;
    returnPosition.current = { workspace: workspace.current?.scrollTop ?? 0, page: document.getElementById("learning-content")?.scrollTop ?? 0 };
    setHighlight(paragraph); setEvidenceQuote(quote);
    const target = document.getElementById(`reading-paragraph-${paragraph}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
  function returnToQuestion() {
    workspace.current?.scrollTo({ top: returnPosition.current.workspace });
    document.getElementById("learning-content")?.scrollTo({ top: returnPosition.current.page });
    returnAnchor.current?.focus({ preventScroll: true });
    returnAnchor.current?.scrollIntoView({ block: "nearest" });
    setHighlight(null);
  }

  const locked = opening || busy || submitting || upgrading;
  const question = lesson?.requiresChoiceUpgrade?undefined:lesson?.questions[questionIndex];
  const reviewed = lesson?.review?.questions.find(item => item.id === question?.id);
  const answered = Object.values(answers).filter(value => value.trim()).length;
  const typeNames = { choice: copy.choice, judgment: copy.judgment, gap: locale==="en"?"Historical question":"历史题目" };

  return <main className="learning-page reading-page">
    <div className="reading-heading"><h1 tabIndex={-1}>{copy.reading}</h1><div className="reading-heading-actions"><button className="piano-text-button" aria-expanded={wordsOpen} aria-controls="reading-word-shelf" onClick={() => setWordsOpen(value => !value)}>{copy.savedWords}</button><button className="piano-text-button" aria-expanded={historyOpen} aria-controls="reading-history" onClick={() => setHistoryOpen(value => !value)}>{copy.history}</button><button className="piano-button" disabled={locked} aria-expanded={formOpen} aria-controls="reading-generator" onClick={() => setFormOpen(value => !value)}>{copy.newArticle}<PianoIcon name="plus" /></button></div></div>
    {lesson && <div className="reading-conditions"><span><small>{copy.topicLabel}</small>{lesson.topic}</span><span><small>{copy.difficulty}</small>{t(difficultyLabels[lesson.level ?? "standard"])}</span><span>{lesson.wordCount} {copy.words}</span><button className="piano-text-button" disabled={locked} onClick={() => setFormOpen(value => !value)} aria-expanded={formOpen} aria-controls="reading-generator">{copy.editConditions}</button></div>}
    {formOpen && <form id="reading-generator" className="reading-generator" onSubmit={event => void generate(event)} aria-labelledby="reading-generator-title">
      <div className="reading-panel-title"><h2 id="reading-generator-title">{copy.conditions}</h2>{lesson && <button className="piano-text-button" type="button" onClick={() => setFormOpen(false)}>{copy.hide}</button>}</div>
      <fieldset disabled={locked}><div className="reading-form-grid">
        <label>{copy.topic}<input className="piano-field" required maxLength={160} value={topic} onChange={event => setTopic(event.target.value)} placeholder={copy.topicPlaceholder} /></label>
        <label>{copy.remarks}<input className="piano-field" maxLength={100} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder={copy.remarksPlaceholder} /><small>{copy.remarksHint} · {remarks.length}/100 {copy.characters}</small></label>
        <label>{copy.difficulty}<select className="piano-field" value={level} onChange={event => setLevel(event.target.value as LearningLevel)}>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label>{copy.length}<select className="piano-field" value={length} onChange={event => setLength(event.target.value)}><option value="standard">{copy.standardLength}</option><option value="long">{copy.longLength}</option></select></label>
      </div><div className="reading-topic-suggestions">{["城市绿地与生活质量", "睡眠如何影响记忆", "大学学习与时间管理", "人工智能与工作"].map(item => <button type="button" key={item} className="piano-text-button" onClick={() => setTopic(item)}>{t(item)}</button>)}</div><label className="reading-target-input">{copy.targetWords}<input className="piano-field" value={targetWords} onChange={event => setTargetWords(event.target.value)} maxLength={650} placeholder={copy.targetPlaceholder} /></label><div className="reading-generation-actions"><label className="reading-include-words"><input type="checkbox" checked={includeVocabulary} onChange={event => setIncludeVocabulary(event.target.checked)} />{copy.includeWords}</label><button disabled={locked || !topic.trim()} className="piano-button piano-button--primary" type="submit">{busy ? copy.generating : copy.generate}<PianoIcon name="arrow-right" /></button></div></fieldset>
      <p className="reading-model">{copy.model}: {t(modelLabel)} · <Link href="/settings/models">{copy.modelSettings}</Link></p>{busy && <p role="status" className="reading-model">{copy.generatingNote}</p>}
    </form>}
    {historyOpen && <section id="reading-history" className="reading-history" aria-labelledby="reading-history-title"><div className="reading-panel-title"><h2 id="reading-history-title">{copy.history} · {history.length}</h2><button className="piano-text-button" onClick={() => setHistoryOpen(false)}>{copy.hide}</button></div>{loadingHistory ? <p role="status">{copy.loading}</p> : <div className="reading-history-list">{history.map(item => <button key={item.id} disabled={locked} aria-current={lesson?.id === item.id ? "true" : undefined} onClick={() => void openLesson(item.id)}><strong lang="en">{item.title}</strong><small>{item.wordCount} {copy.words} · {item.completed ? copy.completed : copy.unanswered} · {new Date(item.generatedAt).toLocaleDateString(dateLocale)}</small></button>)}</div>}{!loadingHistory && !history.length && <p className="piano-muted">{copy.historyEmpty}</p>}</section>}
    {opening && <p role="status" className="piano-muted">{copy.opening}</p>}
    {error && <p role="alert" className="piano-error">{t(error)}</p>}
    {lesson ? <>
      <div ref={workspace} className="reading-workspace" aria-label={copy.reading} aria-busy={opening || submitting}>
        <section className="reading-article" aria-labelledby="reading-article-title"><h2 id="reading-article-title" lang="en">{lesson.title}</h2>
          <div className="reading-article-top"><span>{copy.aiMaterial}</span><div className="reading-article-tools"><button className="piano-text-button" onClick={() => setTextSize(value => value === 17 ? 19 : value === 19 ? 21 : 17)} aria-label={`${copy.fontSize}: ${textSize}px`}>Aa</button><Link href={`/speaking/article-reading?lesson=${lesson.id}`} className="piano-text-link">{copy.readAloud}<PianoIcon name="arrow-right" /></Link></div></div>{lesson.remarks && <p className="reading-article-note">{copy.generationNotes}: {lesson.remarks}</p>}
          <article ref={article} lang="en" aria-label={lesson.title} onContextMenu={captureSelection} className="reading-prose" style={{ fontSize: textSize }}>
            {lesson.paragraphs.map((paragraph, index) => { const quoteAt = highlight === index + 1 && evidenceQuote ? paragraph.indexOf(evidenceQuote) : -1; return <div className={`reading-paragraph${highlight === index + 1 ? " reading-paragraph--located" : ""}`} key={index}><span aria-label={`${copy.paragraph} ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><div><p id={`reading-paragraph-${index + 1}`} tabIndex={-1}>{quoteAt >= 0 ? <>{paragraph.slice(0, quoteAt)}<mark>{paragraph.slice(quoteAt, quoteAt + evidenceQuote.length)}</mark>{paragraph.slice(quoteAt + evidenceQuote.length)}</> : paragraph}</p>{highlight === index + 1 && <button className="piano-button reading-return" onClick={returnToQuestion}><PianoIcon name="arrow-left" />{copy.returnQuestion}</button>}</div></div>; })}
          </article>
          <div className="reading-selection"><p>{copy.selectHint}</p><div className="reading-selection-row"><input className="piano-field" aria-label={copy.selectedWord} placeholder={copy.selectedWord} maxLength={80} value={selectedWord} onChange={event => setSelectedWord(event.target.value)} /><button disabled={savingWord || !selectedWord.trim()} className="piano-button" onClick={() => void addWord(selectedWord.trim())}><PianoIcon name="plus" />{savingWord ? copy.savingWord : copy.addWord}</button><button className="piano-text-button" aria-expanded={wordsOpen} aria-controls="reading-word-shelf" onClick={() => setWordsOpen(value => !value)}>{copy.savedWords}</button></div>{wordMessage && <p role="status">{t(wordMessage)}</p>}{wordError && <p role="alert">{t(wordError)}</p>}</div>
          {lesson.targetWords.length > 0 && <details className="reading-targets"><summary>{copy.targets}</summary><ul>{lesson.targetWords.map(word => <li key={word}>{word} · {containsWord(lesson.paragraphs.join(" "), word) ? copy.included : copy.notIncluded}</li>)}</ul></details>}
        </section>
        <aside className="reading-practice" aria-label={copy.questions}>
          <div className="reading-tabs" role="group" aria-label={copy.questions}><button aria-pressed={analysisTab === "questions"} onClick={() => setAnalysisTab("questions")}>{copy.questions}</button>{lesson.review && <><button aria-pressed={analysisTab === "sentences"} onClick={() => setAnalysisTab("sentences")}>{copy.sentences}</button><button aria-pressed={analysisTab === "vocabulary"} onClick={() => setAnalysisTab("vocabulary")}>{copy.vocabulary}</button></>}</div>
          {lesson.review && analysisTab === "questions" && <PracticeReview id="reading-result" kind="reading" review={lesson.review} activeQuestionId={analysisTab === "questions" ? question?.id : undefined} disabled={locked} onSelectQuestion={id => { const index = lesson.questions.findIndex(item => item.id === id); if (index >= 0) { setAnalysisTab("questions"); selectQuestion(index); } }}><p>{copy.scoreNote}</p>{recordWarning && <><p role="alert">{t(recordWarning)}</p><button className="piano-text-button" disabled={locked} onClick={() => void submit()}>{copy.sync}</button></>}</PracticeReview>}
          {analysisTab==="questions"&&lesson.requiresChoiceUpgrade&&<section className="reading-evidence" aria-label={locale==="en"?"Update questions":"更新阅读题目"}><h3>{locale==="en"?"Keep this article. Practise with multiple choice.":"保留这篇文章，改用选择题练习。"}</h3><p>{locale==="en"?"This older practice uses mixed question types. Your current model can create six multiple-choice questions. The article and its audio stay the same.":"这份旧练习使用混合题型。可用当前模型重新生成六道选择题，文章和音频保持不变。"}</p><button className="piano-button piano-button--primary" disabled={locked} onClick={()=>void upgradeQuestions()}>{upgrading?(locale==="en"?"Updating questions…":"正在更新题目…"):(locale==="en"?"Generate multiple-choice questions":"更新为选择题")}</button></section>}
          {analysisTab === "questions" && question && <>
            <div className="reading-question-index"><strong>{copy.question} {questionIndex + 1} / {lesson.questions.length}</strong>{!lesson.review && <span>{answered} / {lesson.questions.length} {copy.answered}</span>}</div>
            {!lesson.review && <nav className="reading-question-nav" aria-label={copy.questions}>{lesson.questions.map((item, index) => <button key={item.id} aria-label={`${copy.question} ${index + 1}`} aria-current={index === questionIndex ? "step" : undefined} data-answered={Boolean(answers[item.id]?.trim())} disabled={locked} onClick={() => selectQuestion(index)}>{index + 1}</button>)}</nav>}
            <fieldset className="reading-question" disabled={locked || Boolean(lesson.review)} aria-labelledby={`reading-question-prompt-${question.id}`} aria-describedby={`reading-question-type-${question.id}`}><legend id={`reading-question-type-${question.id}`}>{typeNames[question.type]}</legend><h3 id={`reading-question-prompt-${question.id}`} lang="en" ref={questionHeading} tabIndex={-1}>{question.prompt}</h3>{question.type === "judgment" && <p className="reading-question-hint">{copy.judgmentHint}</p>}
              {question.type === "gap" ? <p className="reading-answer-summary" lang="en">{reviewed?.selected||"—"}</p> : <div className="reading-options">{(question.type === "choice" ? question.options!.map((text, index) => ({ value: "ABCD"[index], text: `${"ABCD"[index]}. ${text}` })) : ["TRUE", "FALSE", "NOT GIVEN"].map(value => ({ value, text: value }))).map(option => <label className="reading-option" key={option.value} data-selected={answers[question.id] === option.value}><input type="radio" name={`${lesson.id}-${question.id}`} value={option.value} checked={answers[question.id] === option.value} onChange={() => setAnswers(previous => ({ ...previous, [question.id]: option.value }))} /><span lang="en">{option.text}</span></label>)}</div>}
            </fieldset>
            {reviewed && <><p className="reading-answer-summary">{copy.yourAnswer}: {reviewed.selected} · {copy.correctAnswer}: {reviewed.answer}</p><section className="reading-evidence" aria-label={copy.evidence}><div className="reading-evidence-title"><strong><PianoIcon name={reviewed.correct ? "check" : "close"} />{reviewed.correct ? copy.answeredCorrectly : copy.needsReview}</strong><button className="piano-text-button" onClick={event => showEvidence(reviewed.evidence.paragraph, reviewed.evidence.quote, event.currentTarget)}>{copy.locate}</button></div><blockquote lang="en">“{reviewed.evidence.quote}”</blockquote><p>{reviewed.explanation}</p><button className="piano-text-button" onClick={() => setAnalysisTab("sentences")}>{copy.showSentences}</button></section></>}
            <div className="reading-question-bottom"><button className="piano-text-button" disabled={locked || questionIndex === 0} onClick={() => selectQuestion(questionIndex - 1)}><PianoIcon name="arrow-left" />{copy.previous}</button>{questionIndex < lesson.questions.length - 1 ? <button className="piano-button" disabled={locked} onClick={() => selectQuestion(questionIndex + 1)}>{copy.next}<PianoIcon name="arrow-right" /></button> : !lesson.review ? <button className="piano-button piano-button--primary" disabled={locked} onClick={() => void submit()}>{submitting ? copy.saving : copy.submit}</button> : <Link className="piano-text-link" href="/records">{copy.allRecords}</Link>}</div>
          </>}
          {analysisTab === "sentences" && lesson.review?.sentences.map((sentence, index) => <section className="reading-analysis-item" key={index}><button className="piano-text-button" onClick={event => showEvidence(sentence.paragraph, sentence.quote, event.currentTarget)}>{copy.locate} · {String(sentence.paragraph).padStart(2, "0")}</button><p className="reading-analysis-quote" lang="en">{sentence.quote}</p><p>{sentence.translation}</p><p>{sentence.structure}</p></section>)}
          {analysisTab === "vocabulary" && lesson.review?.vocabulary.map(item => <section className="reading-analysis-item" key={item.word}><div className="reading-evidence-title"><h3 lang="en">{item.word}</h3><button className="piano-text-button" disabled={savingWord} onClick={() => void addWord(item.word)}>{copy.addWord}</button></div><p>{item.meaning}</p><p lang="en">{item.example}</p></section>)}
          {!lesson.review && <p className="reading-review-result">{copy.reviewLocked}</p>}
        </aside>
      </div>

      <ReadingAudio key={lesson.id} lessonId={lesson.id} />
    </> : opening ? <div className="piano-skeleton-stack" aria-hidden="true"><div /><div /><div /></div> : <section className="reading-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptyNote}</p><button className="piano-text-button" onClick={() => setHistoryOpen(true)}>{copy.history}<PianoIcon name="arrow-right" /></button></section>}
      {wordsOpen && <section className="reading-word-shelf" id="reading-word-shelf" aria-labelledby="reading-word-title"><div className="reading-panel-title"><h2 id="reading-word-title">{copy.savedWords} · {words.filter(word => !word.mastered).length} {copy.pendingWords}</h2><button className="piano-text-button" onClick={() => setWordsOpen(false)}>{copy.hide}</button></div><p>{copy.wordShelfNote}</p>{wordError && <p role="alert">{t(wordError)} <button className="piano-text-button" onClick={() => void refreshWords().then(() => setWordError("")).catch(() => setWordError(copy.wordsFailed))}>{copy.retry}</button></p>}<div className="reading-word-list">{words.map(word => <div key={word.id}><header><strong lang="en">{word.word}</strong><button className="piano-text-button" onClick={() => void toggleWord(word)}>{word.mastered ? copy.relearn : copy.mastered}</button></header><p lang="en">{word.context}</p><button className="piano-text-button" disabled={locked} onClick={() => void openLesson(word.lessonId)}>{copy.returnArticle}</button></div>)}</div>{!words.length && <p>{copy.noWords}</p>}</section>}
    {selectionAnchor && createPortal(<aside className="reading-word-capture" role="region" aria-label={copy.addWord} style={selectionAnchor} onMouseDown={event => event.preventDefault()}>
      {wordMessage ? <><p role="status">{t(wordMessage)}</p><Link className="piano-text-link" href="/vocabulary?view=personal">{t("打开生词库")}</Link></> : <><strong lang="en">{selectedWord}</strong><button className="piano-button piano-button--primary" disabled={savingWord} onClick={() => void addWord(selectedWord)}>{savingWord ? copy.savingWord : copy.addWord}</button>{wordError && <p role="alert">{t(wordError)}</p>}</>}
      <button className="piano-text-button" disabled={savingWord} onClick={() => setSelectionAnchor(null)}>{t("取消")}</button>
    </aside>, document.body)}
  </main>;
}
