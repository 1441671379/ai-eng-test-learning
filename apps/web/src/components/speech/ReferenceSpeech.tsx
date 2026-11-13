"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTtsVoiceRevision } from "@/hooks/useTtsVoiceRevision";
import { serviceMessage as message } from "@/lib/services/errors";

export function ReferenceSpeech({ text, label = "听示范音频", autoPlay = false, onProgress, appearance }: { text: string; label?: string; autoPlay?: boolean; onProgress?: (progress: number | null) => void; appearance?: "piano" }) {
  const revision = useTtsVoiceRevision();
  const audio = useRef<HTMLAudioElement | null>(null), url = useRef<string | null>(null), request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => { request.current?.abort(); audio.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }, []);
  useEffect(() => {
    const stop = () => { request.current?.abort(); audio.current?.pause(); setBusy(false); };
    window.addEventListener("experiment-audio-stop", stop);
    return () => window.removeEventListener("experiment-audio-stop", stop);
  }, []);
  const cache = useRef("");
  const autoplay = useEffectEvent(() => { void play(); });
  useEffect(() => { if (autoPlay) autoplay(); }, [autoPlay]);
  async function play() {
    window.dispatchEvent(new Event("experiment-audio-stop"));
    const key = `${revision}:${text}`;
    if (cache.current === key && audio.current) { audio.current.currentTime = 0; await audio.current.play().catch(() => setError("请使用下方播放器播放。")); return; }
    setBusy(true); setError(""); setReady(false); audio.current?.pause(); request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/speech/reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(190_000)]) });
      if (!response.ok) throw new Error((await response.json()).error || "音频生成失败。");
      const blob = await response.blob(); if (controller.signal.aborted) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob); cache.current = key;
      if (audio.current) { audio.current.src = url.current; setReady(true); await audio.current.play().catch(() => setError("音频已生成，请使用下方播放器播放。")); }
    } catch (failure) { if (!controller.signal.aborted) setError(message(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={appearance === "piano" ? "speaking-speech" : "space-y-2"}><Button variant="ghost" className={appearance === "piano" ? "piano-button" : undefined} disabled={busy || !text.trim()} onClick={() => { if (playing) audio.current?.pause(); else void play(); }}><UiText text={busy ? "正在生成音频…" : playing ? "暂停播放" : label} /></Button><UiElement as="audio" ref={audio} controls onPlay={() => { setPlaying(true); onProgress?.(0); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); onProgress?.(null); }} onTimeUpdate={event => { const player = event.currentTarget; if (player.duration > 0) onProgress?.(player.currentTime / player.duration); }} className={ready ? "h-10 w-full max-w-lg" : "hidden"} aria-label="示范音频" /><UiText text={error ? <p role="alert" className="text-sm text-red-800"><UiText text={error} /></p> : null} /></div>;
}
