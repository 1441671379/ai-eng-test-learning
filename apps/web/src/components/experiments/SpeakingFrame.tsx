"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { PracticeModuleLink } from "@/components/learning/PracticeContinuity";

const routes = [
  { href: "/speaking", zh: "概览", en: "Overview", intro: ["自由选择一种练习，或继续上次的记录。", "Choose a practice, or pick up where you left off."] },
  { href: "/speaking/coach", zh: "AI 口语教练", en: "AI speaking coach", intro: ["围绕话题交流，在每轮回答后查看发音与表达辅导。", "Talk about a topic, then explore pronunciation and expression feedback in each turn."] },
  { href: "/speaking/pronunciation", zh: "句子发音分析", en: "Sentence pronunciation", intro: ["从整句反馈，看到每个单词的发音证据。", "From a sentence result to the pronunciation evidence for each word."] },
  { href: "/speaking/article-reading", zh: "文章朗读评测", en: "Read aloud", intro: ["逐段朗读，在原文中查看反馈与未完成的进度。", "Read paragraph by paragraph, and see feedback and progress in the original text."] },
  { href: "/speaking/tencent-comparison", zh: "测评对照实验（1）", en: "Assessment comparison (1)", intro: ["同一录音，逐词逐音素比较本地与腾讯的评分、识别和时间证据。", "Compare local and Tencent scores, phones, and timing evidence for the same recording."] },
];
const DockHost = createContext<HTMLElement | null>(null);

export function SpeakingFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale } = useUiLocale();
  const english = locale === "en";
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const current = routes.find(route => route.href === pathname) || routes[0];
  return <DockHost.Provider value={dockHost}><main className="speaking-shell">
    <header className="speaking-heading"><div><h1 tabIndex={-1}>{current === routes[0] ? english ? "Speaking" : "说" : english ? current.en : current.zh}</h1><p>{current.intro[english ? 1 : 0]}</p></div><Link className="piano-text-link" href="/speaking?overview=1#speaking-history">{english ? "Practice history" : "练习历史"}</Link></header>
    <nav className="speaking-module-nav" aria-label={english ? "Speaking practices" : "口语练习方式"}>{routes.map(route => route.href === "/speaking" || route.href === "/speaking/tencent-comparison" ? <Link href={route.href === "/speaking" ? "/speaking?overview=1" : route.href} key={route.href} aria-current={current.href === route.href ? "page" : undefined}>{english ? route.en : route.zh}</Link> : <PracticeModuleLink module="speaking" page={route.href} key={route.href} aria-current={current.href === route.href ? "page" : undefined}>{english ? route.en : route.zh}</PracticeModuleLink>)}</nav>
    <div className="speaking-route">{children}</div>
    <div id="speaking-recording-dock" ref={setDockHost} className="speaking-recording-dock" />
  </main></DockHost.Provider>;
}

/** Keep recording in a reserved flex region, outside the scrolling notebook. */
export function SpeakingDock({ children }: { children: ReactNode }) {
  const host = useContext(DockHost);
  return host ? createPortal(children, host) : null;
}
