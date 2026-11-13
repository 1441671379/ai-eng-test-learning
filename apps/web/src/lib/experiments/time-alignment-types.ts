export type TimeAlignmentMode = "soft" | "hard";
export interface TimedPhoneOperation {
  operation: "match" | "variant" | "substitution" | "insertion" | "deletion";
  targetIndex: number | null;
  heardIndex: number | null;
  wordIndex: number | null;
  expected: string | null;
  heard: string | null;
  uncertain: boolean;
}
export interface TimedWord {
  wordIndex: number;
  word: string;
  start: number | null;
  end: number | null;
  status: "needs-work" | "uncertain" | "no-clear-error";
  expectedPhones: string[];
  heardPhones: string[];
  heardIndices: number[];
  phoneDetailsUncertain: boolean;
  timingEligible?: boolean;
  pronunciation?: PronunciationReference;
}
export interface PronunciationReference {
  version: string;
  dictionary: { accent: "US" | "UK"; ipa: string; source: string }[];
  selectedPhones: string[];
  source: string;
  mixedAccentsAllowed: boolean;
}
export type TimeAlignmentMethod = { available: false; reason: string; mode: TimeAlignmentMode; version: string } | {
  available: true;
  mode: TimeAlignmentMode;
  version: string;
  words: TimedWord[];
  operations: TimedPhoneOperation[];
  certainErrorWords: number[];
  missingTranscriptWords: number[];
  orphanHeardIndices: number[];
  phoneOwnerCandidates?: (number | null)[][];
  consistencyIndex: number;
  sentenceEditDistance: number;
  scoreKind: "experimental-phoneme-consistency-not-calibrated";
  partial?: boolean;
  warnings?: string[];
};
export interface TimeAlignmentResult {
  version: string;
  targetText: string;
  transcript: string;
  transcriptSource: "provided" | "whisper";
  duration: number;
  elapsedSeconds: number;
  profile?: { audioDecodeSeconds: number; transcriptionSeconds: number; targetPhonemizeSeconds: number; phoneRecognitionSeconds: number; wordTimingSeconds: number; groupingSeconds: number };
  experimental: true;
  methods: Record<TimeAlignmentMode, TimeAlignmentMethod>;
  evidence: { token: string; confidence: number; peakSec: number }[];
  windows?: { owners: (number | null)[]; trusted: boolean; start: number | null; end: number | null }[];
  timing: { version: string; model: string; device: string; alignmentSeconds: number; modelLoadSeconds: number };
}
