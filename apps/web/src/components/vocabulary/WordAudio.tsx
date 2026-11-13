"use client";

import { useUiLocale } from "@/components/i18n/UiLocale";
import { useTtsVoiceRevision } from "@/hooks/useTtsVoiceRevision";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { WordAccent, WordRecording } from "@/lib/word-audio";

type Recording = Omit<WordRecording, "relativePath" | "sha256" | "bytes"> & { audioUrl: string };
type Choices = { recordings: Recording[]; preferredId: string | null; needsSelection: boolean };
type Source = { url: string; recording: Recording | null; engine?: string };
type Props = { text: string; label?: string; mode?: "word" | "tts"; autoPlay?: boolean; accent?: WordAccent; download?: boolean };
const stopEvent = "english-stop-word-audio";
const emptyChoices: Choices = { recordings: [], preferredId: null, needsSelection: false };

export function WordAudio({ text, label = "听发音", mode = "tts", autoPlay = false, accent = "us", download = true }: Props) {
  const revision = useTtsVoiceRevision(), { locale } = useUiLocale();
  return <WordAudioPlayer key={`${revision}:${mode}:${text}:${accent}:${autoPlay}:${download}:${locale}`} text={text} label={label} mode={mode} autoPlay={autoPlay} accent={accent} download={download} />;
}

