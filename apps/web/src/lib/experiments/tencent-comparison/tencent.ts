import { createHash, createHmac } from "node:crypto";
import type { ComparisonRecord, ProviderResult, TencentEvaluationMode } from "./types";
import { normalizeTencent } from "./normalize";
import { evaluateTencentWebsocket } from "./tencent-websocket";

export const TENCENT_ENDPOINT = "https://soe.tencentcloudapi.com" as const;
export const TENCENT_ACTION = "TransmitOralProcessWithInit" as const;
export const TENCENT_VERSION = "2018-07-24" as const;
export function tencentConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const secretId = env.ENGLISH_TENCENT_SOE_SECRET_ID?.trim() || "", secretKey = env.ENGLISH_TENCENT_SOE_SECRET_KEY?.trim() || "";
  const rawCoeff = env.ENGLISH_TENCENT_SOE_SCORE_COEFF?.trim(), scoreCoeff = rawCoeff ? Number(rawCoeff) : 4;
  const appId = env.ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID?.trim() || "", rawProtocol = env.ENGLISH_TENCENT_SOE_PROTOCOL?.trim() || "websocket";
  const protocol = rawProtocol === "http" ? "http" as const : "websocket" as const;
  const missing = [!secretId && "ENGLISH_TENCENT_SOE_SECRET_ID", !secretKey && "ENGLISH_TENCENT_SOE_SECRET_KEY"].filter(Boolean) as string[];
  if (protocol === "websocket" && !appId) missing.push("AppID");
  const errors = Number.isFinite(scoreCoeff) && scoreCoeff >= 1 && scoreCoeff <= 4 ? [] : ["ENGLISH_TENCENT_SOE_SCORE_COEFF 必须为 1–4"];
  if (!["http", "websocket"].includes(rawProtocol)) errors.push("ENGLISH_TENCENT_SOE_PROTOCOL 必须为 websocket 或 http");
  if (appId && !/^\d{1,20}$/.test(appId)) errors.push("AppID 必须是数字账号标识");
  return { secretId, secretKey, appId, protocol, token: env.ENGLISH_TENCENT_SOE_TOKEN?.trim() || "", soeAppId: env.ENGLISH_TENCENT_SOE_APP_ID?.trim() || "", scoreCoeff, missing, errors, configured: !missing.length && !errors.length };
}
export function publicTencentConfig(config = tencentConfig(), options: { source?: "saved" | "environment" | "none"; storageError?: string | null } = {}) {
  return { configured: config.configured, missing: config.missing, errors: config.errors, scoreCoeff: Number.isFinite(config.scoreCoeff) ? config.scoreCoeff : null,
    product: config.protocol === "websocket" ? "soe-websocket" : "soe-basic", protocol: config.protocol,
    action: config.protocol === "websocket" ? "SpeakingAssessment" : TENCENT_ACTION, version: config.protocol === "websocket" ? "websocket-v1" : TENCENT_VERSION, hasSoeAppId: Boolean(config.soeAppId),
    appId: config.appId, hasSecretId: Boolean(config.secretId), hasSecretKey: Boolean(config.secretKey), canSave: process.platform === "win32",
    source: options.source || (config.secretId || config.secretKey ? "environment" : "none"), storageError: options.storageError || null,
    message: config.configured ? "服务端配置已填写，服务开通与权限以实际调用结果为准。" : "腾讯评测未配置或配置无效；提交仍会保存录音和本地结果。" };
}
export function tencentRequest(text: string, sessionId: string, config: ReturnType<typeof tencentConfig>, mode: TencentEvaluationMode = 1): ComparisonRecord["request"]["tencent"] {
  if (config.protocol === "websocket") return { product: "soe-websocket", endpoint: `wss://soe.cloud.tencent.com/soe/api/${config.appId}`, action: "SpeakingAssessment", version: "websocket-v1",
    parameters: { voice_id: sessionId, voice_format: 1, text_mode: 0, ref_text: text, keyword: "", eval_mode: mode, score_coeff: Number.isFinite(config.scoreCoeff) ? config.scoreCoeff : 4,
      server_engine_type: "16k_en", sentence_info_enabled: 0, rec_mode: 1 } };
  return { product: "soe-basic", endpoint: TENCENT_ENDPOINT, action: TENCENT_ACTION, version: TENCENT_VERSION,
    parameters: { SessionId: sessionId, RefText: text, WorkMode: 1, EvalMode: mode, ServerType: 0, TextMode: 0, ScoreCoeff: Number.isFinite(config.scoreCoeff) ? config.scoreCoeff : 4,
      SeqId: 1, IsEnd: 1, VoiceFileType: 2, VoiceEncodeType: 1, IsAsync: 0, ...(config.soeAppId ? { SoeAppId: config.soeAppId } : {}) } };
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
/** TC3 v3, signing exactly the JSON string sent on the wire. No region required by SOE. */
export function tencentHeaders(body: string, config: ReturnType<typeof tencentConfig>, timestamp = Math.floor(Date.now() / 1000)) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10), scope = `${date}/soe/tc3_request`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:soe.tencentcloudapi.com\nx-tc-action:${TENCENT_ACTION.toLowerCase()}\n\n${signedHeaders}\n${hash(body)}`;
  const key = hmac(hmac(hmac("TC3" + config.secretKey, date), "soe"), "tc3_request");
  const signature = createHmac("sha256", key).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).digest("hex");
  return { "Content-Type": "application/json; charset=utf-8", "X-TC-Action": TENCENT_ACTION, "X-TC-Version": TENCENT_VERSION, "X-TC-Timestamp": String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${config.secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    ...(config.token ? { "X-TC-Token": config.token } : {}) };
}
export async function evaluateTencent(record: ComparisonRecord, audio: Buffer, config: ReturnType<typeof tencentConfig>, send: typeof fetch = fetch): Promise<ProviderResult> {
  const result: ProviderResult = { status: "failed", elapsedMs: null, httpStatus: null, requestId: null, rawResponse: null, metrics: null, error: null };
  if (!config.configured) return { ...result, status: "not_configured", error: [...config.missing.map(name => `缺少 ${name}`), ...config.errors].join("；") };
  if (record.request.tencent.product === "soe-websocket") return evaluateTencentWebsocket(record, audio, config);
  const started = Date.now();
  try {
    const body = JSON.stringify({ ...record.request.tencent.parameters, UserVoiceData: audio.toString("base64") });
    const response = await send(TENCENT_ENDPOINT, { method: "POST", headers: tencentHeaders(body, config), body, redirect: "error", signal: AbortSignal.timeout(60_000) });
    result.httpStatus = response.status; result.rawResponse = await response.text();
    const value = JSON.parse(result.rawResponse), data = value?.Response;
    result.requestId = typeof data?.RequestId === "string" ? data.RequestId : null;
    if (data?.Error) result.error = data.Error.Code === "AuthFailure.AccountUnavailable"
      ? "腾讯基础版 HTTP 接口返回 AuthFailure.AccountUnavailable：该接口服务未开通或账号状态不可用。WebSocket 工作台能用并不代表此 HTTP 服务已开通，请使用 WebSocket 接入。"
      : `腾讯评测失败：${String(data.Error.Code || "UnknownError")}`;
    else if (!response.ok || data?.Status !== "Finished") result.error = `腾讯未返回最终评测结果（HTTP ${response.status}，${String(data?.Status || "无状态")}）。`;
    else { result.metrics = normalizeTencent(data, record.text, Number(record.request.tencent.parameters.EvalMode) === 4 ? 4 : 1); result.status = "success"; }
  } catch { result.error = "腾讯请求超时、网络不可用或响应格式无效。可导出记录查看已收到的响应。"; }
  result.elapsedMs = Date.now() - started;
  return result;
}
