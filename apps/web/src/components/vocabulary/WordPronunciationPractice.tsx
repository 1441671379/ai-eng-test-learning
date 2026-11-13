"use client";

import { UiText, useUiLocale } from "@/components/i18n/UiLocale";


import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useAudioRecorder } from "@/hooks/speech/useAudioRecorder";
import type { PronunciationAssessment } from "@/lib/speech/types";
import { phonemeFeedbackLabel, pronunciationNotice, wordFeedbackLabel } from "@/lib/speech/feedback";
import { WordAudio } from "./WordAudio";
import type { WordAccent } from "@/lib/word-audio";


function Practice({ cardId, word, accent, download }: { cardId: string; word: string; accent: WordAccent; download: boolean }) {
  const { locale } = useUiLocale();
  const { audioBlob, audioUrl, clearRecording, error: recordingError, isRecording, startRecording, stopRecording } = useAudioRecorder();
  const [starting, setStarting] = useState(false), [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  const pending = useRef(false), submitted = useRef<Blob | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const submitRecording = useEffectEvent((blob: Blob) => { void assess(blob); });
  useEffect(() => {
    if (!audioBlob || isRecording || submitted.current === audioBlob) return;
    submitted.current = audioBlob;
    submitRecording(audioBlob);
  }, [audioBlob, isRecording]);

  async function record() {
    window.dispatchEvent(new Event("english-stop-word-audio"));
    setStarting(true); setAssessment(null); setError("");
    try { await startRecording(); }
    finally { if (mounted.current) setStarting(false); }
  }
  async function assess(blob = audioBlob) {
    if (!blob || pending.current) return;
    pending.current = true;
    const request = new AbortController(); controller.current = request;
    setAssessing(true); setError(""); setAssessment(null);
    const form = new FormData();
    form.set("cardId", cardId); form.set("audio", blob, "word-attempt.wav");
    try {
      const response = await fetch("/api/vocabulary/pronunciation", { method: "POST", body: form, signal: request.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发音评分失败，请稍后重试。");
      if (!mounted.current || request.signal.aborted) return;
      setAssessment(result); window.dispatchEvent(new Event("learning-records-updated"));
    } catch (failure) {
      if (mounted.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : "发音评分失败，请重试。");
    } finally { pending.current = false; if (mounted.current && !request.signal.aborted) setAssessing(false); }
  }
  const en = locale === "en";
  const label = (zh: string, english: string) => en ? english : zh;
  return <div className="vocabulary-practice-content">
    <p>{label("清晰读出", "Read clearly:")} <strong lang="en">{word}</strong> {label("。手动停止录音后自动评分。关闭练习或切换词卡会释放麦克风。", "Stop recording manually to submit automatically. Closing practice or changing cards releases the microphone.")}</p>
    <div className="vocabulary-actions"><WordAudio text={word} label="听示范发音" mode="word" accent={accent} download={download} /><button type="button" disabled={starting || assessing} onClick={() => isRecording ? stopRecording() : void record()} className="piano-button">{starting ? label("正在请求麦克风…", "Requesting microphone…") : isRecording ? label("停止并评分", "Stop and assess") : audioBlob ? label("重新录音", "Record again") : label("开始录音", "Start recording")}</button>
      {error && audioBlob && !isRecording && <button type="button" disabled={starting || assessing} onClick={() => void assess()} className="piano-text-button">{label("重试发音评分", "Retry assessment")}</button>}
      {audioBlob && !isRecording && <button type="button" disabled={assessing} className="piano-text-button" onClick={() => { clearRecording(); setAssessment(null); setError(""); }}>{label("清除录音", "Clear recording")}</button>}
    </div>
    {isRecording && <p role="status">{label("录音中，读完后点击“停止并评分”。", "Recording. Select Stop and assess when you finish.")}</p>}
    {audioUrl && <audio aria-label={label("回听我的单词录音", "My word recording")} controls src={audioUrl} />}
    {(error || recordingError) && <p role="alert" className="vocabulary-notice"><UiText text={error || recordingError} /></p>}
    {assessing && <p role="status">{label("正在使用本地发音模型评分…", "Assessing with the local pronunciation model…")}</p>}
    {assessment && <div className="vocabulary-practice-result" aria-label={label("单词发音结果", "Word pronunciation result")} aria-live="polite">
      <div className="vocabulary-panel-title"><h4>{label("发音参考分", "Pronunciation reference score")}</h4><p className="vocabulary-practice-score">{Math.round(assessment.overallScore)} <small>/ 100</small></p></div>
      <p className="vocabulary-phone-sequence"><span>{label("目标音素", "Target phonemes")}</span>{assessment.ipaTarget || label("暂无目标音素", "No target phonemes available")}</p>
      <p className="vocabulary-phone-sequence"><span>{label("实际识别音素", "Recognised phonemes")}</span>{assessment.transcript || label("未识别到清晰音素", "No clear phonemes recognised")}</p>
      {pronunciationNotice(assessment) && <p role="status" className="vocabulary-notice"><UiText text={pronunciationNotice(assessment)} /></p>}
      <div className="vocabulary-verdicts">{assessment.highlights.map((item, index) => <span key={index} title={item.feedback} data-status={item.uncertain ? "uncertain" : item.status}><span lang="en">{item.text}</span> · <UiText text={wordFeedbackLabel(item)} /></span>)}</div>
      <p>{assessment.summary}</p>
      <details><summary>{label("查看逐音素反馈", "View phoneme feedback")}</summary><div className="vocabulary-phone-grid">{assessment.phonemes.map((item, index) => <div key={index} data-status={item.uncertain ? "uncertain" : item.status}><strong lang="en">{item.symbol}</strong> · <UiText text={phonemeFeedbackLabel(item)} /><p>{label("目标", "Target")}: {item.expected}<br />{label("识别", "Heard")}: {item.heard || label("未检测到", "Not detected")}</p></div>)}</div></details>
      <p>{label("下一次练习", "Next practice")}: <UiText text={assessment.nextStep} /></p>
      <p className="vocabulary-footnote">{label("发音分数仅供学习参考，独立于记忆自评，不改变复习排期。", "Pronunciation is a learning reference, separate from memory ratings; it does not change your review schedule.")}</p>
      {assessment.recordWarning ? <p role="alert"><UiText text={assessment.recordWarning} /></p> : <p className="vocabulary-footnote">{label("已保存到学习记录，可重新录音练习。", "Saved to learning records. Record again whenever you wish.")}</p>}
    </div>}
  </div>;
}

export function WordPronunciationPractice({ cardId, word, accent = "us", download = true }: { cardId: string; word: string; accent?: WordAccent; download?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { locale } = useUiLocale(); const en = locale === "en";
  return <div data-pronunciation-practice className="vocabulary-pronunciation">
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)} className="piano-button">{open ? en ? "Close pronunciation practice" : "关闭发音练习" : en ? "Practise pronunciation" : "练习这个词的发音"}</button>
    <p>{en ? "Optional · pronunciation and phoneme feedback." : "可选 · 练习后查看发音与音素反馈。"}</p>
    <div id={panelId}>{open && <Practice key={cardId} cardId={cardId} word={word} accent={accent} download={download} />}</div>
  </div>;
}
