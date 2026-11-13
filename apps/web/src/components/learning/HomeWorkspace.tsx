"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { learningModules } from "@/lib/learning-modules";
import type { ReadingSummary } from "@/lib/reading";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { PianoIcon } from "@/components/ui/piano-icon";
import { getPianoCopy } from "./piano-copy";
import { PracticeModuleLink } from "./PracticeContinuity";

export function HomeWorkspace() {
  const { locale, t, dateLocale } = useUiLocale(); const copy = getPianoCopy(locale);
  const [recent, setRecent] = useState<ReadingSummary | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  const descriptions = [copy.listeningNote, copy.speakingNote, copy.readingNote, copy.writingNote, copy.vocabularyNote, copy.knowledgeNote];
  useEffect(() => { const controller = new AbortController(); void fetch("/api/reading", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); const data: { lessons: ReadingSummary[] } = await response.json(); setRecent(data.lessons[0] ?? null); setError(false); }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retry]);
  return <main className="learning-page piano-home"><div className="piano-home-heading"><h1 tabIndex={-1}>{copy.welcome}</h1><p>{copy.welcomeNote}</p></div><div className="piano-home-grid">
    <section aria-labelledby="home-modules-title"><div className="piano-section-heading"><h2 id="home-modules-title">{copy.choose}</h2><span>{copy.freeChoice}</span></div><div className="piano-module-list">{learningModules.map((module, index) => <PracticeModuleLink module={module.id} key={module.id} className="piano-module-entry"><b>{t(module.label)}</b><span className="piano-module-description">{descriptions[index]}{locale !== "en" && <small>{module.english[0] + module.english.slice(1).toLowerCase()}</small>}</span><PianoIcon name="arrow-right" /></PracticeModuleLink>)}</div></section>
    <aside className="piano-continue" aria-labelledby="home-continue-title"><div className="piano-section-heading"><h2 id="home-continue-title">{copy.continue}</h2><span>{copy.recent}</span></div>{loading ? <div className="piano-skeleton-stack" role="status" aria-label={copy.loading}><div /><div /><div /></div> : error ? <div className="piano-continue-content"><p role="alert">{copy.historyError}</p><button className="piano-text-button" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>{copy.retry}</button></div> : recent ? <div className="piano-continue-content"><h3 lang="en">{recent.title}</h3><p className="piano-continue-topic">{recent.topic}</p><p className="piano-muted">{recent.wordCount} {copy.words}<span className="piano-inline-divider">·</span>{new Date(recent.generatedAt).toLocaleDateString(dateLocale)}</p><div className="piano-continue-stage"><span>{copy.articleStage}</span><span>{copy.answerStage}</span><strong>{recent.completed ? copy.reviewStage : copy.unanswered}</strong></div><Link href={`/reading?id=${recent.id}`} className="piano-button piano-button--primary">{copy.continueReading}<PianoIcon name="arrow-right" /></Link></div> : <div className="piano-continue-content"><h3>{copy.noRecent}</h3><p>{copy.noRecentNote}</p></div>}<Link href="/records" className="piano-text-link piano-records-link">{copy.allRecords}<PianoIcon name="arrow-right" /></Link><p className="piano-home-note">{copy.savedLocally}</p></aside>
  </div></main>;
}
