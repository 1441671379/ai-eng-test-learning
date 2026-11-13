"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import { useState } from "react";
import { useRouter } from "next/navigation";
export function LearnerSettings({ displayName }: { displayName: string }) {
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try { const response = await fetch("/api/learner-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMessage("用户名称已保存，五个板块使用同一用户。"); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  return <div className="settings-form"><label className="settings-field"><UiText text="学习者名称" /><UiElement as="input" aria-label="学习者名称" value={name} onChange={event => setName(event.target.value)} maxLength={60} className="piano-field" /></label><button disabled={busy || !name.trim()} onClick={() => void save()} className="piano-button"><UiText text={busy ? "保存中…" : "保存用户名称"} /></button>{message && <p role="status" className="settings-hint"><UiText text={message} /></p>}{error && <p role="alert" className="utility-notice"><UiText text={error} /></p>}</div>;
}
