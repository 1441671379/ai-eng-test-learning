import { test } from "node:test";
import assert from "node:assert/strict";
import { coachTimeAssessment, sentenceTimeAssessment } from "../../src/lib/experiments/speaking-evaluation.ts";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS as settings } from "../../src/lib/experiments/time-alignment-judgement.ts";
import type { TimeAlignmentResult, TimedPhoneOperation } from "../../src/lib/experiments/time-alignment-types.ts";

function result(): TimeAlignmentResult {
  const expected = ["t", "ɛ", "s", "t"], heard = ["t", "ɛ", "s", "d", "ə"];
  const operations: TimedPhoneOperation[] = expected.map((phone, i) => ({ operation: i < 3 ? "match" : "substitution", targetIndex: i, heardIndex: i, wordIndex: 0, expected: phone, heard: heard[i], uncertain: true }));
  operations.push({ operation: "insertion", targetIndex: null, heardIndex: 4, wordIndex: 0, expected: null, heard: "ə", uncertain: true });
  const method = { available: true as const, mode: "soft" as const, version: "time-first-v1", words: [{ wordIndex: 0, word: "test", start: 0, end: 1, status: "uncertain" as const, expectedPhones: expected, heardPhones: heard, heardIndices: [0, 1, 2, 3, 4], phoneDetailsUncertain: true }], operations,
    certainErrorWords: [], missingTranscriptWords: [], orphanHeardIndices: [], phoneOwnerCandidates: heard.map(() => [0]), consistencyIndex: 60, sentenceEditDistance: 2, scoreKind: "experimental-phoneme-consistency-not-calibrated" as const };
  return { version: "time-first-v1", experimental: true, targetText: "test", transcript: "test", transcriptSource: "provided", duration: 1, elapsedSeconds: 3,
    methods: { soft: method, hard: { ...method, mode: "hard" } }, evidence: heard.map((token, i) => ({ token, confidence: .3, peakSec: i / 10 })),
    windows: [{ owners: [0], trusted: true, start: 0, end: 1 }], timing: { version: "existing", model: "existing", device: "cpu", modelLoadSeconds: .1, alignmentSeconds: .1 } };
}
test("coach and sentence practice share 60/40, time grouping, and green/orange verdicts", () => {
  assert.equal(settings.matchThreshold, 60); assert.equal(settings.confidenceThreshold, 40); assert.equal(settings.useConfidenceForColor, false);
  const alignment = result(), sentence = sentenceTimeAssessment(alignment, settings), coach = coachTimeAssessment(alignment, settings);
  assert.equal(sentence.engine, "time-first-phoneme"); assert.equal(coach.engine, sentence.engine);
  assert.deepEqual(sentence.evaluation, coach.evaluation); assert.equal(sentence.evaluation!.words[0].matchPercent, 60);
  assert.equal(sentence.words[0].status, "unflagged"); assert.equal(coach.highlights[0].status, "correct");
  assert.equal(coach.overallScore, sentence.score); assert.equal(coach.evaluation!.words[0].meanConfidence, 30);
  assert.equal(coach.evaluation!.words[0].lowConfidenceCount, 5);
});
test("both flows apply a selected confidence gate and preserve each assessment's settings", () => {
  const input = { ...settings, useConfidenceForColor: true }, alignment = result(), before = JSON.stringify(alignment);
  const sentence = sentenceTimeAssessment(alignment, input), coach = coachTimeAssessment(alignment, input);
  assert.equal(sentence.words[0].status, "review"); assert.equal(coach.highlights[0].status, "needs-work");
  input.matchThreshold = 99;
  assert.equal(coach.evaluation!.settings.matchThreshold, 60); assert.equal(JSON.stringify(alignment), before);
});
test("unavailable timing is a recoverable failure, never a fabricated zero score", () => {
  const alignment = result(); alignment.methods.soft = { available: false, version: "old", mode: "soft", reason: "实际文字映射有多解" };
  for (const adapt of [sentenceTimeAssessment, coachTimeAssessment]) assert.throws(() => adapt(alignment, settings), (error: unknown) => error instanceof Error && "status" in error && error.status === 422);
});
test("a word without actual sound remains unscored in both flows", () => {
  const alignment = result(); if (!alignment.methods.soft.available) throw new Error();
  alignment.methods.soft.words[0].heardPhones = []; alignment.methods.soft.words[0].heardIndices = [];
  const coach = coachTimeAssessment(alignment, settings), sentence = sentenceTimeAssessment(alignment, settings);
  assert.equal(coach.evaluation!.words[0].verdict, "unscored"); assert.equal(coach.highlights[0].uncertain, true);
  assert.equal(sentence.evaluation!.words[0].verdict, "unscored");
});
