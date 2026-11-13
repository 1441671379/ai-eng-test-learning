"use client";

import { UiText, UiElement, useUiLocale } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { articleSegmentWords, articleTokens, ARTICLE_MAX_CHARACTERS, summarizeArticle, summarizeArticleSegment, type ArticleWord } from "@/lib/experiments/article-reading";
import type { ExperimentSession, ExperimentSummary } from "@/lib/experiments/types";
import type { PublicReadingLesson, ReadingSummary } from "@/lib/reading";
import { ExperimentRecorder } from "./ExperimentRecorder";
import { ExperimentSpeech } from "./ExperimentSpeech";
import { PronunciationReference } from "./PronunciationReference";
import { SpeakingDock } from "./SpeakingFrame";
import { useSpeakingDisplay } from "./SpeakingDisplay";
import { SpeakingPhoneOperations } from "./SpeakingTimeFeedback";
import type { SpeakingEvaluation } from "@/lib/experiments/speaking-evaluation";
import { message, useExperimentApi, useExperimentStatus } from "./client";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber } from "@/components/learning/PracticeContinuity";

export type ArticleSource = { id: string; title: string; text: string };
const example = "Markets bring buyers and sellers together. Prices help people decide what to produce and what to buy. When the price of a product rises, businesses may supply more of it.\n\nHowever, markets do not always work perfectly. Pollution is one example. A factory may create costs that are paid by people who live nearby. Governments can use taxes and rules to help address these costs.";
const colourLabels = { green: "基本正确", red: "需要重练", pending: "未评分" };

