import type { ComparisonMetrics, ComparisonPhone, ComparisonRecord, ComparisonWord, TencentEvaluationMode } from "./types";
import { comparisonTokens, normalizeLocal, normalizeTencent, tencentPhone } from "./normalize";

export function comparisonMode(record: ComparisonRecord): TencentEvaluationMode {
  const p = record.request.tencent.parameters;
  return Number(p.eval_mode ?? p.EvalMode) === 4 ? 4 : 1;
}
function extendMetrics(previous: ComparisonMetrics | null, derived: ComparisonMetrics): ComparisonMetrics {
  if (!previous) return derived;
  return { ...previous, detailsVersion: 2, evalMode: derived.evalMode, words: previous.words.map(word => {
    const detail = derived.words.find(item => item.index === word.index);
    return detail ? { ...word, phonemes: detail.phonemes, tone: detail.tone, referenceWord: detail.referenceWord } : word;
  }) };
}
/** Old records gain a derived view without overwriting their original request or raw response. */
export function detailedComparison(record: ComparisonRecord): ComparisonRecord {
  let value = record;
  if (record.local.status === "success" && record.local.metrics?.detailsVersion !== 2 && record.local.rawResponse) {
    try { value = { ...value, local: { ...value.local, metrics: extendMetrics(record.local.metrics, normalizeLocal(JSON.parse(record.local.rawResponse), record.request.local.settings)) } }; } catch { /* Partial legacy evidence stays readable. */ }
  }
  if (record.tencent.status === "success" && record.tencent.metrics?.detailsVersion !== 2 && record.tencent.rawResponse) {
    try {
      const messages = record.request.tencent.product === "soe-basic" ? [JSON.parse(record.tencent.rawResponse)] : record.tencent.rawResponse.split("\n").filter(Boolean).map(line => JSON.parse(line));
      const message = messages.findLast(item => item.Response || item.final === 1 && item.result) || messages.findLast(item => item.result?.SentenceId === -1);
      const result = message?.Response || (typeof message?.result === "string" ? JSON.parse(message.result) : message?.result);
      if (result) value = { ...value, tencent: { ...value.tencent, metrics: extendMetrics(record.tencent.metrics, normalizeTencent(result, record.text, comparisonMode(record))) } };
    } catch { /* Raw response remains the source of truth. */ }
  }
  return value;
}
export function comparisonPhones(word: ComparisonWord | undefined, provider: "local" | "tencent", mode: TencentEvaluationMode): ComparisonPhone[] {
  if (!word) return [];
  if (word.phonemes) return word.phonemes;
  if (provider === "tencent") return word.phones.map((phone, index) => tencentPhone(phone, index, mode));
  return word.phones.map((raw, index) => {
    const op = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return { index, expected: typeof op.expected === "string" ? op.expected : null, heard: typeof op.heard === "string" ? op.heard : null,
      accuracy: null, rawAccuracy: null, accuracyScale: null, confidence: null, matchTag: null, operation: typeof op.operation === "string" ? op.operation : null,
      startMs: null, endMs: null, peakMs: null, stress: null, detectedStress: null, referenceLetter: null };
  });
}
export function comparisonRows(record: ComparisonRecord) {
  return comparisonTokens(record.text).map((word, targetIndex) => ({ word, targetIndex,
    local: record.local.metrics?.words.filter(item => item.targetIndex === targetIndex) || [],
    tencent: record.tencent.metrics?.words.filter(item => item.targetIndex === targetIndex) || [] }));
}
export function wordTimingDelta(local: ComparisonWord | undefined, tencent: ComparisonWord | undefined) {
  const valid = local?.alignment === "exact" && tencent?.alignment === "exact";
  return { startMs: valid && local.startMs !== null && tencent.startMs !== null ? local.startMs - tencent.startMs : null,
    endMs: valid && local.endMs !== null && tencent.endMs !== null ? local.endMs - tencent.endMs : null };
}
export function playableRange(startMs: number | null, endMs: number | null, durationMs: number): { start: number; end: number } | null {
  if (startMs === null || endMs === null || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || startMs >= durationMs) return null;
  return { start: startMs / 1000, end: Math.min(endMs, durationMs) / 1000 };
}
