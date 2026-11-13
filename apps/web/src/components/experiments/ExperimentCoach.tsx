"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExperimentReplyMode, ExperimentSession, ExperimentSummary } from "@/lib/experiments/types";
import type { CoachFeedback } from "@/lib/models/types";
import { AssessmentResult } from "@/components/speech/AssessmentResult";
import { FreedomAssessmentPanel } from "@/components/speech/FreedomAssessmentPanel";
import { VocabularyCapture } from "@/components/vocabulary/VocabularyCapture";
import { ExperimentRecorder } from "./ExperimentRecorder";
import { ExperimentSpeech } from "./ExperimentSpeech";
import { ExperimentFeedback } from "./ExperimentFeedback";
import { SpeakingTimeFeedback } from "./SpeakingTimeFeedback";
import { SpeakingDock } from "./SpeakingFrame";
import { useSpeakingDisplay } from "./SpeakingDisplay";
import { message, useExperimentApi, useExperimentStatus } from "./client";
import { usePracticeSeed, usePracticeCheckpoint, usePracticeDetail, draftString, draftChoice } from "@/components/learning/PracticeContinuity";

const topics = ["Describing my role at work", "Talking about skiing", "Giving product feedback", "Explaining a weekend trip"];
export function ExperimentCoach({ initialSession, recentSessions }: { initialSession: ExperimentSession | null; recentSessions: ExperimentSummary[] }) {
  const { showTranscriptCorrection } = useSpeakingDisplay();
  const api = useExperimentApi(), { status, refresh } = useExperimentStatus(), pending = useRef(false);
  const seed = usePracticeSeed("speaking", initialSession ? `/speaking/coach?session=${initialSession.id}` : "/speaking/coach");
  const [session, setSession] = useState(initialSession), [topic, setTopic] = useState(draftString(seed, "topic", initialSession?.topic || ""));
  const [mode, setMode] = useState<ExperimentReplyMode>(draftChoice(seed, "mode", ["target", "freedom"], initialSession ? initialSession.replyMode || "freedom" : "target"));
  const [reply, setReply] = useState(draftString(seed, "reply", initialSession?.turns.at(-1)?.reply || "")), [audio, setAudio] = useState<Blob | null>(null), [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [recorderKey, setRecorderKey] = useState(0), [autoplayId, setAutoplayId] = useState("");
  const [feedbackStates, setFeedbackStates] = useState<Record<string, string>>({}), [replyAudios, setReplyAudios] = useState<Record<string, string>>({});
  const audioUrls = useRef(new Map<string, string>()), feedbackSequence = useRef(0), feedbackRequests = useRef(new Map<string, number>());
  usePracticeCheckpoint("speaking", session ? `/speaking/coach?session=${session.id}` : "/speaking/coach", { topic, mode, reply }, Boolean(session || topic.trim()), Boolean(busy) || recording);
  useEffect(() => { const urls = audioUrls.current; return () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); }; }, []);
  const receiveAudio = useCallback((blob: Blob | null) => setAudio(blob), []);
  const current = session?.turns.at(-1), scored = session?.turns.filter(turn => turn.assessment) || [];
  const average = scored.length ? Math.round(scored.reduce((sum, turn) => sum + turn.assessment!.overallScore, 0) / scored.length) : 0;
  const [replyExpanded, setReplyExpanded] = usePracticeDetail<boolean>("coach-reply-expanded", false);
  function retainAudio(turnId: string, blob?: Blob) {
    const old = audioUrls.current.get(turnId); if (old) URL.revokeObjectURL(old);
    if (blob) audioUrls.current.set(turnId, URL.createObjectURL(blob)); else audioUrls.current.delete(turnId);
    setReplyAudios(Object.fromEntries(audioUrls.current));
  }
  function reset() {
    feedbackRequests.current.clear(); window.dispatchEvent(new Event("experiment-audio-stop"));
    for (const url of audioUrls.current.values()) URL.revokeObjectURL(url); audioUrls.current.clear();
    setReplyAudios({}); setSession(null); setReply(""); setAudio(null); setError(""); setFeedbackStates({}); setRecorderKey(key => key + 1); setAutoplayId("");
    window.history.replaceState(null, "", "/speaking/coach");
  }
  async function feedback(target: ExperimentSession, turnId: string) {
    const stamp = ++feedbackSequence.current;
    feedbackRequests.current.set(turnId, stamp);
    const replyRevision = target.turns.find(turn => turn.id === turnId)?.replyRevision;
    setFeedbackStates(previous => ({ ...previous, [turnId]: "loading" }));
    try {
      const value = await api<{ enabled: boolean; feedback?: CoachFeedback }>("feedback", { sessionId: target.id, turnId });
      if (feedbackRequests.current.get(turnId) !== stamp) return;
      setFeedbackStates(previous => ({ ...previous, [turnId]: value.enabled ? "" : "自动评论已关闭，可在设置中开启。" }));
      if (value.feedback) setSession(previous => previous?.id === target.id ? { ...previous, turns: previous.turns.map(turn => turn.id === turnId && turn.replyRevision === replyRevision ? { ...turn, feedback: value.feedback! } : turn) } : previous);
    } catch (failure) { if (feedbackRequests.current.get(turnId) === stamp) setFeedbackStates(previous => ({ ...previous, [turnId]: message(failure) })); }
  }
  async function generate() {
    if (pending.current || recording) return;
    pending.current = true; setError(""); setBusy(current ? "正在生成下一轮…" : "正在开启话题…");
    try {
      const target = session || (await api<{ session: ExperimentSession }>("sessions", { topic, mode })).session;
      setSession(target);
      window.history.replaceState(null, "", `/speaking/coach?session=${target.id}`);
      const value = await api<{ session: ExperimentSession }>("coach", { sessionId: target.id, revision: target.revision, mode });
      setSession(value.session); setReply(""); setAudio(null); setRecorderKey(key => key + 1); setAutoplayId(value.session.turns.at(-1)!.id);
      window.history.replaceState(null, "", `/speaking/coach?session=${value.session.id}`);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(""); pending.current = false; }
  }
  async function saveReply(blob?: Blob, confirmedText = false) {
    if (!session || !current || pending.current) return;
    pending.current = true; setError(""); setBusy(blob ? mode === "target" ? "正在检查目标句发音…" : "正在识别回答并检查发音…" : "正在保存文字回答…");
    try {
      let body: FormData | Record<string, unknown> = { sessionId: session.id, turnId: current.id, revision: session.revision, mode, reply };
      if (blob) {
        body = new FormData(); body.set("audio", blob, blob instanceof File ? blob.name : "reply.wav");
        body.set("sessionId", session.id); body.set("turnId", current.id); body.set("revision", String(session.revision)); body.set("mode", mode);
        if (confirmedText && mode === "freedom" && reply.trim()) body.set("reply", reply);
      }
      const value = await api<{ session: ExperimentSession }>("coach-reply", body);
      setSession(value.session); setReply(value.session.turns.at(-1)!.reply || ""); retainAudio(current.id, blob);
      void feedback(value.session, current.id);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(""); }
  }
  async function retry() {
    if (!session || !current || pending.current || recording) return;
    pending.current = true; setBusy("准备重新回答…"); setError("");
    try {
      const value = await api<{ session: ExperimentSession }>("coach-reply", { action: "retry", sessionId: session.id, turnId: current.id, revision: session.revision });
      feedbackRequests.current.delete(current.id);
      setSession(value.session); setReply(""); setAudio(null); retainAudio(current.id); setFeedbackStates(previous => ({ ...previous, [current.id]: "" })); setRecorderKey(key => key + 1);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(""); }
  }
  function selectMode(next: ExperimentReplyMode) {
    if (next === "target" && current && !current.suggestedReply) { setError("这条旧口语记录没有示范回答，请继续到下一轮或开启新对话后使用 Targeted。"); return; }
    setMode(next); setAudio(null); setRecorderKey(key => key + 1); setError("");
  }
  return <div className="speaking-page"><div className="speaking-scroll"><div className="speaking-content">
    <div className="speaking-section-head"><h2 lang={current ? "en" : undefined}>{current ? session!.topic : <UiText text="选择一个交流话题" />}</h2><div className="speaking-actions"><Link href="/settings/models" className="piano-text-link"><UiText text="模型设置" /></Link>{session && <button className="piano-text-button" disabled={Boolean(busy)||recording} onClick={reset}><UiText text="开启新对话" /></button>}</div></div>
    {!current && <div className="speaking-form"><label><span className="speaking-label"><UiText text="话题或场景" /></span><UiElement as="input" className="piano-field" value={topic} maxLength={500} disabled={Boolean(session)||Boolean(busy)} onChange={event=>setTopic(event.target.value)} placeholder="例如：大学生活、宏观经济学、周末旅行…" /></label><div className="speaking-actions">{topics.map(value=><button key={value} className="piano-text-button" disabled={Boolean(session)||Boolean(busy)} onClick={()=>setTopic(value)}><UiText text={value} /></button>)}</div></div>}
    <div className="speaking-section-head" style={{marginTop:16}}><div className="speaking-mode-controls"><span><UiText text="回答模式" /></span>{([['target','Targeted · 示范跟读'],['freedom','Freedom · 自由回答']] as const).map(([value,label])=><button key={value} className="piano-button" aria-pressed={mode===value} disabled={Boolean(busy)||recording} onClick={()=>selectMode(value)}><UiText text={label} /></button>)}</div>{!current && <button className="piano-button piano-button--primary" disabled={Boolean(busy)||!topic.trim()||!status?.model.ready} onClick={()=>void generate()}><UiText text={busy||"开始对话"} /></button>}</div>
    <details className="speaking-small speaking-muted"><summary><UiText text="模型与声音状态" /></summary><div className="speaking-service-note"><span><UiText text={status?.model.message||"正在检查语言模型…"} /></span><span><UiText text="发音评分：" /><UiText text={status?.assessment.ready ? "就绪" : "待就绪"} /></span><span><UiText text="语音识别：" /><UiText text={status?.transcription.ready ? "就绪" : "待就绪"} /></span><button className="piano-text-button" onClick={refresh}><UiText text="刷新状态" /></button></div><p><UiText text="发音评估使用时间定位与边界容错，单次录音不超过 30 秒、70 词。" /></p></details>
    {!status?.model.ready && status && <p className="speaking-small speaking-muted"><UiText text="请先在模型设置中连接语言模型，再开始新的对话。" /></p>}
    {scored.length>0 && <p className="speaking-small speaking-muted" style={{marginTop:10}}><UiText text="已评分轮次" /> {scored.length} · <UiText text="平均参考分" /> {average} / 100</p>}
    {busy && <p role="status" className="speaking-notice"><UiText text={busy} /></p>}
    {error && <p role="alert" className="speaking-notice"><UiText text={error} /></p>}
    {current ? <><VocabularyCapture module="speaking" resourceId={session!.id} appearance="piano"><div aria-label="口语对话内容">{session!.turns.map((turn,index)=><article className="speaking-turn" key={turn.id}>
      <details open={turn.id===current.id}><summary><UiText text="第 " />{index+1}<UiText text=" 轮" /> · {turn.id===current.id ? <UiText text="当前对话" /> : <UiText text="查看对话与反馈" />}</summary>
        <div className="speaking-turn-header"><p>AI · {turn.model}</p><ExperimentSpeech appearance="piano" text={turn.question} label="播放教练的话" autoPlay={turn.id===autoplayId} /></div><p lang="en" className="speaking-turn-question">{turn.question}</p>
        {!turn.reply && turn.id===current.id && mode==="target" && <div className="speaking-turn-reply"><p><UiText text="请完整读出这句回答" /></p><p lang="en">{turn.suggestedReply}</p><ExperimentSpeech appearance="piano" text={turn.suggestedReply||""} label="听目标回答" /></div>}
        {turn.reply ? <><div className="speaking-turn-reply"><p>YOU · {(turn.replyMode||"freedom")==="target" ? "Targeted" : "Freedom"}</p><p lang="en">{turn.reply}</p>{replyAudios[turn.id] && <UiElement as="audio" controls src={replyAudios[turn.id]} aria-label={`第 ${index+1} 轮我的录音`} onPlay={()=>window.dispatchEvent(new Event("experiment-audio-stop"))} />}</div>
          {turn.assessment?.evaluation ? <SpeakingTimeFeedback key={`${turn.id}:${turn.replyRevision}`} evaluation={turn.assessment.evaluation} /> : <div className="speaking-legacy">{turn.replyMode==="target" && turn.assessment ? <AssessmentResult assessment={turn.assessment} showActions={false} onRetry={()=>void retry()} onNext={()=>void generate()} /> : <FreedomAssessmentPanel transcript={turn.reply} assessment={turn.assessment||null} />}</div>}
          {turn.assessmentError && <p role="alert" className="speaking-notice"><UiText text={turn.assessmentError} /></p>}
          <section className="speaking-section"><div className="speaking-section-head"><h3><UiText text="回答辅导" /></h3><button className="piano-text-button" disabled={feedbackStates[turn.id]==="loading"} onClick={()=>void feedback(session!,turn.id)}><UiText text={turn.feedback ? "重新生成建议" : "生成回答建议"} /></button></div>{turn.feedback && <ExperimentFeedback feedback={turn.feedback} />}{feedbackStates[turn.id] && <p role="status" className="speaking-small speaking-muted"><UiText text={feedbackStates[turn.id]==="loading" ? "正在生成建议，可以先查看发音结果。" : feedbackStates[turn.id]} /></p>}</section>
        </> : <p className="speaking-empty"><UiText text={mode==="target" ? "听完示范后，在下方开始录音。" : "用自己的话回答。停止录音后会识别实际内容，并从音频检查发音；你也可以核对文字或直接输入。"} /></p>}
      </details>
    </article>)}</div></VocabularyCapture>
      {mode==="freedom" && <details className="speaking-section" open={replyExpanded} onToggle={event => setReplyExpanded(event.currentTarget.open)}><summary><UiText text={showTranscriptCorrection ? "输入回答 / 核对识别文字" : "输入文字回答"} /></summary><label><span className="speaking-label"><UiText text="英文回答" /></span><UiElement as="textarea" lang="en" rows={3} maxLength={6000} value={reply} disabled={Boolean(busy)||recording} className="piano-field" placeholder="Type your answer in English…" onChange={event=>setReply(event.target.value)} /></label><div className="speaking-actions" style={{marginTop:12}}><button className="piano-button" disabled={Boolean(busy)||recording||!reply.trim()} onClick={()=>void saveReply()}><UiText text="提交文字回答" /></button>{showTranscriptCorrection && <button className="piano-button" disabled={Boolean(busy)||recording||!reply.trim()||!audio} onClick={()=>void saveReply(audio!,true)}><UiText text="按核对文字重查发音" /></button>}</div><p className="speaking-small speaking-muted"><UiText text="仅文字回答生成表达辅导；发音评分需要本轮的真实录音。" /></p></details>}
      <p className="speaking-small speaking-muted speaking-section"><UiText text="评分为练习参考。对话、反馈和评分独立保存在口语学习记录中；历史不保存录音。" /></p>
    </> : <section className="speaking-section"><h2><UiText text="最近对话" /></h2>{recentSessions.slice(0,5).map(item=><Link className="speaking-history-row" key={item.id} href={`/speaking/coach?session=${item.id}`}><div><h3 lang="en">{item.topic}</h3><p>{item.replies}<UiText text=" 轮回答 · 恢复对话 →" /></p></div></Link>)}{!recentSessions.length && <p className="speaking-empty"><UiText text="选择话题即可开始，练习会自动保存。" /></p>}</section>}
  </div></div>
    {current && <SpeakingDock><div className="speaking-dock-line"><strong><UiText text="本轮录音 · " />{mode==="target" ? "Targeted" : "Freedom"}</strong><ExperimentRecorder appearance="piano" showPlayback={true} key={recorderKey} disabled={Boolean(busy)} onAudio={receiveAudio} onRecording={setRecording} onRecorded={blob=>void saveReply(blob)} /><button className="piano-button" disabled={!audio||recording||Boolean(busy)} onClick={()=>void saveReply(audio!)}><UiText text="检查本次回答" /></button><button className="piano-text-button" disabled={Boolean(busy)||recording||!current.reply} onClick={()=>void retry()}><UiText text="重新回答" /></button><button className="piano-button piano-button--primary" disabled={Boolean(busy)||recording||!current.reply||session!.turns.length>=40} onClick={()=>void generate()}><UiText text="下一轮" /></button></div><p className="speaking-dock-note"><UiText text={busy||"手动停止录音后自动分析；导入录音后点击检查。"} /><UiText text="支持拖入录音，最大 25 MB。" /></p></SpeakingDock>}
  </div>;
}
