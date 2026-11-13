"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExperimentSession } from "@/lib/experiments/types";
import { Button } from "@/components/ui/button";
import { VocabularyCapture } from "@/components/vocabulary/VocabularyCapture";
import { ExperimentRecorder } from "./ExperimentRecorder";
import { ExperimentSpeech } from "./ExperimentSpeech";
import { SpeakingTimeFeedback } from "./SpeakingTimeFeedback";
import { SpeakingDock } from "./SpeakingFrame";
import { useSpeakingDisplay } from "./SpeakingDisplay";
import { message, useExperimentApi, useExperimentStatus } from "./client";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber } from "@/components/learning/PracticeContinuity";

const samples = ["I think technology can make education more accessible.", "The weather is beautiful today.", "Economic growth does not always improve everyone's quality of life."];
export function ExperimentPronunciation({ initialSession }: { initialSession: ExperimentSession | null }) {
  const { showTranscriptCorrection } = useSpeakingDisplay();
  const api = useExperimentApi(), { status, refresh } = useExperimentStatus(), pending = useRef(false), player = useRef<HTMLAudioElement | null>(null);
  const seed = usePracticeSeed("speaking", initialSession ? `/speaking/pronunciation?session=${initialSession.id}` : "/speaking/pronunciation");
  const [text, setText] = useState(draftString(seed, "text", initialSession?.topic || samples[0])), [session, setSession] = useState(initialSession), [spoken, setSpoken] = useState(draftString(seed, "spoken"));
  const [audio, setAudio] = useState<Blob | null>(null), [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState(draftNumber(seed, "selected")), [recorderKey, setRecorderKey] = useState(0), [audioUrl, setAudioUrl] = useState("");
  usePracticeCheckpoint("speaking", session ? `/speaking/pronunciation?session=${session.id}` : "/speaking/pronunciation", { text, spoken, selected }, true, busy || recording);
  useEffect(() => {
    if (!audio) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(audio); setAudioUrl(url); return () => URL.revokeObjectURL(url);
  }, [audio]);
  const receiveAudio = useCallback((blob: Blob | null) => { setAudio(blob); setSession(null); setSpoken(""); setError(""); }, []);
  const result = session?.assessment, word = result?.words[selected], flagged = result?.words.filter(item => item.status !== "unflagged").length || 0;
  function changeText(next: string) {
    setText(next); setSession(null); setAudio(null); setSpoken(""); setError(""); setRecorderKey(key => key + 1);
    window.history.replaceState(null, "", "/speaking/pronunciation");
  }
  function retry() {
    setSession(null); setAudio(null); setSpoken(""); setError(""); setRecorderKey(key => key + 1); setSelected(0);
    window.history.replaceState(null, "", "/speaking/pronunciation");
  }
  async function assess(blob = audio, actual = spoken) {
    if (!blob || pending.current || !text.trim()) return;
    pending.current = true; setBusy(true); setError("");
    window.dispatchEvent(new Event("experiment-audio-stop")); player.current?.pause();
    try {
      const body = new FormData(); body.set("audio", blob, blob instanceof File ? blob.name : "sentence.wav"); body.set("text", text); body.set("spoken_text", actual);
      const value = await api<{ session: ExperimentSession }>("assess", body);
      setSession(value.session); setSelected(Math.max(0, value.session.assessment!.words.findIndex(item => item.status !== "unflagged")));
      window.history.replaceState(null, "", `/speaking/pronunciation?session=${value.session.id}`);
    } catch (failure) { setError(message(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="speaking-page"><div className="speaking-scroll"><div className="speaking-content">
    <section className="speaking-form"><div className="speaking-section-head"><h2><UiText text="这次练哪一句？" /></h2><div className="speaking-actions">{samples.map((sample,i)=><button key={sample} className="piano-text-button" disabled={busy||recording} onClick={()=>changeText(sample)}><UiText text="示例 " />{i+1}</button>)}</div></div>
      <label><span className="speaking-label"><UiText text="目标句子" /></span><textarea lang="en" rows={2} maxLength={500} value={text} className="piano-field" disabled={busy||recording} onChange={event=>changeText(event.target.value)} /></label>
      <div className="speaking-section-head"><ExperimentSpeech appearance="piano" key={text} text={text} label="听整句示范" /><p className="speaking-small speaking-muted"><UiText text="单次录音不超过 30 秒，目标不超过 70 词。" /></p></div>
    </section>
    {busy && <p role="status" className="speaking-notice"><UiText text="正在识别录音、定位单词时间并配对音素。" /></p>}
    {error && <p role="alert" className="speaking-notice"><UiText text={error} /></p>}
    {result?.evaluation && <VocabularyCapture module="speaking" resourceId={session!.id} appearance="piano"><SpeakingTimeFeedback key={session!.id} evaluation={result.evaluation}><div className="speaking-actions" style={{marginTop:16}}><button className="piano-button" disabled={busy||recording} onClick={retry}><UiText text="再练一次" /></button></div>{audioUrl ? <UiElement as="audio" ref={player} controls src={audioUrl} aria-label="结果页我的录音" className="mt-3 h-10 w-full max-w-lg" /> : <p className="speaking-small speaking-muted"><UiText text="历史记录保留评估，本次录音仅在当前练习期间可回放。" /></p>}</SpeakingTimeFeedback></VocabularyCapture>}
    <div className="speaking-legacy">    <UiText text={result && !result.evaluation ? <VocabularyCapture module="speaking" resourceId={session!.id} appearance="piano"><UiElement as="section" aria-label="发音练习结果" className="space-y-6 rounded-3xl bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-5"><div className="min-w-0 flex-1"><h2 className="text-xl font-semibold"><UiText text={"本次发音结果"} /></h2><p className="mt-3 font-semibold"><UiText text={result.score >= 85 ? "整体清晰，继续打磨细节。" : result.score >= 65 ? "基本可辨，复核标记的发音。" : "对照示范再练一遍。"} /></p><p className="mt-2 text-sm text-iron-grey"><UiText text={flagged ? `${flagged} 个单词建议复核` : "没有标记出明显的单词疑点"} /></p></div><div className="relative flex h-28 w-28 shrink-0 items-center justify-center"><svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="none" stroke="#ecede6" strokeWidth="7" /><circle cx="50" cy="50" r="43" fill="none" stroke="#355e3b" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${result.score * 2.702} 270.2`} /></svg><div className="text-center"><p className="text-3xl font-semibold"><UiText text={Math.round(result.score)} /></p><p className="text-[10px] text-iron-grey"><UiText text={"参考分 / 100"} /></p></div></div></div>
      <p className="text-xs text-iron-grey"><UiText text={result.phoneSource === "audio" ? "从录音识别音素并与目标句子对齐" : "当前服务返回文字转写对照，音素判断需进一步核对"} /></p>
      <div><p className="mb-3 text-sm"><UiText text={"点击单词查看发音细节。"} /><span className="ml-2 text-xs text-iron-grey"><UiText text={"绿色：未标记 · 橙色：建议复核 · 灰色：判断不确定"} /></span></p><div className="flex flex-wrap gap-2"><UiText text={result.words.map((item, index) => <UiElement as="button" type="button" aria-pressed={index === selected} aria-label={`查看单词 ${item.word} 的发音`} key={index} onClick={() => setSelected(index)} className={`cursor-pointer rounded-xl px-3 py-2 text-lg ${index === selected ? "ring-2 ring-hunter-green ring-offset-2" : ""} ${item.status === "review" ? "bg-orange-100 text-orange-950" : item.status === "uncertain" ? "bg-platinum text-gunmetal" : "bg-yellow-green/25 text-hunter-green"}`}>{item.word}</UiElement>)} /></div></div>
      {word ? <div className="space-y-4 rounded-2xl border border-hunter-green/15 p-5"><h3 className="text-xl font-semibold" lang="en">{word.word}</h3><p className="text-sm leading-6 text-iron-grey"><UiText text={word.status === "unflagged" ? "模型没有标记明显疑点，可结合录音自行核对。" : word.status === "uncertain" ? "模型判断不确定，请先回听，再尝试重读。" : "模型建议复核这个单词，可先对照示范再重读。"} /></p><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-iron-grey"><UiText text={"目标音素"} /></p><p className="mt-1 break-all font-mono text-xl"><UiText text={"/"} />{word.expected || <UiText text="暂无" />}<UiText text={"/"} /></p></div><div><p className="text-xs text-iron-grey"><UiText text={"模型识别的音素"} /></p><p className="mt-1 break-all font-mono text-xl">{word.heard ? `/${word.heard}/` : <UiText text={word.status === "unflagged" ? "未返回单词级明细" : "∅（未对齐到音素）"} />}</p></div></div>
        {word.phones.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs leading-6 text-iron-grey"><UiText text={"音素对照 · 疑点程度是模型内部信号，不是准确率"} /></caption><thead><tr className="border-b border-hunter-green/15"><th className="py-2"><UiText text={"目标"} /></th><th><UiText text={"识别"} /></th><th><UiText text={"疑点程度"} /></th><th><UiText text={"建议"} /></th></tr></thead><tbody>{word.phones.map((phone, i) => <tr key={i} className="border-b border-hunter-green/10"><td className="py-2 font-mono"><UiText text={"/"} />{phone.expected}<UiText text={"/"} /></td><td className="font-mono">{phone.heard || "∅"}</td><td><UiText text={phone.concern === null ? "—" : `${Math.round(phone.concern * 100)}%`} /></td><td><UiText text={phone.concern === null ? "待核对" : phone.concern >= 0.5 ? "重点复核" : phone.concern > 0 ? "轻微疑点" : "匹配"} /></td></tr>)}</tbody></table></div> : null}
        <ExperimentSpeech key={selected + word.word} text={word.word} label="播放这个单词" />
      </div> : null}
      <div className="space-y-3 rounded-2xl bg-vanilla-cream/50 p-4"><p className="text-xs text-iron-grey"><UiText text={"Heard · 识别出的文字（可能有误）"} /></p><p lang="en" className="leading-7">{result.transcript || <UiText text="未识别到文字" />}</p><p className="text-xs text-iron-grey"><UiText text={"识别音素 · 下方数值为音素识别置信度"} /></p><div className="flex flex-wrap gap-2"><UiText text={result.heardPhones.split(/\s+/).filter(Boolean).map((phone, i) => <span key={i} className="rounded-lg bg-white px-2 py-1 text-center"><span className="block font-mono"><UiText text={phone} /></span><span className="block text-[10px] text-iron-grey"><UiText text={result.heardConfidence?.[i] == null ? "—" : `${Math.round(result.heardConfidence[i]! * 100)}%`} /></span></span>)} /></div></div>
      <details className="rounded-2xl bg-vanilla-cream/40 p-4 text-sm"><summary className="cursor-pointer font-semibold"><UiText text={"查看整句音素对照"} /></summary><p className="mt-3 text-xs text-iron-grey"><UiText text={"目标音素"} /></p><p className="mt-1 break-words font-mono leading-7"><UiText text={result.expectedPhones || "暂无"} /></p><p className="mt-3 text-xs text-iron-grey"><UiText text={"录音识别音素"} /></p><p className="mt-1 break-words font-mono leading-7"><UiText text={result.heardPhones || "暂无"} /></p></details>
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy || recording} onClick={retry}><UiText text={"Try again · 再练一次"} /></Button><Button variant="ghost" disabled={!audioUrl || busy || recording} onClick={() => { window.dispatchEvent(new Event("experiment-audio-stop")); if (player.current) { player.current.currentTime = 0; void player.current.play().catch(() => setError("请点击下方播放器回听。")); } }}><UiText text={"Replay my recording · 回听录音"} /></Button></div>
      <UiText text={audioUrl ? <UiElement as="audio" ref={player} controls src={audioUrl} aria-label="结果页我的录音" className="h-10 w-full max-w-lg" /> : <p className="text-xs text-iron-grey"><UiText text={"历史记录保留分析结果；本次录音仅在当前练习期间可回放。"} /></p>} />
      <p className="text-xs leading-6 text-iron-grey"><UiText text={"结果已保存到本机口语记录。发音评分供练习参考。"} /></p>
    </UiElement></VocabularyCapture> : null} /></div>
    {!result && !busy && <p className="speaking-empty"><UiText text="完成一次录音后，逐词反馈、音素明细和本轮发音评分会显示在这里。" /></p>}
    {showTranscriptCorrection && <details className="speaking-section"><summary><UiText text="识别有误？核对实际读出的文字（可选）" /></summary><label><span className="speaking-label"><UiText text="实际说出的文字（可选）" /></span><textarea lang="en" rows={2} maxLength={600} value={spoken} disabled={busy||recording} onChange={event=>setSpoken(event.target.value)} className="piano-field" /></label><p className="speaking-small speaking-muted"><UiText text="留空时自动识别；识别有误时可填写实际说出的内容后重新检查，漏读的词不要补入。" /></p><button className="piano-button" disabled={busy||recording||!audio||!text.trim()} onClick={()=>void assess()}><UiText text="按核对文字重新检查" /></button></details>}
    <div className="speaking-service-note"><span><UiText text="发音服务：" /><UiText text={status?.assessment.ready ? "已连接" : "等待就绪"} /></span><button className="piano-text-button" onClick={refresh}><UiText text="刷新状态" /></button></div>
  </div></div><SpeakingDock><div className="speaking-dock-line"><strong><UiText text="练习这句话" /></strong><ExperimentRecorder appearance="piano" key={recorderKey} disabled={busy||!text.trim()} showPlayback={true} onAudio={receiveAudio} onRecording={setRecording} onRecorded={blob=>void assess(blob,"")} /><button className="piano-button" disabled={busy||recording||!audio||!text.trim()} onClick={()=>void assess()}><UiText text={busy ? "正在分析录音…" : "检查本次发音"} /></button></div><p className="speaking-dock-note"><UiText text="手动停止录音后自动分析；导入录音后点击检查。" /><UiText text="支持拖入录音，最大 25 MB。" /></p></SpeakingDock></div>;
}
