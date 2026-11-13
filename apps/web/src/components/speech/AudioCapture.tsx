"use client";

import { FilePicker } from "@/components/i18n/FilePicker";
import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { useEffect, useEffectEvent, useState } from "react";
import { useAudioRecorder } from "@/hooks/speech/useAudioRecorder";
import { Button } from "@/components/ui/button";

export function AudioCapture({ disabled, onAudio, onRecording, onRecorded, showPlayback = true, appearance }: { disabled: boolean; onAudio: (audio: Blob | null) => void; onRecording: (recording: boolean) => void; onRecorded?: (audio: Blob) => void; showPlayback?: boolean; appearance?: "piano" }) {
  const recorder = useAudioRecorder();
  const [requesting, setRequesting] = useState(false), [uploadName, setUploadName] = useState("");
  const [seconds, setSeconds] = useState(0), [uploadUrl, setUploadUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const completed = useEffectEvent((blob: Blob) => { onAudio(blob); onRecorded?.(blob); });
  useEffect(() => { if (recorder.audioBlob) completed(recorder.audioBlob); }, [recorder.audioBlob]);
  useEffect(() => { onRecording(recorder.isRecording); }, [recorder.isRecording, onRecording]);
  useEffect(() => { if (!recorder.isRecording) return; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [recorder.isRecording]);
  useEffect(() => () => { if (uploadUrl) URL.revokeObjectURL(uploadUrl); }, [uploadUrl]);
  async function start() {
    window.dispatchEvent(new Event("experiment-audio-stop"));
    onAudio(null); setUploadName(""); setUploadUrl(""); setUploadError(""); setSeconds(0); setRequesting(true);
    try { await recorder.startRecording(); } finally { setRequesting(false); }
  }
  function importAudio(file: File) {
    if (disabled || recorder.isRecording || requesting) return;
    if (!file.size || file.size > 25 * 1024 * 1024 || !/\.(wav|mp3|webm|m4a|ogg|flac|aac)$/i.test(file.name)) { setUploadError("请选择不超过 25 MB 的音频文件。"); return; }
    setUploadError(""); recorder.clearRecording(); setUploadName(file.name); setUploadUrl(URL.createObjectURL(file)); onAudio(file);
  }
  if (appearance === "piano") return <UiElement as="section" aria-label="练习录音" className="speaking-capture" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) importAudio(file); }}>
    <div className="speaking-capture-line"><button type="button" className="piano-button piano-button--primary" disabled={disabled || requesting || recorder.isRecording} onClick={() => void start()}><UiText text={requesting ? "等待麦克风授权…" : "开始录音"} /></button><button type="button" className="piano-button" disabled={!recorder.isRecording} onClick={recorder.stopRecording}><UiText text="停止录音" /></button><p role="status"><UiText text={recorder.isRecording ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")} 正在录音，请手动点击停止。` : "手动停止后自动评分"} /></p><div className="speaking-capture-import"><FilePicker label="导入练习录音" accept="audio/*,.webm" disabled={disabled || recorder.isRecording || requesting} fileName={uploadName} onFile={importAudio} /></div></div>
    {showPlayback && (uploadUrl || recorder.audioUrl) && <UiElement as="audio" controls src={uploadUrl || recorder.audioUrl || undefined} aria-label="我的练习录音" />}
    {uploadError && <p role="alert" className="speaking-error"><UiText text={uploadError} /></p>}
    {recorder.error && <p role="alert" className="speaking-error"><UiText text="麦克风未就绪：" /><UiText text={recorder.error} /><UiText text="。请检查浏览器权限，或导入录音。" /></p>}
  </UiElement>;
  return <UiElement as="section" aria-label="练习录音" className="space-y-3 rounded-2xl border border-dashed border-hunter-green/20 p-4" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) importAudio(file); }}>
    <div className="flex flex-wrap items-center gap-3">
      <UiText text={recorder.isRecording ? <Button variant="danger" onClick={recorder.stopRecording}><UiText text={"停止录音"} /></Button> : <Button variant="secondary" disabled={disabled || requesting} onClick={() => void start()}><UiText text={requesting ? "等待麦克风授权…" : "开始录音"} /></Button>} />
      <p role="status" className="text-sm text-iron-grey"><UiText text={recorder.isRecording ? `● ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")} 正在录音，请手动点击停止。` : "录音由你手动停止；完成后可回听或重录。"} /></p>
    </div>
    <UiText text={showPlayback && recorder.audioUrl && !uploadName ? <UiElement as="audio" controls src={recorder.audioUrl} aria-label="我的练习录音" className="h-10 w-full max-w-lg" /> : null} />
    <UiText text={showPlayback && uploadUrl ? <UiElement as="audio" controls src={uploadUrl} aria-label="导入的练习录音" className="h-10 w-full max-w-lg" /> : null} />
    <div className="text-xs text-iron-grey"><UiText text={"也可导入或拖入录音（WAV / MP3 / WebM 等，最大 25 MB）"} /><FilePicker label="导入练习录音" accept="audio/*,.webm" disabled={disabled || recorder.isRecording || requesting} fileName={uploadName} onFile={importAudio} /></div>
    <UiText text={uploadError ? <p role="alert" className="text-sm text-red-800"><UiText text={uploadError} /></p> : null} />
    <UiText text={recorder.error ? <p role="alert" className="text-sm text-red-800"><UiText text={"麦克风未就绪："} /><UiText text={recorder.error} /><UiText text={"。请检查浏览器权限，或导入录音。"} /></p> : null} />
  </UiElement>;
}
