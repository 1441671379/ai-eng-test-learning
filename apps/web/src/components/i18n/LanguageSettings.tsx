"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UiText, UiElement, useUiLocale } from "./UiLocale";
import type { UiLocale } from "@/lib/i18n";
export function LanguageSettings() {
  const { locale } = useUiLocale(), router = useRouter();
  const [selected, setSelected] = useState<UiLocale>(locale), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/interface-language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: selected }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "保存语言失败。");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "保存语言失败。"); }
    finally { setBusy(false); }
  }
  return <UiElement as="section" id="interface-language" aria-label="界面语言设置" className="settings-section"><h2><UiText text="界面语言设置" /></h2><div className="settings-form"><label className="settings-field"><span><UiText text="界面语言" /></span><UiElement as="select" aria-label="界面语言" className="piano-field" value={selected} disabled={busy} onChange={event => setSelected(event.target.value as UiLocale)}><option value="zh-CN">中文</option><option value="en">English</option></UiElement></label><button disabled={busy || selected === locale} onClick={() => void save()} className="piano-button"><UiText text={busy ? "保存中…" : selected === locale ? "已保存" : "保存界面语言"} /></button></div><p className="settings-hint"><UiText text="选择中文或英文界面。文章、录音转写、单词和你输入的内容保留原文。" /></p>{error && <p role="alert" className="utility-notice"><UiText text={error} /></p>}</UiElement>;
}