function WordAudioPlayer({ text, label, mode, autoPlay, accent, download }: Required<Props>) {
  const { t, locale } = useUiLocale(), owner = useId(), en = locale === "en";
  const [choices, setChoices] = useState<Choices>(emptyChoices), [selection, setSelection] = useState("");
  const [source, setSource] = useState<Source | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [gesture, setGesture] = useState(false), [played, setPlayed] = useState(false);
  const player = useRef<HTMLAudioElement>(null), lastPlayer = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null), mounted = useRef(false);
  const urls = useRef(new Map<string, Source>()), options = useRef<Choices>(emptyChoices), selected = useRef("");
  const pendingPlay = useRef(false);
  const autoAllowed = useRef(true);
  const claim = useCallback(() => window.dispatchEvent(new CustomEvent(stopEvent, { detail: owner })), [owner]);

  const play = useCallback(async (recording?: Recording | null, forceTts = false) => {
    if (!mounted.current) return;
    const target = recording === undefined ? options.current.recordings.find(item => item.id === selected.current) : recording;
    if (!forceTts && options.current.needsSelection && !target) { setError(en ? "Select a pronunciation before playing." : "请选择读法后播放。"); return; }
    if (options.current.needsSelection && (forceTts || (!download && !target?.cached && !target?.localSynthesis))) { setError(en ? "This pronunciation recording is unavailable. Choose another recording or retry later." : "所选读法录音暂不可用，请选择其他录音或稍后重试。"); return; }
    claim(); request.current?.abort(); player.current?.pause();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setGesture(false);
    let key = forceTts || !target || (!download && !target.cached && !target.localSynthesis) ? "tts" : target.id;
    try {
      let next = urls.current.get(key);
      if (!next && key !== "tts" && target) {
        try {
          const response = await fetch(target.audioUrl + (download ? "" : "&download=0"), { signal: controller.signal });
          if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error("Recording unavailable");
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          next = { url: URL.createObjectURL(blob), recording: target }; urls.current.set(key, next);
        } catch (failure) { if (controller.signal.aborted || options.current.needsSelection) throw failure; key = "tts"; }
      }
      if (!next) next = urls.current.get("tts");
      if (!next) {
        const response = await fetch("/api/reference-audio/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
        const engine = response.headers.get("x-tts-engine");
        if (!response.ok || engine !== "kokoro") throw new Error("Synthesis unavailable");
        const blob = await response.blob(); if (controller.signal.aborted) return;
        next = { url: URL.createObjectURL(blob), recording: null, engine: engine || undefined }; urls.current.set("tts", next);
      }
      if (controller.signal.aborted || !mounted.current) return;
      pendingPlay.current = true;
      if (player.current?.src === next.url && player.current.readyState >= 2) {
        pendingPlay.current = false; player.current.currentTime = 0; claim();
        player.current.play().catch(() => { if (mounted.current) setGesture(true); });
      }
      setSource(next);
    } catch { if (!controller.signal.aborted && mounted.current) setError(options.current.needsSelection ? en ? "This pronunciation recording is unavailable. Choose another recording or retry later." : "所选读法录音暂不可用，请选择其他录音或稍后重试。" : en ? "Audio is unavailable. Check the local speech service and retry." : "发音暂不可用，请检查本地语音服务后重试。"); }
    finally { if (!controller.signal.aborted && mounted.current) setBusy(false); }
  }, [claim, download, en, text]);

  useEffect(() => {
    mounted.current = true;
    const metadata = new AbortController();
    const stop = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === owner) return;
      autoAllowed.current = false;
      request.current?.abort(); pendingPlay.current = false; player.current?.pause();
      if (mounted.current) setBusy(false);
    };
    window.addEventListener(stopEvent, stop);
    async function prepare() {
      if (mode === "word") {
        setBusy(true);
        try {
          const response = await fetch(`/api/vocabulary/audio?word=${encodeURIComponent(text)}&accent=${accent}&download=${download ? 1 : 0}`, { cache: "no-store", signal: metadata.signal });
          if (response.ok) {
            const value = await response.json() as Choices;
            if (metadata.signal.aborted) return;
            options.current = value; selected.current = value.preferredId || ""; setChoices(value); setSelection(selected.current);
          }
        } catch { /* Missing reference packs still use the local synthesis service. */ }
        if (metadata.signal.aborted) return;
        setBusy(false);
      }
      if (autoPlay && autoAllowed.current && !options.current.needsSelection) await play();
    }
    void prepare();
    const cache = urls.current;
    return () => {
      mounted.current = false; metadata.abort(); request.current?.abort(); pendingPlay.current = false;
      lastPlayer.current?.pause(); cache.forEach(value => URL.revokeObjectURL(value.url)); cache.clear();
      window.removeEventListener(stopEvent, stop);
    };
  }, [accent, autoPlay, download, mode, owner, play, text]);

  const selectedRecording = choices.recordings.find(item => item.id === selection);
  const attribution = source?.recording ?? (!source ? selectedRecording : undefined);
  const accentLabel = (value: string) => value === "us" ? en ? "US" : "美音" : value === "uk" ? en ? "UK" : "英音" : en ? "English" : "英语";
  const posLabel = (pos: string[]) => pos.map(value => en ? value : ({ noun: "名词", verb: "动词", adj: "形容词", adv: "副词", name: "专名" }[value] || value)).join(" / ");
  const variant = choices.recordings.length > 1 && <label className="vocabulary-audio-variant">{en ? "Recording / pronunciation" : "录音／读法"}<select className="piano-field" value={selection} disabled={busy} onChange={event => { selected.current = event.target.value; setSelection(event.target.value); void play(choices.recordings.find(item => item.id === event.target.value)); }}><option value="" disabled>{en ? "Select a pronunciation" : "选择读法"}</option>{choices.recordings.map((item, index) => <option key={item.id} value={item.id}>{item.kind === "synthesized" ? item.label || (en ? `Reading ${index + 1}` : `读法 ${index + 1}`) : `${accentLabel(item.accent)} · ${posLabel(item.pos)}${item.ipa ? ` · ${item.ipa}` : ""} · ${index + 1}`}</option>)}</select></label>;
  return <div className="vocabulary-audio">
    <div className="vocabulary-audio-controls"><button type="button" disabled={busy || !text.trim()} onClick={() => void play()} className="piano-button">{busy ? en ? "Preparing audio…" : "正在准备发音…" : played || gesture ? en ? "Replay" : "重播" : t(label)}</button>
      {mode === "word" && <span className="vocabulary-word-meta">{source && !source.recording ? "Kokoro" + (en ? " · synthesized" : " · 合成示范") : attribution?.kind === "synthesized" ? "Kokoro" + (attribution.localSynthesis ? en ? " · synthesized" : " · 合成示范" : en ? " · pre-generated" : " · 预生成示范") : attribution ? `${accentLabel(attribution.accent)} · ${en ? "Recorded voice" : "真人录音"}` : choices.needsSelection ? en ? "Choose a pronunciation" : "请选择读法" : ""}</span>}
    </div>
    {choices.needsSelection && variant}
    {gesture && <p role="status">{en ? "Select Replay to enable sound." : "点击重播即可启用声音。"}</p>}
    {source && <audio ref={node => { player.current = node; if (node) lastPlayer.current = node; }} src={source.url} controls preload="auto" aria-label={en ? `Reference audio: ${text.slice(0, 80)}` : `示范音频：${text.slice(0, 80)}`} onLoadedData={() => {
      if (!pendingPlay.current) return;
      pendingPlay.current = false; claim(); player.current?.play().catch(() => { if (mounted.current) setGesture(true); });
    }} onPlay={() => { claim(); setPlayed(true); setGesture(false); }} onError={() => { if (source.recording) void play(null, true); else setError(en ? "Audio could not be played. Retry the reference audio." : "音频无法播放，请重试示范发音。"); }} />}
    {attribution && <details className="vocabulary-audio-credit"><summary>{en ? "Recordings and source" : "录音与来源"}</summary>{!choices.needsSelection && variant}{attribution.kind === "synthesized" ? <p>{en ? "Generated locally with Kokoro using your selected voice and lexical pronunciation." : "使用当前选择的 Kokoro 音色与对应词典读法在本机生成。"}</p> : <><p>{attribution.author}</p>{attribution.attribution && <p>{attribution.attribution}</p>}{attribution.credit && <p>{attribution.credit}</p>}<a href={attribution.sourceUrl} target="_blank" rel="noreferrer">Wikimedia Commons</a> · <a href={attribution.licenseUrl} target="_blank" rel="noreferrer">{attribution.license}</a><p>{attribution.processing.includes("rendition") ? en ? "Wikimedia OGG rendition; no waveform editing." : "使用维基媒体提供的 OGG 版本，未剪辑或调节音量。" : en ? "Original recording; no audio modification." : "保留原始录音，未修改音频。"}</p></>}</details>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

/** Warm only the next two existing recordings; never synthesize speculative TTS. */
export function WordAudioPrefetch({ words, accent, enabled }: { words: string[]; accent: WordAccent; enabled: boolean }) {
  const key = words.slice(0, 2).join("\n");
  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    void Promise.allSettled(key.split("\n").map(async word => {
      const response = await fetch(`/api/vocabulary/audio?word=${encodeURIComponent(word)}&accent=${accent}&download=0`, { signal: controller.signal });
      if (!response.ok) return;
      const value = await response.json() as Choices;
      const recording = value.recordings.find(item => item.id === value.preferredId);
      if (recording?.cached && !value.needsSelection) await fetch(recording.audioUrl + "&download=0", { signal: controller.signal }).then(result => result.arrayBuffer());
    }));
    return () => controller.abort();
  }, [accent, enabled, key]);
  return null;
}
