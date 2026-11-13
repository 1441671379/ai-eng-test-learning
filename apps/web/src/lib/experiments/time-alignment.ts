import "server-only";
import { getSpeechServiceUrlForRequest } from "../services/runtime";
import { ensureSharedServices } from "../services/lifecycle";
import { ExperimentError } from "./types";
import type { TimeAlignmentResult } from "./time-alignment-types";

export async function analyzeTimeAlignment(request: Request, audio: File, text: string, spoken: string): Promise<TimeAlignmentResult> {
  const address = `${getSpeechServiceUrlForRequest(request)}/experiments/time-alignment`;
  try {
    const probe = await fetch(`${address}/status`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error("speech service unavailable");
  } catch { await ensureSharedServices(); }
  const body = new FormData(); body.set("audio", audio, audio.name || "sentence.wav"); body.set("text", text); body.set("spoken_text", spoken);
  const response = await fetch(address, { method: "POST", body, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ExperimentError(typeof value?.detail === "string" ? value.detail : "时间配对分析失败，请重试。", response.status >= 500 ? 503 : 422);
  if (!value || typeof value.transcript !== "string" || !Number.isFinite(value.duration) || !value.methods ||
      !["soft", "hard"].every(mode => typeof value.methods[mode]?.available === "boolean" && (!value.methods[mode].available ||
        (Array.isArray(value.methods[mode].words) && Array.isArray(value.methods[mode].operations) && Number.isFinite(value.methods[mode].consistencyIndex))))) {
    throw new ExperimentError("时间配对结果格式无效。", 502);
  }
  return value as TimeAlignmentResult;
}