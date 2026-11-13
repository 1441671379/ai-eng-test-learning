// FILE: src/lib/pronunciation.ts
import type { SpeakingEvaluation } from "../experiments/speaking-evaluation";
export type PronunciationStatus = "correct" | "mixed" | "needs-work";
export type PronunciationOperation = "match" | "variant" | "substitution" | "deletion" | "insertion";

export interface PronunciationHighlight {
  text: string;
  status: PronunciationStatus;
  feedback: string;
  wordIndex?: number;
  uncertain?: boolean;
  hasUncertainSounds?: boolean;
  expected?: string;
  heard?: string;
  issues?: { operation: PronunciationOperation; expected: string; heard: string }[];
  /** Legacy estimated timestamps. Do not use for word playback. */
  replyStartSec?: number;
  /** End time (seconds) in the learner's recording for this word. */
  replyEndSec?: number;
}

export interface PronunciationPhoneme {
  symbol: string;
  expected: string;
  heard: string;
  accuracy: number;
  status: PronunciationStatus;
  operation?: PronunciationOperation;
  uncertain?: boolean;
  wordIndex?: number | null;
  targetIndex?: number | null;
  heardIndex?: number | null;
  /** Decoder evidence, not a calibrated pronunciation probability. */
  decoderConfidence?: number;
}

export interface PronunciationAssessment {
  evaluation?: SpeakingEvaluation;
  recordWarning?: string;
  assessmentWarning?: string;
  scoringVersion?: string;
  scoreKind?: "phoneme-consistency";
  targetSource?: string;
  targetText: string;
  ipaTarget: string;
  transcript: string;
  overallScore: number;
  summary: string;
  nextStep: string;
  engine: string;
  highlights: PronunciationHighlight[];
  phonemes: PronunciationPhoneme[];
}
