"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { useEffect, useState } from "react";

type Role = "A" | "B" | "C";
const roles: Role[] = ["A", "B", "C"];
type Options = { provider: string; selectedVoiceId: string; roleVoices: Record<Role, string>; voices: { id: string; label: string; version: string }[] };
export function TtsVoiceSettings() {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState("");
  const [roleVoices, setRoleVoices] = useState<Record<Role, string>>({ A: "", B: "", C: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/voice-options", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setOptions(data); setSelected(data.selectedVoiceId); setRoleVoices(data.roleVoices); setError("");
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  async function save() {
    setBusy("save"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/voice-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: selected, roleVoices }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setOptions(data);
      try { localStorage.setItem("english-tts-voice", JSON.stringify([selected, roleVoices, Date.now()])); } catch { /* The server has already persisted the selection. */ }
      window.dispatchEvent(new Event("english-tts-voice"));
      setMessage("已保存全局与角色音色。听力对话按角色朗读，无需重启服务。");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败。"); }
    finally { setBusy(""); }
  }
  async function preview(role?: Role) {
    setBusy(role || "preview"); setError(""); setAudioUrl("");
    try {
      const params = new URLSearchParams({ text: "Learning a new language opens the door to a world of ideas. Let's explore something interesting together.", voice_id: role ? roleVoices[role] || selected : selected });
      const response = await fetch(`/api/reference-audio?${params}`, { cache: "no-store" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      setAudioUrl(URL.createObjectURL(await response.blob()));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "试听生成失败。"); }
    finally { setBusy(""); }
  }
  return <UiElement as="section" id="voice-settings" aria-label="全局语音音色" className="settings-section">
    <h2 ><UiText text={"全局语音音色"} />{options ? ` · ${"Kokoro"}` : ""}</h2>
    <p className="settings-description"><UiText text={"全局音色用于文章、口语对话、单词和句子发音练习的示范朗读；听力中的多角色材料可单独指定角色音色。本机所有学习者共用，保存在电脑上。"} /></p>
    <UiText text={options ? <><label className="settings-field"><UiText text={"选择音色"} /><UiElement as="select" aria-label="选择音色" className="piano-field" value={selected} disabled={Boolean(busy)} onChange={(event) => { setSelected(event.target.value); setAudioUrl(""); setMessage(""); }}>
      <UiText text={options.voices.map((voice) => <option key={voice.id} value={voice.id}><UiText text={voice.label} /> <UiText text={" · "} /><UiText text={voice.version} /></option>)} />
    </UiElement></label><p className="settings-hint"><UiText text={"当前使用："} /><UiText text={options.voices.find((voice) => voice.id === options.selectedVoiceId)?.label} /><UiText text={"。试听不会改变当前音色；首次加载模型可能需要一些时间。"} /></p>
      <button disabled={Boolean(busy)} onClick={() => void preview()} className="piano-button"><UiText text={busy === "preview" ? "正在生成试听…" : "试听所选音色"} /></button>
      <fieldset className="settings-voices"><legend ><UiText text={"听力对话角色音色"} /></legend>
        <p className="settings-description"><UiText text={"适用于双人对话、日常场景对话和访谈。通常使用 A、B；材料出现第三位说话者时使用 C。科普、单人 Podcast 及听后交流仍使用全局音色。"} /></p>
        <div className="settings-role-grid"><UiText text={roles.map((role) => <div key={role} className="settings-role"><label className="settings-field"><UiText text={"角色 "} /><UiText text={role} /> <UiText text={" 音色"} /><UiElement as="select" aria-label={`角色 ${role} 音色`} className="piano-field" value={roleVoices[role]} disabled={Boolean(busy)} onChange={(event) => { setRoleVoices((previous) => ({ ...previous, [role]: event.target.value })); setAudioUrl(""); setMessage(""); }}>
          <option value=""><UiText text={"跟随全局音色"} /></option><UiText text={options.voices.map((voice) => <option key={voice.id} value={voice.id}><UiText text={voice.label} /></option>)} />
        </UiElement></label><button disabled={Boolean(busy)} onClick={() => void preview(role)} className="piano-text-button"><UiText text={busy === role ? "正在生成试听…" : `试听角色 ${role}`} /></button></div>)} /></div>
      </fieldset>
      <button disabled={Boolean(busy) || (selected === options.selectedVoiceId && roles.every((role) => roleVoices[role] === options.roleVoices[role]))} onClick={() => void save()} className="piano-button piano-button--primary"><UiText text={busy === "save" ? "正在保存…" : "保存全局与角色音色"} /></button>
    </> : !error ? <p role="status"><UiText text={"正在读取音色…"} /></p> : <button className="piano-text-button" onClick={() => setRetry((value) => value + 1)}><UiText text={"重新读取音色"} /></button>} />
    <UiText text={audioUrl ? <UiElement as="audio" aria-label="音色试听" controls autoPlay src={audioUrl} className="settings-audio" /> : null} />
    <UiText text={message ? <p role="status" className="settings-hint"><UiText text={message} /></p> : null} />
    <UiText text={error ? <p role="alert" className="utility-notice"><UiText text={error} /></p> : null} />
  </UiElement>;
}
