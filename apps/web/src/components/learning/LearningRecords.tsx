"use client";

import { UiText, UiElement, useUiLocale } from "@/components/i18n/UiLocale";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { learningModules, sourceLabels } from "@/lib/learning-modules";
import type { LearningRecord } from "@/lib/learning-records";
export function LearningRecords() {
  const { dateLocale, t } = useUiLocale();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [module, setModule] = useState("all");
  const [source, setSource] = useState("all");
  const [visibleCount, setVisibleCount] = useState(20);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/learning-records", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRecords(data.records); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "加载失败。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const listener = () => void load(); window.addEventListener("learning-records-updated", listener); return () => window.removeEventListener("learning-records-updated", listener); }, [load]);
  const filtered = records.filter((record) => (module === "all" || record.module === module) && (source === "all" || record.source === source));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  return <div>
    <dl className="records-summary">{[{ label: "已记录的练习", count: records.length }, { label: "今日练习", count: records.filter((record) => new Date(record.occurredAt).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) === today).length }, { label: "AI Coach 回答", count: records.filter((record) => record.kind === "coach_reply").length }].map(item => <div key={item.label}><dt><UiText text={item.label} /></dt><dd>{loading ? "…" : item.count}</dd></div>)}</dl>
    <section>
      <div className="records-filters">
        <label><UiText text="学习板块" /><UiElement as="select" aria-label="学习板块" value={module} onChange={event => { setModule(event.target.value); setVisibleCount(20); }} className="piano-field"><option value="all"><UiText text="全部板块" /></option>{learningModules.map(item => <option key={item.id} value={item.id}><UiText text={item.label} /></option>)}</UiElement></label>
        <label><UiText text="练习来源" /><UiElement as="select" aria-label="练习来源" value={source} onChange={event => { setSource(event.target.value); setVisibleCount(20); }} className="piano-field"><option value="all"><UiText text="全部来源" /></option>{Object.entries(sourceLabels).map(([id, label]) => <option key={id} value={id}><UiText text={label} /></option>)}</UiElement></label>
        <button disabled={loading} onClick={() => void load()} className="piano-button"><UiText text={loading ? "正在读取记录…" : "刷新记录"} /></button>
      </div>
      {error && <p role="alert" className="utility-notice"><UiText text={error} /></p>}
      {loading && !records.length && <p role="status" className="records-empty"><UiText text="正在读取记录…" /></p>}
      {!loading && !error && !filtered.length && <p className="records-empty"><UiText text={records.length ? "没有符合筛选条件的记录。试试其他板块或来源。" : "这里还没有学习记录。完成一次练习后再来看看。"} /></p>}
      <div className="records-list" aria-busy={loading}>{filtered.slice(0, visibleCount).map(record => <article key={record.id} className="record-row">
        <header><span><UiText text={learningModules.find(item => item.id === record.module)?.label ?? "历史口语"} /><span className="record-separator">/</span><UiText text={sourceLabels[record.source]} /><span className="record-kind"><UiText text={record.kind === "writing_review" ? "写作批改" : record.kind === "vocabulary_review" ? "间隔复习" : record.kind === "listening_quiz" ? "听力答题" : record.kind === "listening_reply" ? "听后交流" : record.kind === "reading_quiz" ? "阅读答题" : record.kind === "coach_reply" ? "AI Coach 回答" : "发音练习"} /></span></span><time dateTime={record.occurredAt}>{new Date(record.occurredAt).toLocaleString(dateLocale, { timeZone: "Asia/Shanghai" })}</time></header>
        <div className="record-content"><div><h2>{record.title}</h2><p className="record-text">{record.text}</p>{record.resourceId && ["writing", "listening", "reading"].includes(record.module) && <Link className="piano-text-link" href={`/${record.module}?id=${encodeURIComponent(record.resourceId)}`}><UiText text={record.module === "writing" ? "打开对应写作" : record.module === "listening" ? "打开对应听力" : "打开对应阅读"} /></Link>}</div>
          <div className="record-result">{record.score !== null ? <><span><UiText text={record.module === "writing" ? "Task 2 参考估分" : ["reading", "listening"].includes(record.module) ? "答题正确率" : t(sourceLabels[record.source]) + t(" 评分")} /></span><strong>{record.score.toFixed(1)}<small> / {record.module === "writing" ? "9" : "100"}</small></strong></> : <span><UiText text={record.module === "writing" ? "本次仅提供写作反馈，不计雅思分" : record.module === "vocabulary" ? "记忆自评，不计分" : "本条对话记录不计分"} /></span>}</div>
        </div>
      </article>)}</div>
      {filtered.length > visibleCount && <button onClick={() => setVisibleCount(count => count + 20)} className="piano-button records-more"><UiText text="显示更多" /></button>}
      <p className="utility-footnote"><UiText text="记录按当前用户保存在本机。不同工具的分数分别展示。旧口语记录继续保留，原课程和对话数据仍在本机；旧页面已移除，不再提供旧对话入口。口语练习记录在“说”模块中查看。" /></p>
    </section>
  </div>;
}
