"use client";
import { useTtsVoiceRevision } from "@/hooks/useTtsVoiceRevision";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { getPianoCopy } from "@/components/learning/piano-copy";
import { PianoIcon } from "@/components/ui/piano-icon";
import { usePracticeDetail } from "@/components/learning/PracticeContinuity";

export function ReadingAudio({ lessonId }: { lessonId: string }) {
  const revision = useTtsVoiceRevision();
  return <ReadingAudioPlayer key={`${revision}:${lessonId}`} lessonId={lessonId} />;
}
function timestamp(value: number) { const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
function ReadingAudioPlayer({ lessonId }: { lessonId: string }) {
  const { locale, t } = useUiLocale(); const copy = getPianoCopy(locale);
  const [voiceLabel, setVoiceLabel] = useState(""); const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false); const [position, setPosition] = useState(0); const [duration, setDuration] = useState(0); const [speed, setSpeed] = usePracticeDetail<string>(`reading-speed:${lessonId}`, "1");
  const [savedPosition, setSavedPosition] = usePracticeDetail<number>(`reading-position:${lessonId}`, 0);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let createdUrl = "";
    void fetch(`/api/reading/${lessonId}/audio`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      const label = decodeURIComponent(response.headers.get("x-tts-voice-label") || ""); const blob = await response.blob();
      if (controller.signal.aborted) return;
      createdUrl = URL.createObjectURL(blob); setVoiceLabel(label); setUrl(createdUrl); setError("");
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "音频准备失败。"); });
    return () => { controller.abort(); if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [lessonId, retry]);
  async function togglePlayback() { if (!audio.current) return; if (playing) audio.current.pause(); else { try { await audio.current.play(); } catch { setError(copy.audioError); } } }
  return <section className="reading-audio" aria-label={copy.audio}>
    <audio ref={audio} src={url || undefined} preload="metadata" onLoadedMetadata={() => { const value = audio.current?.duration; setDuration(value && Number.isFinite(value) ? value : 0); if (audio.current) { audio.current.playbackRate = Number(speed); audio.current.currentTime = Math.max(0, Math.min(savedPosition, value || 0)); } }} onTimeUpdate={() => { const next = audio.current?.currentTime ?? 0; setPosition(next); if (Math.abs(next - savedPosition) >= 5) setSavedPosition(next); }} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setSavedPosition(audio.current?.currentTime || 0); }} onEnded={() => { setPlaying(false); setSavedPosition(0); }} onError={() => { if (url) setError(copy.audioError); }} />
    <button type="button" className="reading-audio-play" disabled={!url || Boolean(error)} aria-label={playing ? copy.pause : copy.play} onClick={() => void togglePlayback()}><PianoIcon name={playing ? "pause" : "play"} /></button>
    <div className="reading-audio-label"><strong>{copy.audio}</strong><small title={voiceLabel || copy.voice}>{voiceLabel || copy.voice}</small></div>
    {url && !error ? <><div className="reading-audio-timeline"><span>{timestamp(position)}</span><input type="range" aria-label={copy.seek} min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 1)} disabled={!duration} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setPosition(value); }} /><span>{timestamp(duration)}</span></div><select className="piano-field reading-audio-speed" aria-label={copy.speed} value={speed} onChange={event => { setSpeed(event.target.value); if (audio.current) audio.current.playbackRate = Number(event.target.value); }}>{["0.75", "1", "1.25", "1.5", "2"].map(value => <option key={value} value={value}>{value}×</option>)}</select></> : <p className="reading-audio-status" role={error ? "alert" : "status"}>{error ? t(error) : copy.preparingAudio}{error && <button className="piano-text-button" onClick={() => { audio.current?.pause(); setPlaying(false); setPosition(0); setDuration(0); setUrl(""); setError(""); setRetry(value => value + 1); }}>{copy.retryAudio}</button>}</p>}
  </section>;
}