export function ArticleReadingExperiment({ initialSession, initialSource, initialSessions }: {
  initialSession: ExperimentSession | null; initialSource: ArticleSource | null; initialSessions: ExperimentSummary[];
}) {
  const { dateLocale, t } = useUiLocale();
  const { showTranscriptCorrection, showParagraphHistory } = useSpeakingDisplay();
  const api = useExperimentApi(), { status, refresh } = useExperimentStatus();
  const seed = usePracticeSeed("speaking", initialSession ? `/speaking/article-reading?session=${initialSession.id}` : initialSource ? `/speaking/article-reading?lesson=${initialSource.id}` : "/speaking/article-reading");
  const [session, setSession] = useState(initialSession), [title, setTitle] = useState(draftString(seed, "title", initialSource?.title || "")), [text, setText] = useState(draftString(seed, "text", initialSource?.text || ""));
  const [lessonId, setLessonId] = useState(draftString(seed, "lessonId", initialSource?.id || "")), [lessons, setLessons] = useState<ReadingSummary[]>([]), [history, setHistory] = useState(initialSessions);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, Math.min((initialSession?.articleReading?.segments.length || 1) - 1, draftNumber(seed, "activeIndex")))), [selectedWord, setSelectedWord] = useState(draftNumber(seed, "selectedWord")), [spoken, setSpoken] = useState(draftString(seed, "spoken"));
  const [corrected, setCorrected] = useState(false), [newAudio, setNewAudio] = useState(false);
  const [busy, setBusy] = useState(false), [recording, setRecording] = useState(false), [error, setError] = useState("");
  const [audios, setAudios] = useState<Record<number, Blob>>({}), [audioUrl, setAudioUrl] = useState(""), [captureKey, setCaptureKey] = useState(0);
  const pending = useRef(false), player = useRef<HTMLAudioElement>(null), resultPanel = useRef<HTMLElement>(null);
  usePracticeCheckpoint("speaking", session ? `/speaking/article-reading?session=${session.id}` : "/speaking/article-reading", { title, text, lessonId, activeIndex, selectedWord, spoken }, Boolean(session || text || title), busy || recording);
  const article = session?.articleReading, segment = article?.segments[activeIndex], summary = article ? summarizeArticle(article) : null;
  const words = segment ? articleSegmentWords(segment) : [], word = words[selectedWord], audio = audios[activeIndex];

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/reading", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("阅读材料列表暂不可用，仍可直接粘贴文章。");
      const value = await response.json(); if (!controller.signal.aborted) setLessons(value.lessons);
    }).catch(failure => { if (!controller.signal.aborted) setError(message(failure)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!audio) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(audio); setAudioUrl(url); return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    const stop = (event: Event) => { if ((event as CustomEvent).detail !== player.current) player.current?.pause(); };
    window.addEventListener("experiment-audio-stop", stop); return () => window.removeEventListener("experiment-audio-stop", stop);
  }, []);
  const receiveAudio = useCallback((blob: Blob | null) => {
    setAudios(previous => { const next = { ...previous }; if (blob) next[activeIndex] = blob; else delete next[activeIndex]; return next; });
    setSpoken(""); setCorrected(false); setNewAudio(Boolean(blob)); setError("");
  }, [activeIndex]);
  function updateSession(next: ExperimentSession) {
    setSession(next);
    const progress = summarizeArticle(next.articleReading!);
    setHistory(previous => [{ id: next.id, kind: next.kind, topic: next.topic, createdAt: next.createdAt, updatedAt: next.updatedAt, replies: 0, score: progress.score }, ...previous.filter(item => item.id !== next.id)].slice(0, 10));
    window.history.replaceState(null, "", `/speaking/article-reading?session=${next.id}`);
  }
  async function importLesson(id: string) {
    if (!id || pending.current) { setLessonId(""); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reading/${encodeURIComponent(id)}`, { cache: "no-store" });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "读取文章失败。");
      const lesson = value.lesson as PublicReadingLesson;
      setTitle(lesson.title); setText(lesson.paragraphs.join("\n\n")); setLessonId(id);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function create() {
    if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try {
      const value = await api<{ session: ExperimentSession }>("article-reading", { title, text, ...(lessonId ? { lessonId } : {}) });
      updateSession(value.session); setActiveIndex(0); setSelectedWord(0); setAudios({}); setSpoken(""); setCorrected(false); setNewAudio(false); setCaptureKey(key => key + 1);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function assess(blob = audio, actual = corrected ? spoken : "") {
    if (!blob || !session || !segment || pending.current) return;
    pending.current = true; setBusy(true); setError(""); window.dispatchEvent(new Event("experiment-audio-stop"));
    try {
      const form = new FormData(); form.set("audio", blob, blob instanceof File ? blob.name : "article-segment.wav");
      form.set("sessionId", session.id); form.set("segmentIndex", String(activeIndex)); form.set("revision", String(segment.revision)); form.set("spoken_text", actual);
      const value = await api<{ session: ExperimentSession; error?: string }>("article-reading", form, "PUT");
      updateSession(value.session);
      const part = value.session.articleReading!.segments[activeIndex];
      setSpoken(part.lastSubmission?.transcript ?? part.attempt?.assessment.transcript ?? "");
      setCorrected(Boolean(actual)); setNewAudio(false); setError(value.error || "");
      const results = articleSegmentWords(value.session.articleReading!.segments[activeIndex]);
      setSelectedWord(Math.max(0, results.findIndex(item => item.colour !== "green")));
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function omission(confirmed: boolean) {
    if (!session || !segment || !word || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const value = await api<{ session: ExperimentSession }>("article-reading", { sessionId: session.id, segmentIndex: activeIndex, revision: segment.revision, wordIndex: selectedWord, confirmed }, "PATCH");
      updateSession(value.session);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function reload() {
    if (!session || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const value = await api<{ session: ExperimentSession }>(`sessions?id=${session.id}`); updateSession(value.session); }
    catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  function choose(index: number, wordIndex = 0) {
    if (busy || recording || pending.current) return;
    if (index === activeIndex) { setSelectedWord(wordIndex); return; }
    window.dispatchEvent(new Event("experiment-audio-stop")); setActiveIndex(index); setSelectedWord(wordIndex); setSpoken(""); setCorrected(false); setNewAudio(false); setError(""); setCaptureKey(key => key + 1);
  }
  function newArticle() {
    window.dispatchEvent(new Event("experiment-audio-stop"));
    setSession(null); setText(""); setTitle(""); setLessonId(""); setActiveIndex(0); setSelectedWord(0); setAudios({}); setSpoken(""); setError(""); setCaptureKey(key => key + 1);
    setCorrected(false); setNewAudio(false);
    window.history.replaceState(null, "", "/speaking/article-reading");
  }

  return <div className="speaking-page speaking-page--article"><div className="speaking-scroll"><div className="speaking-content">
    {error && <div role="alert" className="speaking-notice"><p><UiText text={error} /></p>{session && <button className="piano-text-button" disabled={busy||recording} onClick={()=>void reload()}><UiText text="重新打开当前记录" /></button>}</div>}
    {!article ? <UiElement as="section" className="speaking-form" aria-label="准备朗读文章"><div><h2><UiText text="选择一篇想读的文章" /></h2><p className="speaking-small speaking-muted" style={{marginTop:8}}><UiText text="粘贴英文文章，或从已有阅读材料中导入。开始后自动分段并保存在本机。" /></p></div>
      <label><span className="speaking-label"><UiText text="从阅读材料导入" /></span><select className="piano-field" value={lessonId} disabled={busy} onChange={event=>void importLesson(event.target.value)}><option value=""><UiText text="粘贴自己的文章" /></option>{initialSource&&!lessons.some(item=>item.id===initialSource.id)&&<option value={initialSource.id}>{initialSource.title}</option>}{lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.wordCount} <UiText text="词" /></option>)}</select></label>
      <label><span className="speaking-label"><UiText text="文章标题（可选）" /></span><UiElement as="input" className="piano-field" maxLength={150} value={title} disabled={busy} onChange={event=>{setTitle(event.target.value);setLessonId("");}} placeholder="例如：How markets work" /></label>
      <label><span className="speaking-label"><UiText text="英文文章" /></span><UiElement as="textarea" lang="en" className="piano-field" rows={8} maxLength={ARTICLE_MAX_CHARACTERS} value={text} disabled={busy} onChange={event=>{setText(event.target.value);setLessonId("");}} placeholder="Paste the article you want to read aloud…" /></label>
      <div className="speaking-section-head"><p className="speaking-small speaking-muted">{articleTokens(text).length}<UiText text=" / 2,000 个英文词 · 最多 16,000 字符" /></p><div className="speaking-actions"><button className="piano-button" disabled={busy} onClick={()=>{setText(example);setTitle("How markets work");setLessonId("");}}><UiText text="试用示例文章" /></button><button className="piano-button piano-button--primary" disabled={busy||!text.trim()} onClick={()=>void create()}><UiText text={busy ? "准备文章中…" : "开始朗读练习"} /></button></div></div>
    </UiElement> : <>
      <UiElement as="section" aria-label="全文朗读结果"><div className="speaking-article-summary"><div><h2 lang="en">{article.title}</h2><p><UiText text="已录 " />{summary!.recordedSegments} / {summary!.segmentCount}<UiText text=" 段 · 已评分 " />{summary!.scoredWords} / {summary!.wordCount}<UiText text=" 词" /></p>{article.sourceLessonId && <Link className="piano-text-link" href={`/reading?id=${article.sourceLessonId}`}><UiText text="查看原阅读材料" /></Link>}</div><div className="speaking-article-score" aria-live="polite"><p><UiText text={summary!.complete ? "全文总分" : "已评分部分参考分"} /></p><strong data-testid="article-score">{summary!.score===null ? "—" : summary!.score.toFixed(1)}</strong> / 100</div></div>
      <UiElement as="progress" className="speaking-progress" aria-label="全文评分覆盖率" value={summary!.scoredWords} max={summary!.wordCount} /><div className="speaking-legend"><span className="speaking-green"><UiText text="绿色 · 基本正确 " />{summary!.green}</span><span className="speaking-red"><UiText text="红色 · 需要重练 " />{summary!.red}</span><span><UiText text="未评分" /> {summary!.pending}</span></div><p className="speaking-small speaking-muted" style={{marginTop:10}}><UiText text={summary!.complete ? "全文已完成，可以选择红色单词所在的段落重新练习。" : "全文总分会在全部单词评估完成后显示。未录音、时间定位不足或未分配到音素的词不直接判错，也不计为零分。"} /></p>
      <div className="speaking-actions" style={{marginTop:14}}><button className="piano-text-button" disabled={busy||recording} onClick={newArticle}><UiText text="练习另一篇文章" /></button><button className="piano-text-button" disabled={busy||recording} onClick={()=>void reload()}><UiText text="刷新保存结果" /></button></div></UiElement>
      <UiElement as="section" aria-label="文章与单词标记">{article.segments.map((part,index)=>{
        const results=articleSegmentWords(part), tokens=articleTokens(part.text), partSummary=summarizeArticleSegment(part);
        return <section key={index} data-testid={`article-segment-${index}`} className="speaking-article-segment"><div className="speaking-paragraph-heading"><h3><UiText text="第 " />{index+1}<UiText text=" 段 · " />{part.wordCount}<UiText text=" 词" /></h3><span className="speaking-paragraph-score" data-testid={`article-segment-score-${index}`} aria-live="polite"><UiText text={part.lastSubmission?.status === "failed" && part.attempt ? "上次得分" : partSummary.score !== null && !partSummary.complete ? "已评分部分" : "分段得分"} /> <strong>{partSummary.score === null ? "—" : partSummary.score.toFixed(1)}</strong> / 100</span><button className="piano-text-button" disabled={busy||recording} onClick={()=>choose(index)} aria-pressed={index===activeIndex}><UiText text={index===activeIndex ? "当前练习段落" : "练习这一段"} /></button></div><p lang="en" className="speaking-article-prose">{tokens.map((token,wordIndex)=><Fragment key={wordIndex}><span>{part.text.slice(wordIndex ? tokens[wordIndex-1].end : 0,token.start)}</span><UiElement as="button" type="button" className="speaking-word" data-verdict={results[wordIndex].colour} aria-label={`${token.word}，${t(colourLabels[results[wordIndex].colour])}，第 ${index+1} 段第 ${wordIndex+1} 词`} aria-pressed={index===activeIndex&&wordIndex===selectedWord} disabled={busy||recording} onClick={()=>{choose(index,wordIndex);requestAnimationFrame(()=>resultPanel.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",block:"nearest"}));}}>{token.word}</UiElement></Fragment>)}{part.text.slice(tokens.at(-1)?.end||0)}</p>
          <p className="speaking-small speaking-muted"><UiText text={part.attempt ? `已评 ${results.filter(item=>item.colour!=="pending").length} / ${part.wordCount} 词` : "待录音"} /></p>
          {index===activeIndex && <UiElement as="section" ref={resultPanel} aria-label="当前分段练习">
            {!recording && <fieldset disabled={busy} style={{marginTop:12}}><ExperimentSpeech appearance="piano" key={`${session!.id}:${activeIndex}`} text={segment!.text.trim()} label="听这一段示范" /></fieldset>}
            {busy ? <p role="status" className="speaking-notice"><UiText text="正在识别本次录音并评分，请保留当前页面。" /></p> : (newAudio || segment!.lastSubmission?.status === "failed") && <div aria-live="polite" className="speaking-transcript">
              {newAudio && <p><UiText text="已收到新录音，等待提交。" /><UiText text={segment!.attempt ? "下方为之前保存的评分。" : "提交后将显示本次评分。"} /></p>}
              {segment!.lastSubmission?.status === "failed" && <p className="speaking-red"><UiText text={segment!.attempt ? "本次评分失败，仍显示上次结果。" : "本次评分失败，请重新提交录音。"} /></p>}
            </div>}
            {word && <ArticleWordDetail word={word} evaluation={segment!.attempt?.assessment.evaluation} canConfirm={Boolean(segment!.attempt)&&word.verdict==="unscored"} disabled={busy||recording} onOmission={omission} />}
            {showTranscriptCorrection && <details className="speaking-transcript"><summary><UiText text="识别有误？核对实际读出的文字（可选）" /></summary><label><span className="speaking-label"><UiText text="默认自动识别新录音。仅在转写有误时修改实际读出的内容，漏读词不要补入。修改后重新评分。" /></span><UiElement as="textarea" aria-label="实际读出的文字" lang="en" rows={3} maxLength={600} value={spoken} disabled={busy||recording} onChange={event=>{setSpoken(event.target.value);setCorrected(true);}} className="piano-field" /></label><p className="speaking-small speaking-muted"><UiText text={corrected ? "下次提交将使用你核对后的文字。" : "下次提交将重新自动识别录音。"} /></p><div className="speaking-actions"><button className="piano-button" disabled={busy||recording||!audio} onClick={()=>void assess()}><UiText text="按核对文字重新检查" /></button>{corrected && <button className="piano-text-button" disabled={busy||recording} onClick={()=>{setCorrected(false);setSpoken("");}}><UiText text="恢复自动识别" /></button>}</div></details>}
            {showParagraphHistory && <details className="speaking-transcript"><summary><UiText text="这一段的练习记录（最近 10 次）" /></summary>{segment!.history.length ? <ul>{segment!.history.slice().reverse().map(item=><li key={item.id}>{new Date(item.assessedAt).toLocaleString(dateLocale)} · <UiText text={item.score===null ? "待评估" : `${item.score} 分`} /> · {item.scoredWords} / {segment!.wordCount}<UiText text=" 词" /></li>)}</ul> : <p><UiText text="这一段还没有练习记录。" /></p>}</details>}
          </UiElement>}
        </section>;
      })}</UiElement>
      <details className="speaking-section speaking-small speaking-muted"><summary><UiText text="评分规则与本次参数" /></summary><p><UiText text="总分 = 已匹配音素数 ÷ 已评分词的音素配对操作数 × 100；替换、插入和删除均计入。不是绿色单词所占的比例。确认漏读的词按目标音素数计入，匹配数为 0。" /></p><p><UiText text="匹配率门槛 " />{article.settings.matchThreshold}<UiText text="% · 置信度门槛 " />{article.settings.confidenceThreshold}<UiText text="%（" /><UiText text={article.settings.useConfidenceForColor ? "参与颜色判定" : "仅作提示"} /><UiText text="）。本篇固定使用创建时的评分参数，确保各段一致。数字和标点保留显示，不单独评分。" /></p></details>
    </>}
    <details className="speaking-section"><summary><UiText text="最近的朗读文章" /></summary>{history.length ? history.slice(0,10).map(item=><Link key={item.id} href={`/speaking/article-reading?session=${item.id}`} className="speaking-history-row"><div><h3 lang="en">{item.topic}</h3><p>{new Date(item.updatedAt).toLocaleString(dateLocale)}<UiText text=" · 打开练习与评分 →" /></p></div></Link>) : <p className="speaking-empty"><UiText text="开始一篇文章后，就会出现在这里。" /></p>}</details>
    <div className="speaking-service-note"><span><UiText text="发音服务：" /><UiText text={status?.assessment.ready ? "已连接" : "等待就绪"} /></span><button className="piano-text-button" onClick={refresh}><UiText text="刷新状态" /></button></div>
  </div></div>
  {article && <SpeakingDock><div className="speaking-dock-line"><strong><UiText text="第 " />{activeIndex+1} / {article.segments.length}<UiText text=" 段" /></strong><button className="piano-button" disabled={busy||recording||activeIndex===0} onClick={()=>choose(activeIndex-1)}><UiText text="上一段" /></button><button className="piano-button" disabled={busy||recording||activeIndex===article.segments.length-1} onClick={()=>choose(activeIndex+1)}><UiText text="下一段" /></button><ExperimentRecorder appearance="piano" key={`${session!.id}:${activeIndex}:${captureKey}`} showPlayback={false} disabled={busy} onAudio={receiveAudio} onRecording={setRecording} onRecorded={blob=>void assess(blob,"")} /><button className="piano-button" disabled={busy||recording||!audio} onClick={()=>void assess()}><UiText text={busy ? "正在识别和评分…" : segment!.attempt ? "用本次录音重新评分" : "提交导入录音评分"} /></button></div>{audioUrl&&!recording&&<UiElement as="audio" ref={player} controls src={audioUrl} aria-label="当前段我的录音" className="mt-2 h-9 w-full max-w-lg" onPlay={()=>window.dispatchEvent(new CustomEvent("experiment-audio-stop",{detail:player.current}))} />}<p className="speaking-dock-note"><UiText text="每段建议在 30 秒内完成。手动停止后自动评分，也可导入该段录音。" /><UiText text="支持拖入录音，最大 25 MB。" /></p></SpeakingDock>}
  </div>;
}

function ArticleWordDetail({ word, evaluation, canConfirm, disabled, onOmission }: { word: ArticleWord; evaluation?: SpeakingEvaluation; canConfirm: boolean; disabled: boolean; onOmission: (confirmed: boolean) => Promise<void> }) {
  return <UiElement as="section" aria-label="单词发音详情" className="speaking-word-detail"><div className="speaking-word-head"><h3 lang="en">{word.word}</h3><span className={word.colour==="green" ? "speaking-green" : word.colour==="red" ? "speaking-red" : "speaking-muted"}><UiText text={colourLabels[word.colour]} /></span></div><PronunciationReference appearance="piano" reference={word.pronunciation} />
    <dl className="speaking-metrics"><div><dt><UiText text="音素匹配率" /></dt><dd>{word.matchPercent===null ? "—" : `${Math.round(word.matchPercent)}%`}</dd></div><div><dt><UiText text="单词归属确定性" /></dt><dd><UiText text={({unique:"归属唯一",multiple:"存在边界候选",missing:"缺少可靠时间",unknown:"未提供归属信息"})[word.assignment]} /></dd></div><div><dt><UiText text="音素识别置信度" /></dt><dd>{word.meanConfidence===null ? "—" : `${Math.round(word.meanConfidence)}%`}</dd></div></dl>
    <div className="speaking-phones"><div><h4><UiText text="本次配对采用的参考音素" /></h4><p lang="en">{word.expectedPhones.length ? word.expectedPhones.join(" ") : <UiText text="评分后显示" />}</p></div><div><h4><UiText text="归到这个词的实际音素" /></h4><p lang="en">{word.heardPhones.length ? word.heardPhones.join(" ") : <UiText text="尚无可用音素" />}</p></div></div><p className="speaking-small speaking-muted" style={{marginTop:10}}><UiText text={word.reason} /></p>
    {evaluation && <SpeakingPhoneOperations evaluation={evaluation} wordIndex={word.wordIndex} />}
    {!disabled && <ExperimentSpeech appearance="piano" key={word.word} text={word.word} label="听这个词的示范" />}
    {canConfirm&&<div className="speaking-transcript"><p className="speaking-small speaking-muted"><UiText text="若确实漏读了这个词，可手动确认；否则建议重读这一段。" /></p><button className="piano-button" disabled={disabled} onClick={()=>void onOmission(!word.confirmedOmission)}><UiText text={word.confirmedOmission ? "撤销漏读标记" : "我确认漏读了这个词"} /></button></div>}
  </UiElement>;
}
