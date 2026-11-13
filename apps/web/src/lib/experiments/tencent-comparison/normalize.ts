import { sentenceTimeAssessment } from "../speaking-evaluation";
import type { TimeAlignmentResult } from "../time-alignment-types";
import type { TimeAlignmentSettings } from "../time-alignment-judgement";
import type { ComparisonMetrics, ComparisonPhone, TencentEvaluationMode } from "./types";

// Same word boundaries as services/speech/time_word_alignment.py (hyphens split words).
export const comparisonTokens = (text: string) => text.match(/[a-z]+(?:['’][a-z]+)*/gi) || [];
const number = (value: unknown, max = 100): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const token = (s: string) => s.toLowerCase().replaceAll("’", "'").replace(/[^a-z'\-]/g, "");
const string = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const bool = (value: unknown) => typeof value === "boolean" ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const scaled = (value: unknown, scale: 1 | 100) => { const n = number(value, scale); return n === null ? null : n * (100 / scale); };
export function tencentPhone(input: unknown, index: number, mode: TencentEvaluationMode): ComparisonPhone {
  const phone = object(input), scale = mode === 4 ? 1 : 100;
  return { index, expected: string(phone.ReferencePhone), heard: string(phone.Phone), accuracy: scaled(phone.PronAccuracy, scale),
    rawAccuracy: typeof phone.PronAccuracy === "number" && Number.isFinite(phone.PronAccuracy) ? phone.PronAccuracy : null, accuracyScale: scale,
    confidence: null, matchTag: number(phone.MatchTag, 4), operation: null, startMs: number(phone.MemBeginTime, Infinity), endMs: number(phone.MemEndTime, Infinity), peakMs: null,
    stress: bool(phone.Stress), detectedStress: bool(phone.DetectedStress), referenceLetter: string(phone.ReferenceLetter) };
}
/** Sequence alignment preserves repeated words and extra words; never zip providers by array position. */
export function alignWords(target: string[], words: string[]) {
  const dp = Array.from({ length: target.length + 1 }, () => Array<number>(words.length + 1).fill(0));
  for (let i = 0; i <= target.length; i++) dp[i][0] = i;
  for (let j = 0; j <= words.length; j++) dp[0][j] = j;
  for (let i = 1; i <= target.length; i++) for (let j = 1; j <= words.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (token(target[i - 1]) === token(words[j - 1]) ? 0 : 1));
  const mapping = words.map(() => ({ targetIndex: null as number | null, alignment: "extra" as "extra" | "exact" | "substitution" }));
  let i = target.length, j = words.length;
  while (i || j) {
    const exact = i > 0 && j > 0 && token(target[i - 1]) === token(words[j - 1]);
    if (i && j && dp[i][j] === dp[i - 1][j - 1] + (exact ? 0 : 1)) { mapping[j - 1] = { targetIndex: i - 1, alignment: exact ? "exact" : "substitution" }; i--; j--; }
    else if (j && dp[i][j] === dp[i][j - 1] + 1) j--;
    else i--;
  }
  return mapping;
}
export function normalizeTencent(data: Record<string, unknown>, text: string, mode: TencentEvaluationMode = 1): ComparisonMetrics {
  if (!["SuggestedScore", "PronAccuracy"].some(key => number(data[key]) !== null || data[key] === -1) || !Array.isArray(data.Words) || data.Words.length > 300) throw new Error("Invalid Tencent metrics");
  const words = data.Words as Record<string, unknown>[];
  if (words.some(word => !word || typeof word.Word !== "string")) throw new Error("Invalid Tencent words");
  const mapping = alignWords(comparisonTokens(text), words.map(w => w.Word as string));
  return { detailsVersion: 2, evalMode: mode, score: scaled(data.SuggestedScore, mode === 4 ? 1 : 100), accuracy: scaled(data.PronAccuracy, mode === 4 ? 1 : 100), phonemeMatch: null,
    fluency: number(data.PronFluency, 1) === null ? null : (data.PronFluency as number) * 100,
    completion: mode === 4 ? null : scaled(data.PronCompletion, 1), coverage: null,
    words: words.map((word, index) => ({ index, ...mapping[index], word: word.Word as string, startMs: number(word.MemBeginTime, Infinity), endMs: number(word.MemEndTime, Infinity),
      accuracy: number(word.PronAccuracy), phonemeMatch: null, fluency: number(word.PronFluency, 1) === null ? null : (word.PronFluency as number) * 100,
      confidence: null, matchTag: number(word.MatchTag, 4), verdict: null, phones: Array.isArray(word.PhoneInfos) ? word.PhoneInfos : [],
      phonemes: Array.isArray(word.PhoneInfos) ? word.PhoneInfos.map((phone, i) => tencentPhone(phone, i, mode)) : [], referenceWord: string(word.ReferenceWord),
      tone: { valid: bool(object(word.Tone).Valid), reference: number(object(word.Tone).RefTone, 4), detected: number(object(word.Tone).HypothesisTone, 4) } })) };
}
export function normalizeLocal(data: TimeAlignmentResult, settings: TimeAlignmentSettings): ComparisonMetrics {
  const assessment = sentenceTimeAssessment(data, settings), evaluation = assessment.evaluation!, method = data.methods.soft;
  if (!method.available || number(assessment.score) === null) throw new Error("Local alignment unavailable");
  const scored = evaluation.words.filter(w => w.verdict !== "unscored");
  return { detailsVersion: 2, score: assessment.score, phonemeMatch: assessment.score, accuracy: null, fluency: null, completion: null,
    coverage: evaluation.words.length ? scored.length / evaluation.words.length * 100 : null,
    words: evaluation.words.map((word, index) => ({ index, targetIndex: word.wordIndex, alignment: "exact", word: word.word,
      startMs: method.words[index].start === null ? null : method.words[index].start! * 1000, endMs: method.words[index].end === null ? null : method.words[index].end! * 1000,
      accuracy: null, phonemeMatch: word.verdict === "unscored" ? null : word.matchPercent, fluency: null, confidence: word.meanConfidence,
      matchTag: null, verdict: word.verdict, phones: method.operations.filter(op => op.wordIndex === word.wordIndex),
      phonemes: method.operations.filter(op => op.wordIndex === word.wordIndex).map((op, index): ComparisonPhone => {
        const evidence = op.heardIndex === null ? null : data.evidence[op.heardIndex];
        return { index, expected: op.expected, heard: op.heard, accuracy: null, rawAccuracy: null, accuracyScale: null,
          confidence: evidence ? scaled(evidence.confidence, 1) : null, matchTag: null, operation: op.operation,
          startMs: null, endMs: null, peakMs: evidence && number(evidence.peakSec, Infinity) !== null ? evidence.peakSec * 1000 : null,
          stress: null, detectedStress: null, referenceLetter: null };
      }) })) };
}
