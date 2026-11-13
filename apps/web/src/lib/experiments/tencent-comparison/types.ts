import type { TimeAlignmentSettings } from "../time-alignment-judgement";

export type ProviderStatus = "pending" | "success" | "failed" | "not_configured";
export type TencentEvaluationMode = 1 | 4;
export interface ComparisonPhone {
  index: number;
  expected: string | null;
  heard: string | null;
  accuracy: number | null;
  rawAccuracy: number | null;
  accuracyScale: 1 | 100 | null;
  confidence: number | null;
  matchTag: number | null;
  operation: string | null;
  startMs: number | null;
  endMs: number | null;
  peakMs: number | null;
  stress: boolean | null;
  detectedStress: boolean | null;
  referenceLetter: string | null;
}
export interface ComparisonWord {
  index: number;
  targetIndex: number | null;
  alignment: "exact" | "substitution" | "extra";
  word: string;
  startMs: number | null;
  endMs: number | null;
  accuracy: number | null;
  phonemeMatch: number | null;
  fluency: number | null;
  confidence: number | null;
  matchTag: number | null;
  verdict: string | null;
  phones: unknown[];
  phonemes?: ComparisonPhone[];
  referenceWord?: string | null;
  tone?: { valid: boolean | null; reference: number | null; detected: number | null };
}
export interface ComparisonMetrics {
  detailsVersion?: 2;
  evalMode?: TencentEvaluationMode;
  score: number | null;
  accuracy: number | null;
  phonemeMatch: number | null;
  fluency: number | null;
  completion: number | null;
  coverage: number | null;
  words: ComparisonWord[];
}
export interface ProviderResult {
  status: ProviderStatus;
  elapsedMs: number | null;
  httpStatus: number | null;
  requestId: string | null;
  error: string | null;
  rawResponse: string | null;
  metrics: ComparisonMetrics | null;
}
export interface ComparisonRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  text: string;
  audio: { id: string; sha256: string; filename: string; bytes: number; durationMs: number; sampleRate: 16000; channels: 1; bitsPerSample: 16 };
  request: {
    local: { endpoint: "/experiments/time-alignment"; settings: TimeAlignmentSettings; spokenText: "" };
    tencent: { product: "soe-basic" | "soe-websocket"; endpoint: string; action: "TransmitOralProcessWithInit" | "SpeakingAssessment"; version: "2018-07-24" | "websocket-v1"; parameters: Record<string, string | number> };
  };
  local: ProviderResult;
  tencent: ProviderResult;
  annotation: { label: string; notes: string };
}
export type ComparisonSummary = Pick<ComparisonRecord, "id" | "createdAt" | "text" | "audio"> & { localStatus: ProviderStatus; tencentStatus: ProviderStatus };
export const pendingResult = (): ProviderResult => ({ status: "pending", elapsedMs: null, httpStatus: null, requestId: null, error: null, rawResponse: null, metrics: null });
