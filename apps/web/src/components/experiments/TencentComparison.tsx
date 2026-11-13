"use client";

import { useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { ExperimentRecorder } from "./ExperimentRecorder";
import { TencentConfigForm } from "./TencentConfigForm";
import { prepareComparisonAudio } from "@/lib/experiments/tencent-comparison/audio-client";
import { comparisonTokens } from "@/lib/experiments/tencent-comparison/normalize";
import type { ComparisonRecord, ComparisonSummary, ProviderStatus } from "@/lib/experiments/tencent-comparison/types";
import type { publicTencentConfig } from "@/lib/experiments/tencent-comparison/tencent";
import styles from "./TencentComparison.module.css";

const endpoint = "/api/experiments/tencent-comparison";
type Config = ReturnType<typeof publicTencentConfig>;
export function TencentComparison({ initialRecords, initialConfig }: { initialRecords: ComparisonSummary[]; initialConfig: Config }) {
  const { locale, dateLocale } = useUiLocale(), en = locale === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const [records, setRecords] = useState(initialRecords), [config, setConfig] = useState(initialConfig);
  const [text, setText] = useState("I would like to learn something new today."), [audio, setAudio] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [opening, setOpening] = useState(false), [error, setError] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [record, setRecord] = useState<ComparisonRecord | null>(null), pending = useRef(false);
  const status = (value: ProviderStatus) => ({ pending: t("待完成（中断时可保留此状态）", "Pending (may have been interrupted)"), success: t("已完成", "Completed"), failed: t("失败，已保留记录", "Failed; record retained"), not_configured: t("未配置，未调用", "Not configured; not called") })[value];
  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store" }), value = await response.json();
    if (!response.ok) throw new Error(value.error);
    setRecords(value.records); setConfig(value.config);
  }
  async function submit(blob = audio) {
    if (!blob || pending.current || !text.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const wav = await prepareComparisonAudio(blob), body = new FormData(); body.set("audio", wav); body.set("text", text);
      const response = await fetch(endpoint, { method: "POST", body }), value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setRecord(value.record); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("提交失败，请刷新记录后重试。", "Submission failed. Refresh records and retry.")); await refresh().catch(() => undefined); }
    finally { pending.current = false; setBusy(false); }
  }
  async function open(id: string) {
    if (pending.current) return;
    setOpening(true); setError("");
    try { const response = await fetch(`${endpoint}?id=${id}`, { cache: "no-store" }), value = await response.json(); if (!response.ok) throw new Error(value.error); setRecord(value.record); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t("读取失败。", "Could not load the record.")); }
    finally { setOpening(false); }
  }
  const exportLinks = (id?: string) => <div className="speaking-actions">{([ ["jsonl", "JSONL · " + t("完整数据", "full data")], ["csv", "CSV · " + t("整句", "sentences")], ["words", "CSV · " + t("逐词", "words")] ] as const).map(([format, label]) => <a key={format} className="piano-text-link" href={`${endpoint}?format=${format}${id ? `&id=${id}` : ""}`} download>{label}</a>)}</div>;
  const count = comparisonTokens(text).length, blocked = busy || recording || opening || savingConfig;
  return <div className="speaking-page"><div className="speaking-scroll"><div className={`speaking-content ${styles.content}`}>
    <section className="speaking-form" aria-labelledby="comparison-input">
      <div className="speaking-section-head"><h2 id="comparison-input">{t("同一录音，两套独立结果", "One recording, two independent results")}</h2><span className="speaking-small speaking-muted">{t("独立实验 · 不计入正式练习记录", "Independent experiment · separate from practice history")}</span></div>
      <p>{t("提交会将本次录音发送给腾讯云，并在本机保存同一份 WAV、本地评测和腾讯原始响应，供之后回听、标注与分析。", "Submitting sends this recording to Tencent Cloud and saves the same WAV, local assessment, and raw Tencent response on this computer for replay, annotation, and analysis.")}</p>
      <TencentConfigForm config={config} disabled={busy || recording || opening} onSaved={setConfig} onBusy={setSavingConfig} />
      <label><span className="speaking-label">{t("请求文本", "Reference text")}</span><textarea lang="en" className="piano-field" rows={2} maxLength={500} value={text} disabled={blocked} onChange={event => setText(event.target.value)} /></label>
      <p className="speaking-small speaking-muted">{count} / 30 {t("词 · 录音最长 30 秒。两边都使用转换后的 16 kHz 单声道 WAV。", "words · maximum 30 seconds. Both providers receive the converted 16 kHz mono WAV.")}</p>
      <ExperimentRecorder appearance="piano" disabled={busy || opening || savingConfig || !count || count > 30} onAudio={setAudio} onRecording={setRecording} onRecorded={blob => void submit(blob)} />
      <div className="speaking-actions"><button className="piano-button piano-button--primary" disabled={blocked || !audio || !count || count > 30} onClick={() => void submit()}>{busy ? t("正在评测并保存…", "Evaluating and saving…") : config.configured ? t("提交对照评测", "Submit comparison") : t("保存本地对照样本", "Save local comparison sample")}</button><span className="speaking-small speaking-muted">{t("停止录音后自动提交；导入后点击提交。每次提交单独保留。", "Stopping a recording submits it automatically. Submit imports manually. Each submission is retained separately.")}</span></div>
    </section>
    {busy && <p role="status" className="speaking-notice">{t("两边独立运行，本地模型首次加载可能需要几分钟。单侧失败不会丢弃另一侧结果。", "Providers run independently. Loading local models may take a few minutes. A failure on one side retains the other result.")}</p>}
    {error && <p role="alert" className="speaking-notice">{error}</p>}
    {record && <section className="speaking-section" aria-labelledby="comparison-result"><div className="speaking-section-head"><h2 id="comparison-result">{t("已保存的对照结果", "Saved comparison")}</h2>{exportLinks(record.id)}</div>
      <p lang="en" className={styles.reference}>{record.text}</p><p className="speaking-small speaking-muted">{new Date(record.createdAt).toLocaleString(dateLocale)} · {(record.audio.durationMs / 1000).toFixed(2)} s</p>
      <p className={`speaking-small ${styles.identifier}`}>ID: {record.id}<br />WAV SHA-256: {record.audio.sha256}</p>
      <audio key={record.id} controls preload="none" src={`${endpoint}?format=audio&id=${record.id}`} aria-label={t("对照实验的同一份录音", "The shared comparison recording")} className={styles.player} /><a className="piano-text-link" href={`${endpoint}?format=audio&id=${record.id}`} download>{t("下载对照 WAV", "Download comparison WAV")}</a>
      <div className={styles.tableScroll}><table className={styles.table}><caption>{t("分项参考值（0–100）；空缺显示为 —", "Reference metrics (0–100); missing values shown as —")}</caption><thead><tr><th scope="col">{t("字段", "Metric")}</th><th scope="col">{t("本地", "Local")}</th><th scope="col">{t("腾讯", "Tencent")}</th></tr></thead><tbody>
        <tr><th scope="row">{t("状态", "Status")}</th><td>{status(record.local.status)}</td><td>{status(record.tencent.status)}</td></tr>
        {([ ["score", t("各自参考总分", "Provider reference score")], ["phonemeMatch", t("音素匹配率", "Phoneme match")], ["accuracy", t("发音准确度", "Pronunciation accuracy")], ["fluency", t("流畅度", "Fluency")], ["completion", t("完整度", "Completion")], ["coverage", t("本地已评分词覆盖率", "Local scored-word coverage")] ] as const).map(([key, label]) => <tr key={key}><th scope="row">{label}</th>{(["local", "tencent"] as const).map(provider => <td key={provider}>{display(record[provider].metrics?.[key])}</td>)}</tr>)}
      </tbody></table></div>
      <p className="speaking-small speaking-muted">{t("两套分数定义不同，不能直接视为等价。本地覆盖率不等于腾讯完整度；识别置信度不等于发音准确度。腾讯 -1 等无效数值在分项中留空，原值保存在原始响应中。", "The scoring definitions differ. Local coverage differs from Tencent completion; decoder confidence differs from pronunciation accuracy. Invalid values such as Tencent -1 are left empty here and retained in raw responses.")}</p>
      {(["local", "tencent"] as const).map(provider => <div key={provider} className="speaking-section"><h3>{provider === "local" ? t("本地分项", "Local details") : t("腾讯分项", "Tencent details")}</h3>
        {record[provider].error && <p className="speaking-notice">{record[provider].error}</p>}
        {!!record[provider].metrics?.words.length && <div className={styles.tableScroll}><table className={styles.table}><caption>{t("词位从 0 开始；额外词不强配到原文，重复词请结合时间回听核对。", "Word indexes start at 0. Extra words remain unassigned; check repeated words against timings and audio.")}</caption><thead><tr>{[t("词位 / 对齐", "Index / alignment"), t("单词", "Word"), t("音素匹配率", "Phoneme match"), t("准确度", "Accuracy"), t("置信度", "Confidence"), t("时间 ms", "Time ms")].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{record[provider].metrics!.words.map(word => <tr key={word.index}><td>{word.targetIndex ?? "—"} / {word.alignment}</td><th scope="row" lang="en">{word.word}</th><td>{display(word.phonemeMatch)}</td><td>{display(word.accuracy)}</td><td>{display(word.confidence)}</td><td>{display(word.startMs)} – {display(word.endMs)}</td></tr>)}</tbody></table></div>}
        <details><summary>{t("请求与原始响应", "Request and raw response")}</summary><p className="speaking-small">Request ID: {record[provider].requestId ?? "—"} · HTTP: {record[provider].httpStatus ?? "—"} · {record[provider].elapsedMs ?? "—"} ms</p><pre className={styles.raw}>{JSON.stringify(record.request[provider], null, 2)}</pre><pre className={styles.raw}>{record[provider].rawResponse ?? t("没有响应（未调用或请求未抵达服务）。", "No response (not called or request did not reach the service).")}</pre></details>
      </div>)}
    </section>}
    <section className="speaking-section" aria-labelledby="comparison-history"><div className="speaking-section-head"><h2 id="comparison-history">{t("对照样本与导出", "Comparison samples and exports")}</h2><button className="piano-text-button" disabled={blocked} onClick={() => void refresh().catch(failure => setError(String(failure)))}>{t("刷新配置和记录", "Refresh configuration and records")}</button></div>
      {exportLinks()}<p className="speaking-small speaking-muted">{t("页面显示最近 100 条，导出包含当前学习者全部对照记录。JSONL 保留原始响应、请求参数与逐词 / 音素数据；CSV 带空白人工标签和备注列。录音可逐条下载，以 SHA-256 关联。", "The page shows the latest 100 records; exports include all comparison records for this learner. JSONL retains raw responses, requests, words, and phones. CSV includes empty human-label and notes columns. Download recordings individually and join by SHA-256.")}</p>
      {records.length ? records.map(item => <div className="speaking-history-row" key={item.id}><div><p lang="en">{item.text}</p><p className="speaking-small speaking-muted">{new Date(item.createdAt).toLocaleString(dateLocale)} · {t("本地", "Local")}: {status(item.localStatus)} · {t("腾讯", "Tencent")}: {status(item.tencentStatus)}</p></div><button className="piano-button" disabled={blocked} onClick={() => void open(item.id)}>{t("查看", "View")}</button></div>) : <p className="speaking-empty">{t("还没有对照样本。录制或导入一段英文朗读，提交后会保存在这里。", "No comparison samples yet. Record or import an English reading and submit it to save a sample.")}</p>}
    </section>
  </div></div></div>;
}
function display(value: number | null | undefined) { return value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1); }
