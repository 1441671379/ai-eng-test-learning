import { createHmac, randomInt } from "node:crypto";
import type { tencentConfig } from "./tencent";
import type { ComparisonRecord, ProviderResult } from "./types";
import { normalizeTencent } from "./normalize";

export interface TencentSocket {
  send(data: string | Uint8Array): void;
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}
export type TencentSocketFactory = (url: string) => TencentSocket;
/** Same HMAC-SHA1 URL scheme as Tencent's Go speech SDK. Signed URLs are never saved or logged. */
export function tencentWebsocketUrl(record: ComparisonRecord, config: ReturnType<typeof tencentConfig>, timestamp = Math.floor(Date.now() / 1000), nonce = randomInt(1, 2_147_483_647)) {
  const endpoint = `soe.cloud.tencent.com/soe/api/${config.appId}`;
  const parameters = { ...record.request.tencent.parameters, secretid: config.secretId, timestamp, expired: timestamp + 3600, nonce,
    ...(config.token ? { token: config.token } : {}) };
  const entries = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b, "en"));
  const unsigned = endpoint + "?" + entries.map(([key, value]) => `${key}=${value}`).join("&");
  const signature = createHmac("sha1", config.secretKey).update(unsigned).digest("base64");
  return `wss://${endpoint}?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}&signature=${encodeURIComponent(signature)}`;
}
const defaultSocket: TencentSocketFactory = url => {
  const constructor = (globalThis as unknown as { WebSocket: new (url: string) => TencentSocket }).WebSocket;
  if (!constructor) throw new Error("WebSocket unavailable");
  return new constructor(url);
};
export function evaluateTencentWebsocket(record: ComparisonRecord, audio: Buffer, config: ReturnType<typeof tencentConfig>, connect: TencentSocketFactory = defaultSocket, timeoutMs = 60_000): Promise<ProviderResult> {
  const started = Date.now(), frames: string[] = [];
  const result: ProviderResult = { status: "failed", elapsedMs: null, httpStatus: null, requestId: null, error: null, rawResponse: null, metrics: null };
  if (!config.configured) return Promise.resolve({ ...result, status: "not_configured", error: [...config.missing.map(name => `缺少 ${name}`), ...config.errors].join("；") });
  return new Promise(resolve => {
    let socket: TencentSocket | undefined, settled = false, sent = false, rawBytes = 0, aggregate: Record<string, unknown> | null = null;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      result.elapsedMs = Date.now() - started; result.rawResponse = frames.length ? frames.join("\n") : null;
      if (error) result.error = error;
      try { socket?.close(); } catch { /* The peer may already have closed. */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish("腾讯 WebSocket 评测超时，已保存收到的原始消息。"), timeoutMs);
    try {
      socket = connect(tencentWebsocketUrl(record, config));
      socket.addEventListener("open", () => { result.httpStatus = 101; });
      socket.addEventListener("error", () => finish("腾讯 WebSocket 连接失败，请检查网络或代理设置。"));
      socket.addEventListener("close", () => finish("腾讯连接已关闭，未收到 final=1 的最终评测结果。"));
      socket.addEventListener("message", event => {
        if (settled) return;
        if (typeof event.data !== "string") { finish("腾讯返回了无法解析的消息类型。"); return; }
        rawBytes += Buffer.byteLength(event.data);
        if (rawBytes > 2 * 1024 * 1024) { finish("腾讯响应过大，已保留此前收到的消息。"); return; }
        frames.push(event.data);
        try {
          const message = JSON.parse(event.data);
          if (!message || typeof message.code !== "number") throw new Error("Invalid message");
          if (typeof message.message_id === "string") result.requestId = message.message_id;
          else if (!result.requestId && typeof message.voice_id === "string") result.requestId = message.voice_id;
          if (message.voice_id && message.voice_id !== record.id) { finish("腾讯返回的 voice_id 与本次录音请求不一致，未采纳评分。"); return; }
          if (message.code !== 0) {
            const meanings: Record<number, string> = { 4002: "鉴权失败，请核对 AppID、SECRET_ID 和 SECRET_KEY", 4003: "AppID 的口语评测服务未开通", 4004: "资源包耗尽", 4005: "账号欠费", 4006: "并发调用超限", 4007: "音频解码失败" };
            finish(`腾讯 WebSocket 评测失败（${message.code}）：${meanings[message.code] || "请查看已保存的腾讯原始响应"}。`); return;
          }
          const data = typeof message.result === "string" ? JSON.parse(message.result) : message.result;
          if (data && typeof data === "object" && !Array.isArray(data) && data.SentenceId === -1) aggregate = data;
          if (message.final === 1) {
            const finalData = data && typeof data === "object" && !Array.isArray(data) ? data : aggregate;
            if (!sent || !finalData) { finish("腾讯发送了结束消息，但未返回可用的最终分项。原始消息已保留。"); return; }
            result.metrics = normalizeTencent(finalData, record.text, Number(record.request.tencent.parameters.eval_mode) === 4 ? 4 : 1); result.status = "success"; finish(); return;
          }
          // Wait for Tencent's successful handshake before sending the entire canonical WAV once.
          if (!sent) { sent = true; socket!.send(new Uint8Array(audio)); socket!.send('{"type":"end"}'); }
        } catch { finish("腾讯 WebSocket 响应格式无效或无法提取最终评分，已保存原始消息。"); }
      });
    } catch { finish("腾讯 WebSocket 接入失败，当前运行环境无法建立连接。"); }
  });
}
