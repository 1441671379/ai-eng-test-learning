"use client";

import { UiText, UiElement, useUiLocale } from "@/components/i18n/UiLocale";

import { type ReactNode } from "react";
import { usePracticeDetail } from "@/components/learning/PracticeContinuity";
import type { SpeakingEvaluation } from "@/lib/experiments/speaking-evaluation";
import { createTimeAlignmentExport, phoneConfidence } from "@/lib/experiments/time-alignment-judgement";
import { ExperimentSpeech } from "./ExperimentSpeech";
import { PronunciationReference } from "./PronunciationReference";
import { useSpeakingDisplay } from "./SpeakingDisplay";

const verdictNames = { green: "基本正确", orange: "基本错误", unscored: "未评分" };
const ownerNames = { unique: "归属唯一", multiple: "存在多个候选", missing: "缺少时间证据", unknown: "无归属候选数据" };
const operationNames = { match: "匹配", variant: "发音变体", substitution: "替换", deletion: "缺音", insertion: "多音" };
const percent = (v: number | null) => v === null ? "无数据" : `${Number(v.toFixed(1))}%`;
const stageNames = { audioDecodeSeconds: "读取录音", transcriptionSeconds: "文字识别", targetPhonemizeSeconds: "目标音素", phoneRecognitionSeconds: "录音音素识别", wordTimingSeconds: "单词时间定位", groupingSeconds: "音素配对" };
export function SpeakingTimeFeedback({ evaluation, children }: { evaluation: SpeakingEvaluation; children?: ReactNode }) {
  const { alignment: result, settings, words } = evaluation, method = result.methods.soft;
  const [selected, setSelected] = usePracticeDetail<number>(`feedback-word:${result.targetText.slice(0, 100)}`, Math.max(0, words.findIndex(w => w.verdict === "orange")));
  if (!method.available) return <p role="status"><UiText text={method.reason} /></p>;
  const word = method.words[selected], judgement = words[selected];
  const scored = words.filter(item => item.verdict !== "unscored"), operationCount = scored.reduce((sum, item) => sum + item.operationCount, 0);
  const referenceScore = result.version === "time-first-lexical-partial-v2" && operationCount ? Math.round(scored.reduce((sum, item) => sum + item.matchedCount, 0) / operationCount * 1000) / 10 : method.consistencyIndex;
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(createTimeAlignmentExport(result, settings, "soft"), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "speaking-evaluation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <UiElement as="section" aria-label="时间配对发音结果" className="speaking-feedback">
    <div className="speaking-result-heading"><h2><UiText text="本次发音结果" /></h2><p><UiText text={scored.length === words.length ? "整句音素匹配参考分" : "已评分部分音素匹配参考分"} /> <strong>{referenceScore}</strong> / 100</p></div>
    <p className="speaking-small speaking-muted" style={{ marginTop: 10 }}><UiText text="点击单词查看发音细节。" /> <UiText text="参考分不代表人工确认的发音准确率。" /></p>
    <div className="speaking-word-list">{words.map((item,index) => <span key={item.wordIndex}><UiElement as="button" type="button" lang="en" className="speaking-word" aria-pressed={selected === index} aria-label={`${item.word}：${verdictNames[item.verdict]}`} data-verdict={item.verdict} onClick={() => setSelected(index)}>{item.word}</UiElement>{" "}</span>)}</div>
    <div className="speaking-legend">{(["green","orange","unscored"] as const).map(verdict => <span key={verdict} className={verdict === "green" ? "speaking-green" : verdict === "orange" ? "speaking-orange" : undefined}><UiText text={verdictNames[verdict]} /> {words.filter(w=>w.verdict===verdict).length}</span>)}</div>
    {word && judgement && <UiElement as="section" aria-label="单词判定详情" className="speaking-word-detail">
      <div className="speaking-word-head"><h3 lang="en">{word.word}</h3><span className={judgement.verdict === "green" ? "speaking-green" : judgement.verdict === "orange" ? "speaking-orange" : "speaking-muted"}><UiText text={verdictNames[judgement.verdict]} /></span></div>
      <PronunciationReference reference={word.pronunciation} appearance="piano" />
      <dl className="speaking-metrics">{[["音素匹配率",percent(judgement.matchPercent)],["单词归属确定性",ownerNames[judgement.assignment]],["整词识别置信度",percent(judgement.meanConfidence)]].map(([label,value]) => <div key={label}><dt><UiText text={label} /></dt><dd><UiText text={value} /></dd></div>)}</dl>
      <div className="speaking-phones"><div><h4><UiText text="目标音素" /></h4><p lang="en">{word.expectedPhones.length ? word.expectedPhones.join(" ") : <UiText text="暂无可用参考音素" />}</p></div><div><h4><UiText text="归到这个词的实际音素" /></h4><p lang="en">{word.heardPhones.length ? word.heardPhones.join(" ") : <UiText text="未分配到音素" />}</p></div></div>
      <p className="speaking-small speaking-muted" style={{ marginTop: 10 }}><UiText text={judgement.reason} /></p>
      <SpeakingPhoneOperations evaluation={evaluation} wordIndex={word.wordIndex} />
      <ExperimentSpeech appearance="piano" key={`${selected}:${word.word}`} text={word.word} label="播放这个单词" />
    </UiElement>}
    <details className="speaking-transcript"><summary><UiText text="识别出的文字与本次参数" /></summary><p lang="en">{result.transcript}</p><p className="speaking-small speaking-muted"><UiText text="录音 " />{result.duration.toFixed(2)}<UiText text=" 秒 · 处理 " />{result.elapsedSeconds.toFixed(2)}<UiText text=" 秒" /></p><p className="speaking-small speaking-muted"><UiText text="本次门槛：匹配率 " />{settings.matchThreshold}<UiText text="% · 识别置信度 " />{settings.confidenceThreshold}<UiText text="%（" /><UiText text={settings.useConfidenceForColor ? "参与颜色判定" : "仅作提示"} /><UiText text="）· " /><UiText text={settings.acceptVariants ? "允许弱读、闪音变体" : "严格比较变体"} /></p><button className="piano-text-button" onClick={download}><UiText text="导出本次评估" /></button></details>
    {result.profile && <details className="speaking-transcript"><summary><UiText text="查看处理耗时" /></summary><dl>{Object.entries(stageNames).map(([key,label])=><div key={key} className="speaking-actions"><dt><UiText text={label} /></dt><dd>{result.profile![key as keyof typeof result.profile].toFixed(3)}<UiText text=" 秒" /></dd></div>)}</dl><p className="speaking-small speaking-muted"><UiText text="时间定位：" /><UiText text={result.timing.version === "english-ctc-v1" ? "公共语音进程内执行，模型常驻。" : "历史评估记录。"} /><UiText text="模型加载 " />{result.timing.modelLoadSeconds.toFixed(3)}<UiText text=" 秒，对齐执行 " />{result.timing.alignmentSeconds.toFixed(3)}<UiText text=" 秒。" /></p></details>}
    {children}
    <p className="speaking-small speaking-muted" style={{ marginTop: 14 }}><UiText text="本次结果与参数已保存到学习记录。改变后续参数不会改写本次评估。" /></p>
  </UiElement>;
}

export function SpeakingPhoneOperations({ evaluation, wordIndex }: { evaluation: SpeakingEvaluation; wordIndex: number }) {
  const { t } = useUiLocale();
  const { showPhonemeDetails } = useSpeakingDisplay();
  if (!showPhonemeDetails) return null;
  const { alignment: result, settings } = evaluation;
  const method = result.methods.soft;
  if (!method.available) return <p className="speaking-small speaking-muted"><UiText text={method.reason} /></p>;
  const operations = method.operations.filter(operation => operation.wordIndex === wordIndex);
  return <details className="speaking-transcript"><summary><UiText text="逐音素配对与置信度" /></summary>{operations.length ? <table className="speaking-phone-table"><caption><UiText text="识别置信度不等于发音准确率。缺失数据以 — 显示。" /></caption><thead><tr>{["目标","识别","配对","识别置信度"].map(label=><th key={label} scope="col"><UiText text={label} /></th>)}</tr></thead><tbody>{operations.map((operation,index)=>{const confidence=phoneConfidence(result,operation.heardIndex);return <tr key={index}><td>{operation.expected||"—"}</td><td>{operation.heard||"—"}</td><td><UiText text={operationNames[operation.operation]} />{operation.operation === "variant" && <UiText text={settings.acceptVariants ? "（计作匹配）" : "（计作不匹配）"} />}</td><td>{confidence === null ? "—" : `${percent(confidence)}${confidence < settings.confidenceThreshold ? t(" · 偏低") : ""}`}</td></tr>;})}</tbody></table> : <p className="speaking-muted speaking-small"><UiText text="暂无逐音素配对明细" /></p>}</details>;
}
