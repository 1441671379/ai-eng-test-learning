import { LEGACY_PRONUNCIATION_ENGINE } from "../compatibility/legacy";
import type { CoachFeedback } from "../models/types";
import type { PronunciationAssessment } from "../speech/types";
import type { TimeAlignmentResult } from "./time-alignment-types";
import type { SpeakingEvaluation } from "./speaking-evaluation";
import type { ArticleReading } from "./article-reading";

export type ExperimentKind = "coach" | "pronunciation" | "time-alignment" | "article-reading";
export type ExperimentReplyMode = "target" | "freedom";
export interface ExperimentTurn {
  id: string;
  question: string;
  reply: string | null;
  feedback: CoachFeedback | null;
  provider: string;
  model: string;
  suggestedReply?: string;
  replyMode?: ExperimentReplyMode;
  assessment?: PronunciationAssessment | null;
  assessmentError?: string;
  replyRevision?: number;
}
export interface ExperimentPhone {
  expected: string;
  heard: string;
  concern: number | null;
}
export interface ExperimentWord {
  word: string;
  expected: string;
  heard: string;
  status: "unflagged" | "review" | "uncertain";
  phones: ExperimentPhone[];
  concern?: number | null;
}
export interface ExperimentAssessment {
  score: number;
  transcript: string;
  words: ExperimentWord[];
  expectedPhones: string;
  heardPhones: string;
  phoneSource: "audio" | "transcript";
  engine: typeof LEGACY_PRONUNCIATION_ENGINE | "time-first-phoneme";
  evaluation?: SpeakingEvaluation;
  feedback?: string;
  heardConfidence?: (number | null)[];
  phonemeTrace?: { expected: number[]; heard: number[] };
  prosody?: { pitch: number[]; energy: number[] };
  metrics?: { wordErrorRate: number | null; phoneErrorRate: number | null; acousticDistance: number | null };
}
export interface ExperimentSession {
  id: string;
  kind: ExperimentKind;
  topic: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  turns: ExperimentTurn[];
  assessment: ExperimentAssessment | null;
  timeAlignment?: TimeAlignmentResult;
  replyMode?: ExperimentReplyMode;
  articleReading?: ArticleReading;
}
export type ExperimentSummary = Pick<ExperimentSession, "id" | "kind" | "topic" | "createdAt" | "updatedAt"> & {
  replies: number;
  score: number | null;
  articleProgress?: { recorded: number; total: number; complete: boolean };
};
export class ExperimentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function experimentText(input: unknown, limit: number, label: string): string {
  if (typeof input !== "string" || !input.trim() || input.length > limit) throw new ExperimentError(`${label}不能为空，且不能超过 ${limit} 个字符。`);
  return input.trim();
}
export function experimentId(input: unknown): string {
  if (typeof input !== "string" || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(input)) throw new ExperimentError("实验记录编号无效。");
  return input;
}
export function conversationHistory(session: ExperimentSession) {
  return session.turns.flatMap(turn => [{ role: "coach", content: turn.question }, ...(turn.reply ? [{ role: "user", content: turn.reply }] : [])]).slice(-16);
}
