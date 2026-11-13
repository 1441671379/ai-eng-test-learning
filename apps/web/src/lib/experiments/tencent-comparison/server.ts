import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "../../pairing/store";
import { getSpeechServiceUrlForRequest } from "../../services/runtime";
import { ensureSharedServices } from "../../services/lifecycle";
import { experimentDatabase } from "../server";
import { readTimeAlignmentSettings } from "../database";
import { ExperimentError, experimentText } from "../types";
import { validateComparisonWav, MAX_COMPARISON_BYTES } from "./audio";
import { comparisonTokens, normalizeLocal } from "./normalize";
import { openComparisonDatabase, saveComparison, completeProvider, readComparison } from "./store";
import { tencentRequest, evaluateTencent } from "./tencent";
import { loadTencentSettings } from "./credentials";
import { pendingResult, type ComparisonRecord, type ProviderResult, type TencentEvaluationMode } from "./types";

export async function comparisonDatabase<T>(userId: string, run: (db: ReturnType<typeof openComparisonDatabase>) => T): Promise<T> {
  const directory = join(resolveDataDir(), "experiments", "tencent-soe"); await mkdir(directory, { recursive: true });
  const db = openComparisonDatabase(join(directory, createHash("sha256").update(userId).digest("hex") + ".sqlite"));
  try { return run(db); } finally { db.close(); }
}
async function evaluateLocal(request: Request, record: ComparisonRecord, wav: Buffer): Promise<ProviderResult> {
  const result: ProviderResult = { ...pendingResult(), status: "failed" }, started = Date.now();
  try {
    const endpoint = `${getSpeechServiceUrlForRequest(request)}/experiments/time-alignment`;
    try { const probe = await fetch(`${endpoint}/status`, { cache: "no-store", signal: AbortSignal.timeout(3000) }); if (!probe.ok) throw new Error(); }
    catch { await ensureSharedServices(); }
    const body = new FormData(); body.set("audio", new File([new Uint8Array(wav)], "comparison.wav", { type: "audio/wav" })); body.set("text", record.text); body.set("spoken_text", "");
    const response = await fetch(endpoint, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(180_000) });
    result.httpStatus = response.status; result.rawResponse = await response.text();
    if (!response.ok) result.error = `本地评测失败（HTTP ${response.status}），已保留响应。`;
    else { result.metrics = normalizeLocal(JSON.parse(result.rawResponse), record.request.local.settings); result.status = "success"; }
  } catch (error) { result.error = error instanceof ExperimentError ? error.message : "本地评测超时、服务不可用或响应无法评分；腾讯结果独立保存。"; }
  result.elapsedMs = Date.now() - started; return result;
}
export async function runComparison(request: Request, userId: string) {
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_COMPARISON_BYTES + 32_768) throw new ExperimentError("对照录音请求过大。", 413);
  const form = await request.formData(), audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size || audio.size > MAX_COMPARISON_BYTES) throw new ExperimentError("请提交 30 秒内的对照 WAV 录音。", 422);
  const text = experimentText(form.get("text"), 500, "请求文本").replaceAll("’", "'");
  if (!comparisonTokens(text).length || comparisonTokens(text).length > 30 || /[^a-z\s.,!?;:'"()\-]/i.test(text)) throw new ExperimentError("请输入不超过 30 词的英文句子，仅包含英文单词和常用标点；数字请写成英文单词。");
  const rawMode = form.get("eval_mode") ?? "1";
  if (rawMode !== "1" && rawMode !== "4") throw new ExperimentError("请选择句子评测（1）或单词纠错（4）。");
  const mode: TencentEvaluationMode = rawMode === "4" ? 4 : 1;
  if (mode === 4 && comparisonTokens(text).length !== 1) throw new ExperimentError("单词纠错实验每次只提交一个英文单词，请切回句子评测或缩短文本。");
  const wav = Buffer.from(await audio.arrayBuffer()), durationMs = validateComparisonWav(wav), sha256 = createHash("sha256").update(wav).digest("hex");
  const settings = await experimentDatabase(userId, readTimeAlignmentSettings), { config } = await loadTencentSettings(resolveDataDir(), userId), id = randomUUID(), now = new Date().toISOString();
  if (mode === 4 && config.protocol !== "websocket") throw new ExperimentError("本实验的单词纠错模式需要使用 WebSocket 接入。");
  const record: ComparisonRecord = { schemaVersion: 1, id, createdAt: now, updatedAt: now, text,
    audio: { id: sha256, sha256, filename: audio.name.slice(0, 200), bytes: wav.length, durationMs, sampleRate: 16000, channels: 1, bitsPerSample: 16 },
    request: { local: { endpoint: "/experiments/time-alignment", settings, spokenText: "" }, tencent: tencentRequest(text, id, config, mode) },
    local: pendingResult(), tencent: pendingResult(), annotation: { label: "", notes: "" } };
  await comparisonDatabase(userId, db => saveComparison(db, record, wav));
  await Promise.allSettled((["local", "tencent"] as const).map(async provider => {
    const result = provider === "local" ? await evaluateLocal(request, record, wav) : await evaluateTencent(record, wav, config);
    await comparisonDatabase(userId, db => completeProvider(db, id, provider, result));
  })).then(results => { for (const result of results) if (result.status === "rejected") throw result.reason; });
  return comparisonDatabase(userId, db => readComparison(db, id));
}
