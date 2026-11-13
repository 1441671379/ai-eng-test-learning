import type { TimeAlignmentResult } from "./time-alignment-types";
import { judgeTimeAlignment, parseTimeAlignmentSettings, type TimeAlignmentSettings, type WordJudgement } from "./time-alignment-judgement";
import { ExperimentError, type ExperimentAssessment } from "./types";
import type { PronunciationAssessment } from "../speech/types";

export interface SpeakingEvaluation {
  version: "time-first-word-colour-v1";
  alignment: TimeAlignmentResult;
  settings: TimeAlignmentSettings;
  words: WordJudgement[];
}
export class AssessmentUnavailableError extends ExperimentError {
  readonly alignment: TimeAlignmentResult;
  constructor(message: string, alignment: TimeAlignmentResult) { super(message, 422); this.alignment = alignment; }
}
export function speakingEvaluation(alignment: TimeAlignmentResult, input: TimeAlignmentSettings): SpeakingEvaluation {
  const settings = parseTimeAlignmentSettings(input);
  if (!alignment.methods.soft.available) throw new AssessmentUnavailableError(alignment.methods.soft.reason, alignment);
  return { version: "time-first-word-colour-v1", alignment, settings, words: judgeTimeAlignment(alignment, "soft", settings) };
}
export function sentenceTimeAssessment(alignment: TimeAlignmentResult, settings: TimeAlignmentSettings): ExperimentAssessment {
  const evaluation = speakingEvaluation(alignment, settings), method = alignment.methods.soft;
  if (!method.available) throw new ExperimentError(method.reason, 422);
  const scored = evaluation.words.filter(word => word.verdict !== "unscored");
  const operations = scored.reduce((sum, word) => sum + word.operationCount, 0);
  if (!operations && alignment.version === "time-first-lexical-partial-v2") throw new AssessmentUnavailableError("本次未取得可靠的单词定位或音素配对。已保留识别文字，请核对或重新录音。", alignment);
  const score = alignment.version === "time-first-lexical-partial-v2" ? Math.round(scored.reduce((sum, word) => sum + word.matchedCount, 0) / operations * 1000) / 10 : method.consistencyIndex;
  return { engine: "time-first-phoneme", score, transcript: alignment.transcript, phoneSource: "audio", evaluation,
    expectedPhones: method.words.map(w => w.expectedPhones.join(" ")).join(" / "), heardPhones: alignment.evidence.map(p => p.token).join(" "),
    heardConfidence: alignment.evidence.map(p => p.confidence),
    words: method.words.map((word, index) => ({ word: word.word, expected: word.expectedPhones.join(" "), heard: word.heardPhones.join(" "),
      status: evaluation.words[index].verdict === "green" ? "unflagged" : evaluation.words[index].verdict === "orange" ? "review" : "uncertain", phones: [] })) };
}
export function coachTimeAssessment(alignment: TimeAlignmentResult, settings: TimeAlignmentSettings): PronunciationAssessment {
  const sentence = sentenceTimeAssessment(alignment, settings), evaluation = sentence.evaluation!;
  return { targetText: alignment.targetText, ipaTarget: sentence.expectedPhones, transcript: alignment.transcript, overallScore: sentence.score,
    engine: "time-first-phoneme", scoringVersion: evaluation.version, scoreKind: "phoneme-consistency", evaluation,
    summary: "按单词时间与边界容错配对实际音素，逐词应用匹配率门槛。", nextStep: "查看橙色单词的目标与实际音素，再对照示范练习。",
    highlights: evaluation.words.map(word => ({ text: word.word, wordIndex: word.wordIndex, status: word.verdict === "green" ? "correct" : word.verdict === "orange" ? "needs-work" : "mixed", uncertain: word.verdict === "unscored", feedback: word.reason })),
    // New feedback uses the original timed operations, never fabricated accuracy
    // numbers in the old per-phone schema. Legacy history remains readable.
    phonemes: [] };
}
