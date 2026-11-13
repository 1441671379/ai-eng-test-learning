"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { prepareComparisonAudio } from "@/lib/experiments/tencent-comparison/audio-client";
import { comparisonTokens } from "@/lib/experiments/tencent-comparison/normalize";
import { comparisonMode, detailedComparison, playableRange } from "@/lib/experiments/tencent-comparison/details";
import type { ComparisonRecord, ComparisonSummary, TencentEvaluationMode } from "@/lib/experiments/tencent-comparison/types";
import type { publicTencentConfig } from "@/lib/experiments/tencent-comparison/tencent";
import { ExperimentRecorder } from "./ExperimentRecorder";
import { ExperimentSpeech } from "./ExperimentSpeech";
import { SpeakingDock } from "./SpeakingFrame";
import { TencentConfigForm } from "./TencentConfigForm";
import { ComparisonFeedback } from "./ComparisonFeedback";
import styles from "./ComparisonExperimentOne.module.css";

const endpoint = "/api/experiments/tencent-comparison";
type Config = ReturnType<typeof publicTencentConfig>;
const samples = ["I would like to learn something new today.", "I think these three thin books belong on that shelf.", "beautiful"];
export function ComparisonExperimentOne({ initialRecords, initialConfig, initialRecord = null }: { initialRecords: ComparisonSummary[]; initialConfig: Config; initialRecord?: ComparisonRecord | null }) {
  const { locale, dateLocale } = useUiLocale(), en = locale === "en", t = (zh: string, english: string) => en ? english : zh;
  const [records, setRecords] = useState(initialRecords), [config, setConfig] = useState(initialConfig);
  const [record, setRecord] = useState(initialRecord ? detailedComparison(initialRecord) : null), [text, setText] = useState(initialRecord?.text || samples[0]);
  const [mode, setMode] = useState<TencentEvaluationMode>(initialRecord ? comparisonMode(initialRecord) : 1), [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false), [opening, setOpening] = useState(false), [recording, setRecording] = useState(false), [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState(""), [recorderKey, setRecorderKey] = useState(0), pending = useRef(false), player = useRef<HTMLAudioElement | null>(null), stopAt = useRef<number | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null), playbackGeneration = useRef(0);
  const blocked = busy || opening || recording || savingConfig, count = comparisonTokens(text).length, valid = count > 0 && count <= 30 && (mode !== 4 || count === 1);
  useEffect(() => {
    const stop = () => { playbackGeneration.current++; if (stopTimer.current) clearTimeout(stopTimer.current); player.current?.pause(); };
    window.addEventListener("experiment-audio-stop", stop);
    return () => { stop(); window.removeEventListener("experiment-audio-stop", stop); };
  }, []);
  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store" }), value = await response.json();
    if (!response.ok) throw new Error(value.error); setRecords(value.records); setConfig(value.config);
  }
  function change(next: string, nextMode = mode) {
    window.dispatchEvent(new Event("experiment-audio-stop")); stopAt.current = null; setText(next); setMode(nextMode); setAudio(null); setRecord(null); setError(""); setRecorderKey(key => key + 1);
    window.history.replaceState(null, "", "/speaking/tencent-comparison");
  }
  async function submit(blob = audio) {
    if (!blob || pending.current || !valid) return;
    pending.current = true; setBusy(true); setError(""); player.current?.pause(); window.dispatchEvent(new Event("experiment-audio-stop"));
    try {
      const wav = await prepareComparisonAudio(blob), body = new FormData(); body.set("audio", wav); body.set("text", text); body.set("eval_mode", String(mode));
      const response = await fetch(endpoint, { method: "POST", body }), value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setRecord(detailedComparison(value.record)); window.history.replaceState(null, "", `/speaking/tencent-comparison?record=${value.record.id}`); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("提交失败，请重试。", "Submission failed. Please retry.")); await refresh().catch(() => undefined); }
    finally { pending.current = false; setBusy(false); }
  }
  async function open(id: string) {
    if (blocked || pending.current) return;
    setOpening(true); setError(""); window.dispatchEvent(new Event("experiment-audio-stop"));
    try {
      const response = await fetch(`${endpoint}?id=${id}`, { cache: "no-store" }), value = await response.json(); if (!response.ok) throw new Error(value.error);
      const loaded = detailedComparison(value.record); setRecord(loaded); setText(loaded.text); setMode(comparisonMode(loaded)); setAudio(null); setRecorderKey(key => key + 1); stopAt.current = null;
      window.history.replaceState(null, "", `/speaking/tencent-comparison?record=${id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("无法读取样本。", "Could not load the sample.")); }
    finally { setOpening(false); }
  }
  function play(startMs: number | null, endMs: number | null) {
    if (!record || !player.current) return;
    const range = playableRange(startMs, endMs, record.audio.durationMs);
    if (!range) { setError(t("这段结果没有可靠的起止时间，请使用完整录音回听。", "No reliable time interval is available. Replay the full recording.")); return; }
    window.dispatchEvent(new Event("experiment-audio-stop")); const generation = playbackGeneration.current; stopAt.current = range.end; player.current.currentTime = range.start;
    void player.current.play().then(() => {
      if (!player.current || generation !== playbackGeneration.current) return;
      armPlaybackStop();
    }).catch(() => setError(t("请点击录音播放器开始播放。", "Please start playback using the audio controls.")));
  }
  function armPlaybackStop() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (!player.current || player.current.paused || stopAt.current === null) return;
    const generation = playbackGeneration.current, end = stopAt.current;
    stopTimer.current = setTimeout(() => { if (generation === playbackGeneration.current && player.current) { stopAt.current = null; player.current.pause(); } }, Math.max(0, (end - player.current.currentTime) / player.current.playbackRate * 1000));
  }
  const status = (state: string) => ({ success: t("已完成", "Completed"), pending: t("待完成，可刷新查看", "Pending; refresh to check"), failed: t("失败，结果已保留", "Failed; evidence retained"), not_configured: t("未配置，未调用", "Not configured; not called") })[state] || state;
  return <div className="speaking-page"><div className="speaking-scroll"><div className={`speaking-content ${styles.content}`}>
    <section className="speaking-form" aria-labelledby="comparison-target-heading"><div className="speaking-section-head"><h2 id="comparison-target-heading">{t("这次对照哪一句？", "What would you like to compare?")}</h2><div className="speaking-actions">{samples.map((sample, i) => <button key={sample} type="button" className="piano-text-button" disabled={blocked} onClick={() => change(sample, i === 2 ? 4 : 1)}>{i === 2 ? t("单词纠错示例", "Word correction example") : `${t("示例", "Example")} ${i + 1}`}</button>)}</div></div>
      <label><span className="speaking-label">{t("目标文本", "Reference text")}</span><textarea lang="en" className="piano-field" rows={2} maxLength={500} value={text} disabled={blocked} onChange={event => change(event.target.value)} /></label>
      <div className="speaking-section-head"><ExperimentSpeech appearance="piano" key={text} text={text} label="听整句示范" /><label className={styles.modeLabel}>{t("腾讯评测模式", "Tencent evaluation mode")} <select className="piano-field" value={mode} disabled={blocked} onChange={event => change(text, event.target.value === "4" ? 4 : 1)}><option value="1">{t("句子评测（1）", "Sentence assessment (1)")}</option><option value="4" disabled={config.protocol !== "websocket"}>{t("单词音素纠错（4）", "Word phone correction (4)")}</option></select></label></div>
      <p className="speaking-small speaking-muted">{count} / {mode === 4 ? 1 : 30} {t("词 · 最长 30 秒 · 录音将发送到腾讯云，同时在本机保存同一份 WAV 与双方结果。", "words · up to 30 seconds. Audio is sent to Tencent Cloud; the same WAV and both results are saved locally.")}</p>
      {mode === 4 && <p className="speaking-small speaking-muted">{t("单词纠错用于查看参考音素、实际音素与重音。腾讯整体和音素分按该模式的一分制换算到 0–100，并保留原值；本地仍使用同一套音素配对。", "Word correction exposes reference/heard phones and stress. Tencent overall and phone scores use this mode's unit scale and are normalized to 0–100 with raw values retained. Local phone alignment is unchanged.")}</p>}
      {!valid && count > 0 && <p role="status" className="speaking-notice">{mode === 4 ? t("单词纠错每次只填写一个英文单词。", "Enter one English word for correction.") : t("句子对照最多 30 个词。", "Sentence comparison supports up to 30 words.")}</p>}
    </section>
    {busy && <p role="status" className="speaking-notice">{t("正在分别进行本地音素分析与腾讯评测。单侧失败仍保留另一侧结果和录音。", "Running local phone analysis and Tencent evaluation independently. A failure on either side retains the other result and the recording.")}</p>}
    {error && <p role="alert" className="speaking-notice">{error}</p>}
    {record ? <>
      <ComparisonFeedback key={record.id} record={record} onPlay={play} />
      <section className="speaking-section" aria-label={t("回听与重练", "Replay and practice again")}><div className="speaking-section-head"><h3>{t("同一份录音", "The shared recording")}</h3><button className="piano-button" disabled={blocked} onClick={() => change(record.text, comparisonMode(record))}>{t("再练一次", "Try again")}</button></div>
        <audio key={record.id} ref={player} controls preload="metadata" src={`${endpoint}?format=audio&id=${record.id}`} className={styles.player} aria-label={t("本次对照录音", "Comparison recording")} onPlay={armPlaybackStop} onSeeked={armPlaybackStop} onRateChange={armPlaybackStop} onPause={() => { if (stopTimer.current) clearTimeout(stopTimer.current); }} onEnded={() => { stopAt.current = null; }} onTimeUpdate={() => { if (player.current && stopAt.current !== null && player.current.currentTime >= stopAt.current) { stopAt.current = null; player.current.pause(); } }} />
        <p className="speaking-small speaking-muted">{t("点击单词或音素旁的回听按钮，可播放相应时间片段；完整播放使用下方按钮。", "Use word/phone replay controls for the corresponding intervals, or replay the full recording.")}</p>
        <div className="speaking-actions"><button className="piano-text-button" onClick={() => play(0, record.audio.durationMs)}>{t("回听完整录音", "Replay full recording")}</button><a className="piano-text-link" href={`${endpoint}?format=audio&id=${record.id}`} download>{t("下载 WAV", "Download WAV")}</a></div>
      </section>
      <details className="speaking-section"><summary>{t("请求、原始响应与本次导出", "Request, raw responses, and export")}</summary><p className={`speaking-small ${styles.identifier}`}>ID: {record.id}<br />WAV SHA-256: {record.audio.sha256}<br />{new Date(record.createdAt).toLocaleString(dateLocale)} · {(record.audio.durationMs / 1000).toFixed(2)} s · {record.audio.sampleRate} Hz</p><ComparisonExports id={record.id} />
        {(["local", "tencent"] as const).map(provider => <details key={provider} className="speaking-transcript"><summary>{provider === "local" ? t("本地请求与响应", "Local request and response") : t("腾讯请求与响应", "Tencent request and response")}</summary><p className="speaking-small">{status(record[provider].status)} · HTTP {record[provider].httpStatus ?? "—"} · {record[provider].elapsedMs ?? "—"} ms · Request ID: {record[provider].requestId ?? "—"}</p><pre className={styles.raw}>{JSON.stringify(record.request[provider], null, 2)}</pre><pre className={styles.raw}>{record[provider].rawResponse ?? t("没有收到响应", "No response received")}</pre></details>)}
      </details>
    </> : !busy && <p className="speaking-empty">{t("完成一次录音后，在这里比较整句结果，并点击单词查看音素、时间、匹配标签和重音。", "Record or import audio to compare overall results, then select a word to inspect phones, timings, match tags, and stress.")}</p>}
    <details className="speaking-section" open={!config.configured}><summary>{t("腾讯连接与实验设置", "Tencent connection and experiment settings")}</summary><TencentConfigForm config={config} disabled={busy || recording || opening} onSaved={setConfig} onBusy={setSavingConfig} /></details>
    <details className="speaking-section" open={!record}><summary>{t("实验样本与批量导出", "Experiment samples and batch exports")}</summary><div className="speaking-section-head"><p className="speaking-small speaking-muted">{t("最近 100 条；导出覆盖当前学习者全部对照记录，不写入正式练习历史。", "Latest 100 samples; exports include all comparison records for this learner. Kept separate from formal practice history.")}</p><button className="piano-text-button" disabled={blocked} onClick={() => void refresh().catch(failure => setError(String(failure)))}>{t("刷新配置和记录", "Refresh configuration and records")}</button></div><ComparisonExports />
      {records.length ? records.map(item => <div className="speaking-history-row" key={item.id}><div><p lang="en">{item.text}</p><p className="speaking-small speaking-muted">{new Date(item.createdAt).toLocaleString(dateLocale)} · {t("本地", "Local")}: {status(item.localStatus)} · {t("腾讯", "Tencent")}: {status(item.tencentStatus)}</p></div><button className="piano-button" disabled={blocked} onClick={() => void open(item.id)}>{t("查看", "View")}</button></div>) : <p className="speaking-empty">{t("还没有对照样本。", "No comparison samples yet.")}</p>}
      <Link className="piano-text-link" href="/speaking/tencent-comparison?view=raw">{t("打开原始表格视图", "Open the raw table view")}</Link>
    </details>
  </div></div><SpeakingDock><div className="speaking-dock-line"><strong>{t("对照这段录音", "Compare this recording")}</strong><ExperimentRecorder appearance="piano" key={recorderKey} disabled={busy || opening || savingConfig || !valid} showPlayback={true} onAudio={setAudio} onRecording={setRecording} onRecorded={blob => void submit(blob)} /><button className="piano-button" disabled={blocked || !audio || !valid} onClick={() => void submit()}>{busy ? t("正在评测…", "Evaluating…") : config.configured ? t("提交对照评测", "Submit comparison") : t("保存本地对照样本", "Save local comparison sample")}</button></div><p className="speaking-dock-note">{t("手动停止后自动提交；导入后点击提交。两边使用完全相同的 WAV。每次提交单独保留。", "Stopping submits automatically; submit imports manually. Both providers receive the same WAV. Every submission is retained separately.")}</p></SpeakingDock></div>;
}
export function ComparisonExports({ id }: { id?: string }) {
  const { locale } = useUiLocale(), en = locale === "en";
  return <div className="speaking-actions">{([["jsonl", "JSONL"], ["csv", en ? "Sentence CSV" : "整句 CSV"], ["words", en ? "Word CSV" : "逐词 CSV"], ["phones", en ? "Phone CSV" : "逐音素 CSV"]] as const).map(([format, label]) => <a key={format} className="piano-text-link" download href={`${endpoint}?format=${format}${id ? `&id=${id}` : ""}`}>{label}</a>)}</div>;
}
