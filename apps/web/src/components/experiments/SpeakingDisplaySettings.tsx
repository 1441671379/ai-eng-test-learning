"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UiElement, UiText } from "@/components/i18n/UiLocale";
import type { SpeakingDisplayPreferences } from "@/lib/speaking-display";

const options = [
  { key: "showPhonemeDetails", label: "显示逐音素配对与置信度", hint: "查看每个音素的配对操作及识别置信度。" },
  { key: "showTranscriptCorrection", label: "显示识别文字核对", hint: "识别有误时，可核对实际读出的文字并重新评分。" },
  { key: "showParagraphHistory", label: "显示分段练习记录", hint: "在文章朗读中查看每段最近 10 次的练习记录。" },
] as const;

export function SpeakingDisplaySettings({ initialPreferences }: { initialPreferences: SpeakingDisplayPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saved, setSaved] = useState(initialPreferences);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  const changed = options.some(({ key }) => preferences[key] !== saved[key]);

  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/speaking-display", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "保存口语显示设置失败。");
      setSaved(value.preferences); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存口语显示设置失败。"); }
    finally { setBusy(false); }
  }

  return <UiElement as="section" id="speaking-feedback-display" aria-label="口语反馈显示" className="settings-section">
    <h2 id="speaking-feedback-title"><UiText text="口语反馈显示" /></h2>
    <p className="settings-description"><UiText text="以下明细默认隐藏，按需开启。分数、逐词反馈和目标／实际音素始终保留。" /></p>
    <fieldset disabled={busy} aria-labelledby="speaking-feedback-title" className="settings-checks">
      {options.map(option => <label key={option.key} className="settings-check">
        <input type="checkbox" checked={preferences[option.key]} onChange={event => setPreferences(previous => ({ ...previous, [option.key]: event.target.checked }))} />
        <span><strong><UiText text={option.label} /></strong><small><UiText text={option.hint} /></small></span>
      </label>)}
    </fieldset>
    <button disabled={busy || !changed} onClick={() => void save()} className="piano-button"><UiText text={busy ? "保存中…" : changed ? "保存口语显示设置" : "已保存"} /></button>
    {error && <p role="alert" className="utility-notice"><UiText text={error} /></p>}
  </UiElement>;
}
