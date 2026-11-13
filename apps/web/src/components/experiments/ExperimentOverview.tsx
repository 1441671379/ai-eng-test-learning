"use client";

import { UiText, UiElement, useUiLocale } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ExperimentSummary } from "@/lib/experiments/types";
import { PianoIcon } from "@/components/ui/piano-icon";
import { message } from "./client";

const experimentNames = { coach: "AI 口语教练", pronunciation: "句子发音练习", "time-alignment": "已归档诊断", "article-reading": "文章朗读评测" };

type Status = Record<"model" | "transcription" | "pronunciation" | "tts", { ready: boolean; message: string }>;
export function ExperimentOverview({ initialSessions }: { initialSessions: ExperimentSummary[] }) {
  const { dateLocale, t } = useUiLocale();

  const [sessions, setSessions] = useState(initialSessions.filter(item => item.kind !== "time-alignment")), [status, setStatus] = useState<Status | null>(null), [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState(""), [confirmId, setConfirmId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/experiments/status", { signal: controller.signal, cache: "no-store" }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setStatus(value); }).catch(failure => { if (!controller.signal.aborted) setError(message(failure)); });
    return () => controller.abort();
  }, []);
  async function remove(id: string) {
    setDeleting(id); setError("");
    try {
      const response = await fetch(`/api/experiments/sessions?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      window.dispatchEvent(new CustomEvent("practice-record-deleted", { detail: id }));
      setSessions(previous => previous.filter(session => session.id !== id)); setConfirmId("");
    } catch (failure) { setError(message(failure)); } finally { setDeleting(""); }
  }
  const visible = sessions.filter(item => filter === "all" || item.kind === filter);
  return <div className="speaking-page"><div className="speaking-scroll"><div className="speaking-content">
    <UiElement as="section" aria-label="口语功能" className="speaking-entry-list">{[
      { href: "/speaking/coach", name: "AI 口语教练", text: "围绕话题自由回答，或跟读示范；逐轮查看发音和表达辅导。" },
      { href: "/speaking/pronunciation", name: "句子发音分析", text: "练好一句话。对照目标与实际识别音素，找到需要重练的词。" },
      { href: "/speaking/article-reading", name: "文章朗读评测", text: "逐段朗读一篇文章，在原文中查看词语反馈，继续未完成的段落。" },
    ].map(item => <Link key={item.href} href={item.href} className="speaking-entry"><strong><UiText text={item.name} /></strong><p><UiText text={item.text} /></p><PianoIcon name="arrow-right" /></Link>)}</UiElement>
    <section className="speaking-section" id="speaking-history" aria-labelledby="speaking-history-heading"><div className="speaking-section-head"><div><h2 id="speaking-history-heading"><UiText text="继续最近的练习" /></h2><p className="speaking-small speaking-muted"><UiText text="自动保存对话、辅导建议与发音结果，可重新打开。录音只用于当次练习。" /></p></div><label><UiText text="练习类型" /> <select className="piano-field" style={{ width: "auto" }} value={filter} onChange={event => setFilter(event.target.value)}><option value="all"><UiText text="全部" /></option><option value="coach"><UiText text="AI 口语教练" /></option><option value="pronunciation"><UiText text="句子发音分析" /></option><option value="article-reading"><UiText text="文章朗读评测" /></option></select></label></div>
      {visible.length ? visible.map(session => <article key={session.id} className="speaking-history-row"><Link href={`/speaking/${session.kind}?session=${session.id}`}><h3 lang="en">{session.topic}</h3><p><UiText text={experimentNames[session.kind]} /> · {new Date(session.updatedAt).toLocaleString(dateLocale)}</p><p><UiText text={session.kind === "article-reading" ? `${session.articleProgress?.recorded ?? 0} / ${session.articleProgress?.total ?? 0} 段 · ${t(session.articleProgress?.complete ? "全文总分" : "已评分部分")} ${session.score === null ? "—" : Math.round(session.score)} / 100 · 继续朗读 →` : session.kind === "coach" ? `${session.replies} 轮回答 · 继续交流 →` : session.score === null ? "未生成参考值 · 查看结果 →" : `${t("参考评分")} ${Math.round(session.score)} / 100 · 查看结果 →`} /></p></Link><details><summary><UiText text="管理记录" /></summary>{confirmId === session.id ? <div className="speaking-history-confirm"><span><UiText text="删除这条练习记录？" /></span><button className="piano-button" disabled={Boolean(deleting)} onClick={() => void remove(session.id)}><UiText text="确认删除" /></button><button className="piano-text-button" disabled={Boolean(deleting)} onClick={() => setConfirmId("")}><UiText text="取消" /></button></div> : <button className="piano-text-button" onClick={() => setConfirmId(session.id)}><UiText text="删除" /></button>}</details></article>) : <p className="speaking-empty"><UiText text={sessions.length ? "这一类还没有练习记录。选择其他类型，或开始一次新的练习。" : "还没有口语练习记录。完成一次对话或发音检查后，结果会出现在这里。"} /></p>}
    </section>
    <details className="speaking-section"><summary><UiText text="模型与声音状态" /></summary><div className="speaking-services">{([['model', '语言模型'], ['transcription', '语音识别'], ['pronunciation', '发音分析'], ['tts', '语音合成']] as const).map(([key,label]) => <section key={key}><h3><UiText text={label} /></h3><p><UiText text={status ? status[key].ready ? "已连接" : "待就绪" : "检查中…"} /></p><p><UiText text={status?.[key].message || "正在检查本地服务"} /></p></section>)}</div><Link href="/settings/models" className="piano-text-link"><UiText text="管理模型和音色" /></Link></details>
    {error && <p role="alert" className="speaking-notice"><UiText text={error} /></p>}
    <p className="speaking-small speaking-muted speaking-section"><UiText text="发音反馈分别呈现音素匹配、单词归属和识别置信度。英美发音及合理变体均可用于练习。" /></p>
  </div></div></div>;
}
