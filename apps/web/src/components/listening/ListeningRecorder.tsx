"use client";

import { useUiLocale } from "@/components/i18n/UiLocale";
import { getListeningCopy, listeningErrorMessage } from "./listening-copy";

import { useEffect, useRef, useState } from "react";
export function ListeningRecorder({ disabled, onTranscript, onBusy }: { disabled: boolean; onTranscript: (text: string) => void; onBusy: (busy: boolean) => void }) {
  const { locale, t } = useUiLocale(); const copy = getListeningCopy(locale);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "permission" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()); };
  }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const start = Date.now(), interval = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 500);
    return () => window.clearInterval(interval);
  }, [status]);
  async function start() {
    if (status !== "idle" || disabled) return;
    setError(""); setStatus("permission"); onBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("当前浏览器无法录音，请使用支持麦克风的浏览器或直接输入英文。");
      const source = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current) { source.getTracks().forEach((track) => track.stop()); return; }
      stream.current = source;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((value) => MediaRecorder.isTypeSupported(value));
      const device = new MediaRecorder(source, mimeType ? { mimeType } : undefined), chunks: Blob[] = [];
      recorder.current = device;
      device.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      device.onstop = () => {
        source.getTracks().forEach((track) => track.stop()); stream.current = null; recorder.current = null;
        if (!mounted.current) return;
        setStatus("transcribing"); controller.current = new AbortController();
        const body = new FormData(); body.set("audio", new Blob(chunks, { type: device.mimeType }), "reply.webm");
        void fetch("/api/listening/transcribe", { method: "POST", body, signal: controller.current.signal })
          .then(async (response) => {
            const value = await response.json(); if (!response.ok) throw new Error(value.error);
            const text = value.transcript ?? value.text;
            if (typeof text !== "string" || !text.trim()) throw new Error("没有识别出语音，请再试一次，或直接输入英文。");
            if (mounted.current) onTranscript(text.trim());
          }).catch((failure) => { if (mounted.current) setError(failure instanceof Error ? failure.message : "识别失败。"); })
          .finally(() => { if (mounted.current) { setStatus("idle"); onBusy(false); } });
      };
      device.onerror = () => { if (mounted.current) setError("录音设备发生错误，请检查麦克风后重试。"); if (device.state === "recording") device.stop(); };
      device.start(1000); setSeconds(0); setStatus("recording");
    } catch (failure) {
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
      if (mounted.current) { setError(failure instanceof Error ? failure.message : "无法使用麦克风。"); setStatus("idle"); onBusy(false); }
    }
  }
  return <div><div className="listening-recorder-controls"><button type="button" disabled={status !== "recording" && (disabled || status !== "idle")} onClick={() => status === "recording" ? recorder.current?.stop() : void start()} className={`piano-button${status === "recording" ? " listening-recording" : ""}`}>{status === "recording" ? `${copy.stopRecording} · ${seconds}${copy.seconds}` : status === "permission" ? copy.permission : status === "transcribing" ? copy.transcribing : copy.microphone}</button><span className="listening-recorder-hint">{copy.recordingHint}</span></div>{error && <p role="alert" className="piano-error">{listeningErrorMessage(error, locale, t)}</p>}</div>;
}
