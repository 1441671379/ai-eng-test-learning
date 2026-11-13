"use client";

import { useRef, useState, type FormEvent } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import type { publicTencentConfig } from "@/lib/experiments/tencent-comparison/tencent";
import styles from "./TencentComparison.module.css";

type Config = ReturnType<typeof publicTencentConfig>;
export function TencentConfigForm({ config, disabled, onSaved, onBusy, unconfiguredGuidance }: { config: Config; disabled: boolean; onSaved: (config: Config) => void; onBusy: (busy: boolean) => void; unconfiguredGuidance?: string }) {
  const { locale } = useUiLocale(), en = locale === "en", t = (zh: string, english: string) => en ? english : zh;
  const [appId, setAppId] = useState<string | null>(null), [secretId, setSecretId] = useState(""), [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const pending = useRef(false), locked = disabled || saving;
  async function update(reset: boolean) {
    if (pending.current || disabled) return;
    pending.current = true; setSaving(true); onBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/experiments/tencent-comparison/config", { method: reset ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        ...(reset ? {} : { body: JSON.stringify({ appId: appId ?? config.appId, secretId, secretKey }) }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      onSaved(value.config); setAppId(null); setSecretId(""); setSecretKey("");
      setNotice(reset ? t("已清除页面保存的配置，当前使用环境变量配置（如有）。", "Saved page configuration cleared. Environment configuration is now used, if available.") : t("配置已加密保存，下一次提交立即使用。尚未调用腾讯 API 验证权限。", "Configuration encrypted and saved for the next submission. Tencent API permissions have not been tested."));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("保存失败，请重试。", "Could not save. Please retry.")); }
    finally { pending.current = false; setSaving(false); onBusy(false); }
  }
  function save(event: FormEvent) { event.preventDefault(); void update(false); }
  return <section className={styles.configSection} aria-labelledby="tencent-config-title">
    <div className="speaking-section-head"><h3 id="tencent-config-title">{t("腾讯 API 配置", "Tencent API configuration")}</h3><span className="speaking-small speaking-muted">{config.source === "saved" ? t("当前使用本机保存的配置", "Using locally saved configuration") : config.source === "environment" ? t("当前使用环境变量配置", "Using environment configuration") : t("尚未配置", "Not configured")}</span></div>
    <form onSubmit={save} autoComplete="off" className={styles.configForm}>
      <div className={styles.configFields}>
        <label><span className="speaking-label">AppID</span><input className="piano-field" type="text" inputMode="numeric" name="tencent-app-id" maxLength={20} required={config.protocol === "websocket"} value={appId ?? config.appId} disabled={locked} onChange={event => { setAppId(event.target.value); setNotice(""); }} placeholder={config.protocol === "websocket" ? t("腾讯账号 AppID（必填）", "Tencent account AppID (required)") : t("腾讯账号 AppID（可选）", "Tencent account AppID (optional)")} spellCheck={false} /></label>
        <label><span className="speaking-label">SECRET_ID</span><input className="piano-field" type="password" name="tencent-secret-id" maxLength={512} autoComplete="new-password" value={secretId} disabled={locked} onChange={event => { setSecretId(event.target.value); setNotice(""); }} placeholder={config.hasSecretId ? t("已配置，留空保留", "Configured; leave blank to keep") : t("输入 SECRET_ID", "Enter SECRET_ID")} spellCheck={false} /></label>
        <label><span className="speaking-label">SECRET_KEY</span><input className="piano-field" type="password" name="tencent-secret-key" maxLength={512} autoComplete="new-password" value={secretKey} disabled={locked} onChange={event => { setSecretKey(event.target.value); setNotice(""); }} placeholder={config.hasSecretKey ? t("已配置，留空保留", "Configured; leave blank to keep") : t("输入 SECRET_KEY", "Enter SECRET_KEY")} spellCheck={false} /></label>
      </div>
      <p className="speaking-small speaking-muted">{t("密钥使用当前 Windows 账户加密保存在本机，保存后不回显。两项密钥同时留空可保留已有配置；更换时请同时填写。", "Credentials are encrypted with your Windows account and stored locally. Saved keys are never shown again. Leave both key fields blank to keep them, or enter both to replace them.")}</p>
      <p className="speaking-small speaking-muted">{config.protocol === "websocket" ? t("当前使用与腾讯云语音工作台相同的 WebSocket 接口，AppID、SECRET_ID 和 SECRET_KEY 共同用于鉴权。", "Uses the same WebSocket interface as the Tencent speech workbench. AppID, SECRET_ID, and SECRET_KEY are used for authentication.") : t("当前使用基础版 HTTP 接口；账号 AppID 不作为业务 SoeAppId 发送。此服务开通状态与 WebSocket 接口分别验证。", "Using SOE Basic HTTP. Account AppID is not sent as business SoeAppId. Service availability is verified separately from WebSocket.")}</p>
      <div className="speaking-actions"><button className="piano-button" type="submit" disabled={locked || !config.canSave}>{saving ? t("正在保存…", "Saving…") : t("保存 API 配置", "Save API configuration")}</button>{config.source === "saved" && <button className="piano-text-button" type="button" disabled={locked} onClick={() => void update(true)}>{t("清除页面保存的配置", "Clear saved page configuration")}</button>}</div>
    </form>
    {!config.canSave && <p className="speaking-small">{t("本平台不支持 Windows 密钥加密，请使用服务端环境变量配置。", "Windows credential encryption is unavailable on this platform. Use server environment variables.")}</p>}
    {error && <p role="alert" className="speaking-notice">{error}</p>}
    {config.storageError && <p role="alert" className="speaking-notice">{config.storageError}</p>}
    {notice && <p role="status" className="speaking-notice">{notice}</p>}
    <div className="speaking-notice"><strong>{config.configured ? t("腾讯配置已填写", "Tencent configuration supplied") : t("腾讯评测未配置", "Tencent evaluation not configured")}</strong><p>{config.configured ? t("是否开通服务及拥有权限，将由实际请求验证。", "Service activation and permissions will be verified by an actual request.") : unconfiguredGuidance ?? t("仍可提交并保存本地结果；腾讯一侧会明确记录为未配置。", "You can still save local results. Tencent is recorded as not configured.")}</p>{config.errors.map(value => <p key={value}>{value}</p>)}</div>
    <details><summary>{t("高级配置与接口说明", "Advanced configuration and API details")}</summary><p className="speaking-small">{config.protocol === "websocket" ? "WebSocket · soe.cloud.tencent.com" : "HTTP · soe.tencentcloudapi.com"} · {t("英文句子 · 严格度", "English sentences · score coefficient")} {config.scoreCoeff ?? "—"} / 4</p><p className="speaking-small">{t("页面配置优先于环境变量。默认使用 WebSocket 录音评测，整段 WAV 一次发送；原始握手、结果与错误消息全部保存。仅需基础版 HTTP 时，可设置服务端 ENGLISH_TENCENT_SOE_PROTOCOL=http。", "Page configuration takes priority over environment variables. WebSocket recording assessment is the default: the entire WAV is sent once and raw handshake, result, and error messages are retained. Set server ENGLISH_TENCENT_SOE_PROTOCOL=http only when SOE Basic HTTP is required.")}</p><a href={config.protocol === "websocket" ? "https://cloud.tencent.com/document/product/1774/107497" : "https://cloud.tencent.com/document/product/884/32605"} target="_blank" rel="noreferrer" className="piano-text-link">{t("腾讯官方接口文档", "Official Tencent API documentation")}</a></details>
  </section>;
}
