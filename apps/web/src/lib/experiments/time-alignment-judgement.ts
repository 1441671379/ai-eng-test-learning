import type { TimeAlignmentMethod, TimeAlignmentMode, TimeAlignmentResult, TimedWord } from "./time-alignment-types";

export interface TimeAlignmentSettings {
  version: 1;
  matchThreshold: number;
  confidenceThreshold: number;
  useConfidenceForColor: boolean;
  acceptVariants: boolean;
}
export const DEFAULT_TIME_ALIGNMENT_SETTINGS: Readonly<TimeAlignmentSettings> = Object.freeze({
  version: 1, matchThreshold: 60, confidenceThreshold: 40, useConfidenceForColor: false, acceptVariants: true,
});

export function parseTimeAlignmentSettings(input: unknown): TimeAlignmentSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("调试参数格式无效。");
  const value = input as Record<string, unknown>;
  if (value.version !== 1 || typeof value.useConfidenceForColor !== "boolean" || typeof value.acceptVariants !== "boolean") throw new Error("调试参数版本或开关无效。");
  for (const key of ["matchThreshold", "confidenceThreshold"] as const) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100) throw new Error("阈值必须是 0–100 的整数。");
  }
  return { version: 1, matchThreshold: value.matchThreshold as number, confidenceThreshold: value.confidenceThreshold as number,
    useConfidenceForColor: value.useConfidenceForColor, acceptVariants: value.acceptVariants };
}

export function phoneConfidence(result: TimeAlignmentResult, index: number | null): number | null {
  if (index === null) return null;
  const confidence = result.evidence[index]?.confidence;
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence * 100 : null;
}

export interface WordJudgement {
  wordIndex: number;
  word: string;
  verdict: "green" | "orange" | "unscored";
  matchPercent: number | null;
  matchedCount: number;
  operationCount: number;
  meanConfidence: number | null;
  lowConfidenceCount: number;
  assignment: "unique" | "multiple" | "missing" | "unknown";
  reason: string;
}

export function judgeTimeAlignedWord(result: TimeAlignmentResult, method: Extract<TimeAlignmentMethod, { available: true }>, word: TimedWord, settings: TimeAlignmentSettings): WordJudgement {
  const operations = method.operations.filter(p => p.wordIndex === word.wordIndex);
  const matchedCount = operations.filter(p => p.operation === "match" || (settings.acceptVariants && p.operation === "variant")).length;
  const confidences = word.heardIndices.map(i => phoneConfidence(result, i));
  const completeConfidence = confidences.length > 0 && confidences.every(c => c !== null);
  const meanConfidence = completeConfidence ? confidences.reduce<number>((sum, c) => sum + c!, 0) / confidences.length : null;
  const hasTime = word.start !== null && word.end !== null && Number.isFinite(word.start) && Number.isFinite(word.end) && word.start < word.end && !method.missingTranscriptWords.includes(word.wordIndex);
  const windows = result.windows?.filter(w => w.owners.includes(word.wordIndex));
  const missing = !hasTime || (word.timingEligible !== undefined ? !word.timingEligible : windows !== undefined && (windows.length !== 1 || !windows[0].trusted));
  const owners = method.phoneOwnerCandidates;
  // Examine every candidate, including phones assigned to a neighbour in the
  // displayed path. Otherwise a word that could gain a phone looks unique.
  const multiple = owners?.some(candidates => candidates.includes(word.wordIndex) && candidates.length > 1);
  const knownOwners = owners !== undefined && word.heardIndices.every(i => owners[i]?.includes(word.wordIndex));
  const assignment: WordJudgement["assignment"] = missing ? "missing" : multiple ? "multiple" : knownOwners ? "unique" : "unknown";
  const base = { wordIndex: word.wordIndex, word: word.word, matchedCount, operationCount: operations.length,
    matchPercent: operations.length ? matchedCount / operations.length * 100 : null, meanConfidence,
    lowConfidenceCount: confidences.filter(c => c !== null && c < settings.confidenceThreshold).length, assignment };
  const insufficient = missing ? "缺少可靠单词时间。" : !word.heardPhones.length || !word.heardIndices.length ? "没有分配到实际音素。" : !operations.length ? "缺少音素配对结果。" : settings.useConfidenceForColor && meanConfidence === null ? "缺少完整识别置信度，无法应用置信度门槛。" : null;
  if (insufficient) return { ...base, verdict: "unscored", reason: `未评分：${insufficient}` };
  // Compare unrounded values; display rounding must never move the threshold.
  const matchPassed = matchedCount * 100 >= settings.matchThreshold * operations.length;
  const confidencePassed = meanConfidence !== null && meanConfidence + 1e-9 >= settings.confidenceThreshold;
  const green = matchPassed && (!settings.useConfidenceForColor || confidencePassed);
  return { ...base, verdict: green ? "green" : "orange", reason: [
    matchPassed ? `音素匹配率达到 ${settings.matchThreshold}% 门槛。` : `音素匹配率未达到 ${settings.matchThreshold}% 门槛。`,
    settings.useConfidenceForColor ? confidencePassed ? `整词平均置信度达到 ${settings.confidenceThreshold}% 门槛。` : `整词平均置信度未达到 ${settings.confidenceThreshold}% 门槛。` : "识别置信度仅作提示，未参与颜色判定。",
    ...(multiple ? ["存在多个同样最优的归属，颜色依据当前展示配对。"] : []),
  ].join(" ") };
}

export function judgeTimeAlignment(result: TimeAlignmentResult, mode: TimeAlignmentMode, settings: TimeAlignmentSettings): WordJudgement[] {
  const method = result.methods[mode];
  return method.available ? method.words.map(word => judgeTimeAlignedWord(result, method, word, settings)) : [];
}

export function createTimeAlignmentExport(result: TimeAlignmentResult, settings: TimeAlignmentSettings, mode: TimeAlignmentMode) {
  const policy = parseTimeAlignmentSettings(settings);
  return { ...result, judgement: { version: "word-colour-v1", exportedAt: new Date().toISOString(), settings: policy, selectedMode: mode,
    matchFormula: "(match + accepted variant) / (match + variant + substitution + deletion + insertion)",
    confidenceFormula: "arithmetic mean of all heard phones assigned to this word; decoder confidence, not pronunciation accuracy",
    methods: Object.fromEntries((["soft", "hard"] as const).map(key => [key, result.methods[key].available
      ? { available: true, words: judgeTimeAlignment(result, key, policy) } : { available: false, reason: result.methods[key].reason }])) } };
}
