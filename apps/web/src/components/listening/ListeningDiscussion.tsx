"use client";

import { useUiLocale } from "@/components/i18n/UiLocale";
import { getListeningCopy, listeningErrorMessage } from "./listening-copy";

import { readLocalStorage } from "@/lib/browser-storage";
import Link from "next/link";
import { VocabularyCapture } from "@/components/vocabulary/VocabularyCapture";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicListeningLesson } from "@/lib/listening";
import { ListeningAudio } from "./ListeningAudio";
import { ListeningRecorder } from "./ListeningRecorder";
import { usePracticeDetail } from "@/components/learning/PracticeContinuity";
export function ListeningDiscussion({ lesson, onUpdate, onBusy }: { lesson: PublicListeningLesson; onUpdate: (lesson: PublicListeningLesson) => void; onBusy: (busy: boolean) => void }) {
  const { locale, t } = useUiLocale(); const copy = getListeningCopy(locale);
  const [message, setMessage] = usePracticeDetail<string>(`discussion:${lesson.id}`, "");
  const [sending, setSending] = useState(false), [recording, setRecording] = useState(false);
  const [error, setError] = useState(""), [warning, setWarning] = useState("");
  const pending = useRef<{ id: string; message: string } | null>(null), controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    try {
      const draft = JSON.parse(readLocalStorage(`english-listening-discuss:${lesson.id}`) || "null");
      if (draft && typeof draft.message === "string" && draft.message.length <= 2000 && typeof draft.id === "string" && /^[a-f0-9-]{36}$/.test(draft.id)) {
        if (!lesson.conversation.some((turn) => turn.id === draft.id)) { pending.current = draft; setMessage(draft.message); }
        else localStorage.removeItem(`english-listening-discuss:${lesson.id}`);
      }
    } catch { /* Drafts are optional; server history remains authoritative. */ }
    return () => { mounted.current = false; controller.current?.abort(); };
    // A new lesson mounts a fresh discussion. Replies must not reset a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);
  useEffect(() => { onBusy(sending || recording); }, [sending, recording, onBusy]);
  const transcribed = useCallback((text: string) => setMessage((value) => (value ? value + " " + text : text).slice(0, 2000)), [setMessage]);
  async function send(event?: React.FormEvent, retry?: { id: string; message: string }) {
    event?.preventDefault(); if (sending || recording || (!retry && !message.trim())) return;
    const turn = retry || (pending.current?.message === message.trim() ? pending.current : { id: crypto.randomUUID(), message: message.trim() });
    pending.current = turn;
    try { localStorage.setItem(`english-listening-discuss:${lesson.id}`, JSON.stringify(turn)); } catch { /* Optional draft cache. */ }
    setSending(true); setError(""); controller.current = new AbortController();
    try {
      const response = await fetch(`/api/listening/${lesson.id}/discuss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(turn), signal: controller.current.signal });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      if (!mounted.current) return;
      onUpdate(value.lesson); setWarning(value.recordWarning || ""); if (!retry) setMessage(""); pending.current = null;
      try { localStorage.removeItem(`english-listening-discuss:${lesson.id}`); } catch { /* Optional draft cache. */ }
      window.dispatchEvent(new Event("learning-records-updated"));
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "发送失败，请重试。"); }
    finally { if (mounted.current) setSending(false); }
  }
  const last = lesson.conversation.at(-1);
  return <VocabularyCapture module="listening" resourceId={lesson.id} appearance="piano"><section className="listening-discussion">
    <h2>{copy.discussTitle}</h2><p className="listening-discussion-intro">{copy.discussHint} <Link href="/settings/models" className="piano-text-link">{copy.modelSettings}</Link></p>
    <p className="listening-discussion-prompt" lang="en">What is the main idea of “{lesson.title}”? Which point do you find most useful, and why?</p>
    {lesson.conversation.map(turn => <article key={turn.id} className="listening-turn"><p className="listening-turn-label">{copy.you}</p><p lang="en">{turn.user}</p><p className="listening-turn-label">{copy.ai}</p><p lang="en">{turn.assistant}</p><ListeningAudio lessonId={lesson.id} turnId={turn.id} /></article>)}
    {warning && <p role="alert" className="piano-error">{t(warning)} {last && <button disabled={sending || recording} onClick={() => void send(undefined, { id: last.id, message: last.user })} className="piano-text-button">{copy.sync}</button>}</p>}
    {lesson.conversation.length >= 20 ? <p className="listening-note">{copy.roundLimit}</p> : <form onSubmit={event => void send(event)} className="listening-reply-form"><ListeningRecorder disabled={sending} onTranscript={transcribed} onBusy={setRecording} /><label>{copy.response}<textarea className="piano-field" value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} disabled={sending || recording} rows={4} placeholder="The main idea is… I think… because… For example…" lang="en" /></label><div className="listening-reply-footer"><span>{message.length}/2000 · {lesson.conversation.length}/20 {copy.rounds}</span><button className="piano-button piano-button--primary" disabled={sending || recording || !message.trim()}>{sending ? copy.sending : copy.send}</button></div></form>}
    {error && <p className="piano-error" role="alert">{listeningErrorMessage(error, locale, t)} {copy.replyKept}</p>}
  </section></VocabularyCapture>;
}
