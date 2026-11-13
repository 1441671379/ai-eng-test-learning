"use client";
import { useEffect, useRef, useState } from "react";
import { useTtsVoiceRevision } from "@/hooks/useTtsVoiceRevision";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { PianoIcon } from "@/components/ui/piano-icon";
import { getListeningCopy, listeningErrorMessage } from "./listening-copy";
import { AudioColumns } from "./AudioColumns";
import { usePracticeDetail } from "@/components/learning/PracticeContinuity";

export function ListeningAudio({ lessonId, turnId, compact = false }: { lessonId: string; turnId?: string; compact?: boolean }) {
  const revision = useTtsVoiceRevision();
  return <Player key={`${revision}:${lessonId}:${turnId || ""}`} lessonId={lessonId} turnId={turnId} compact={compact} />;
}
function timestamp(value: number) { const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
function Player({ lessonId, turnId, compact }: { lessonId: string; turnId?: string; compact: boolean }) {
  const { locale, t } = useUiLocale(); const copy = getListeningCopy(locale);
  const [requested, setRequested] = useState(!turnId), [voice, setVoice] = useState("");
  const [url, setUrl] = useState(""), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0);
  const [speed, setSpeed] = usePracticeDetail<string>(`listening-speed:${lessonId}:${turnId || ""}`, "1");
  const [savedPosition, setSavedPosition] = usePracticeDetail<number>(`listening-position:${lessonId}:${turnId || ""}`, 0);
  const [visual, setVisual] = useState(true), [analyser, setAnalyser] = useState<AnalyserNode | null>(null), [visualError, setVisualError] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const fallbackPosition = useRef<number | null>(null);
  const player = useRef<HTMLAudioElement>(null), graph = useRef<{ context: AudioContext; source: MediaElementAudioSourceNode; analyser: AnalyserNode } | null>(null);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController(); let objectUrl = "";
    void fetch(`/api/listening/${lessonId}/audio${turnId ? `?turn=${turnId}` : ""}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { const value = await response.json(); throw new Error(value.error); }
      const blob = await response.blob(); if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setVoice(decodeURIComponent(response.headers.get("x-tts-voice-label") || "")); setUrl(objectUrl);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : copy.audioError); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [lessonId, turnId, requested, retry, copy.audioError]);
  useEffect(() => () => { const value = graph.current; if (value) { value.source.disconnect(); value.analyser.disconnect(); void value.context.close().catch(() => undefined); graph.current = null; } }, []);
  async function toggle() {
    const audio = player.current; if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    try {
      if (!graph.current && visual && !visualError && !turnId && typeof AudioContext !== "undefined") {
        const context = new AudioContext(), node = context.createAnalyser(), source = context.createMediaElementSource(audio);
        graph.current = { context, source, analyser: node };
        node.fftSize = 256; node.smoothingTimeConstant = .8;
        source.connect(context.destination); source.connect(node);
        setAnalyser(node);
      }
      if (graph.current?.context.state === "suspended") await graph.current.context.resume();
    } catch {
      setVisualError(true); setAnalyser(null);
      const failed = graph.current;
      if (failed) {
        // A captured media element cannot be detached from its Web Audio source.
        // Replace it with a fresh ordinary element rather than silently advancing in a suspended graph.
        fallbackPosition.current = audio.currentTime; audio.pause(); graph.current = null;
        failed.source.disconnect(); failed.analyser.disconnect(); void failed.context.close().catch(() => undefined);
        setMediaRevision(value => value + 1); return;
      }
    }
    try { await audio.play(); } catch { setError(copy.audioError); }
  }
  return <section className={`listening-player${turnId ? " listening-player--reply" : ""}`} data-compact={compact} aria-label={turnId ? copy.replyAudio : copy.audio}>
    <audio key={mediaRevision} ref={player} src={url || undefined} preload="metadata" onLoadedMetadata={() => {
      const audio = player.current; setDuration(audio && Number.isFinite(audio.duration) ? audio.duration : 0);
      if (audio) {
        audio.playbackRate = Number(speed);
        if (fallbackPosition.current === null) audio.currentTime = Math.max(0, Math.min(savedPosition, Number.isFinite(audio.duration) ? audio.duration : 0));
        if (fallbackPosition.current !== null) {
          audio.currentTime = Math.min(fallbackPosition.current, Number.isFinite(audio.duration) ? audio.duration : fallbackPosition.current); fallbackPosition.current = null;
          void audio.play().catch(() => setError(copy.audioError));
        }
      }
    }} onTimeUpdate={() => { const next = player.current?.currentTime || 0; setPosition(next); if (Math.abs(next - savedPosition) >= 5) setSavedPosition(next); }} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setSavedPosition(player.current?.currentTime || 0); }} onEnded={() => { setPlaying(false); setSavedPosition(0); }} onError={() => { if (url) setError(copy.audioError); }} />
    {!turnId && visual && <div className="listening-visual" aria-hidden="true"><span>{copy.visualHint}</span><AudioColumns analyser={analyser} active={playing && !compact && !visualError} label={copy.visual} /><small className="listening-reduced-label">{copy.staticVisual}</small></div>}
    <div className="listening-player-controls">
      {!requested ? <button className="piano-button" onClick={() => setRequested(true)}>{copy.generateReplyAudio}</button> : <button type="button" className="listening-play" aria-label={playing ? copy.pause : copy.play} disabled={!url || Boolean(error)} onClick={() => void toggle()}><PianoIcon name={playing ? "pause" : "play"} /></button>}
      <div className="listening-audio-label"><strong>{turnId ? copy.replyAudio : copy.audio}</strong><small title={voice || copy.voice}>{voice || copy.voice}</small></div>
      {url && !error ? <>
        <button type="button" className="listening-rewind piano-icon-button" aria-label={copy.rewind} title={copy.rewind} onClick={() => { const audio = player.current; if (audio) { audio.currentTime = Math.max(0, audio.currentTime - 5); setPosition(audio.currentTime); } }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 7a8 8 0 1 1-1 8M5 3v5h5" /><text x="9" y="16" fill="currentColor" stroke="none" fontSize="10">5</text></svg></button>
        <div className="listening-timeline"><span>{timestamp(position)}</span><input type="range" aria-label={copy.seek} min={0} max={duration || 1} step={.1} value={Math.min(position, duration || 1)} disabled={!duration} onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setPosition(value); }} /><span>{timestamp(duration)}</span></div>
        <select className="piano-field listening-speed" aria-label={copy.speed} value={speed} onChange={event => { setSpeed(event.target.value); if (player.current) player.current.playbackRate = Number(event.target.value); }}>{["0.75", "0.9", "1", "1.15", "1.25", "1.5", "2"].map(value => <option key={value} value={value}>{value}×</option>)}</select>
      </> : requested && <p className="listening-audio-status" role={error ? "alert" : "status"}>{error ? listeningErrorMessage(error, locale, t) : copy.preparingAudio}{error && <button className="piano-text-button" onClick={() => { player.current?.pause(); setPlaying(false); setUrl(""); setError(""); setPosition(0); setDuration(0); setRetry(value => value + 1); }}>{copy.retryAudio}</button>}</p>}
      {!turnId && <button className="piano-icon-button listening-visual-toggle" aria-label={visual ? copy.hideVisual : copy.showVisual} title={visual ? copy.hideVisual : copy.showVisual} aria-pressed={visual} onClick={() => setVisual(value => !value)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" /></svg></button>}
    </div>
    {visualError && <p className="listening-audio-status">{copy.visualUnavailable}</p>}
  </section>;
}
