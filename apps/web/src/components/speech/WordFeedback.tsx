"use client";

import { UiText, UiElement, useUiLocale } from "@/components/i18n/UiLocale";


import { useEffect, useId, useRef, useState } from "react";
import type { PronunciationHighlight } from "@/lib/speech/types";
import { wordFeedbackCounts, wordFeedbackLabel } from "@/lib/speech/feedback";
import { configureReferenceWordPlayback } from "@/lib/speech/playback";
import { useReferenceVoice } from "@/hooks/speech/useReferenceVoice";
import { useTtsVoiceRevision } from "@/hooks/useTtsVoiceRevision";
import { cn } from "@/lib/utils";

function ReferenceWord({ text, instruct }: { text: string; instruct: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  useEffect(() => {
    const stop = () => { pending.current?.abort(); audio.current?.pause(); setBusy(false); };
    window.addEventListener("experiment-audio-stop", stop);
    return () => {
      window.removeEventListener("experiment-audio-stop", stop);
      pending.current?.abort(); audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  async function play() {
    window.dispatchEvent(new Event("experiment-audio-stop"));
    pending.current?.abort();
    audio.current?.pause();
    if (url.current) { URL.revokeObjectURL(url.current); url.current = null; }
    const request = new AbortController(); pending.current = request;
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ text, instruct });
      const response = await fetch(`/api/speech/reference?${params}`, { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("示范发音暂不可用，请重试。");
      const blob = await response.blob();
      if (request.signal.aborted) return;
      url.current = URL.createObjectURL(blob);
      const player = configureReferenceWordPlayback(new Audio(url.current));
      audio.current = player;
      await player.play();
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "示范发音播放失败。");
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <div className="space-y-2">
    <button type="button" disabled={busy} onClick={() => void play()} className="rounded-full border border-hunter-green/20 bg-white px-4 py-2 text-sm font-semibold text-hunter-green disabled:opacity-50"><UiText text={busy ? "正在准备示范…" : "听这个词的示范发音"} /></button>
    <UiText text={error ? <p role="alert" className="text-sm text-red-800"><UiText text={error} /></p> : null} />
  </div>;
}

export function WordFeedback({ highlights }: { highlights: PronunciationHighlight[] }) {
  const { t } = useUiLocale();
  const { instruct } = useReferenceVoice();
  const revision = useTtsVoiceRevision();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const detailId = useId();
  const selected = selectedIndex === null ? null : highlights[selectedIndex];
  const counts = wordFeedbackCounts(highlights);
  return <div className="space-y-4">
    <p className="text-sm leading-6 text-iron-grey"><UiText text={"点击单词查看发音反馈；可单独播放示范发音。回听自己的发音请使用整句录音。"} /></p>
    <div className="flex flex-wrap items-start gap-2">
      <UiText text={highlights.map((highlight, index) => <UiElement as="button"
        type="button" key={`${highlight.text}-${index}`} aria-controls={detailId} aria-expanded={selectedIndex === index}
        aria-label={`${highlight.text}：${t(wordFeedbackLabel(highlight))}`} title={highlight.feedback}
        onClick={() => setSelectedIndex(current => current === index ? null : index)}
        className={cn("rounded-2xl px-3 py-2 text-left text-base font-semibold transition-colors", highlight.uncertain ? "bg-slate-100 text-slate-700" : highlight.status === "correct" ? "bg-yellow-green text-hunter-green" : highlight.status === "mixed" ? "bg-[#efd889] text-hunter-green" : "bg-blushed-brick text-bright-snow", selectedIndex === index && "ring-2 ring-hunter-green ring-offset-2")}
      ><span lang="en">{highlight.text}</span><span className="mt-0.5 block text-xs font-normal"><UiText text={wordFeedbackLabel(highlight)} /></span></UiElement>)} />
    </div>
    <div id={detailId} aria-live="polite">
      <UiText text={selected ? <div className="space-y-3 rounded-2xl border border-hunter-green/10 bg-vanilla-cream/40 p-4">
        <p className="font-semibold text-hunter-green"><span lang="en">{selected.text}</span> <UiText text={" · "} /><UiText text={wordFeedbackLabel(selected)} /></p>
        <p className="break-words text-sm leading-7 text-iron-grey"><UiText text={selected.feedback} /></p>
        <ReferenceWord key={`${selectedIndex}:${selected.text}:${instruct}:${revision}`} text={selected.text} instruct={instruct} />
      </div> : null} />
    </div>
    <p className="text-sm leading-6 text-iron-grey"><UiText text={counts.matched} /> <UiText text={" 个词音素匹配，"} /><UiText text={counts.review} /> <UiText text={" 个词有疑点，"} /><UiText text={counts.variation} /> <UiText text={" 个词需核对或可能弱读，"} /><UiText text={counts.uncertain} /> <UiText text={" 个词无法确认。"} /></p>
  </div>;
}
