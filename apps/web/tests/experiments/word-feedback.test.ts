import { test } from "node:test";
import assert from "node:assert/strict";
import { phonemeFeedbackLabel, pronunciationNotice, wordFeedbackCounts, wordFeedbackLabel } from "../../src/lib/speech/feedback.ts";
import type { PronunciationAssessment, PronunciationHighlight, PronunciationPhoneme } from "../../src/lib/speech/types.ts";

test("uncertain word ownership overrides a historical red or green status", () => {
  const highlights: PronunciationHighlight[] = [
    { text: "had", status: "needs-work", uncertain: true, feedback: "ambiguous" },
    { text: "had", status: "correct", uncertain: true, feedback: "ambiguous" },
    { text: "fish", status: "correct", feedback: "match" },
    { text: "to", status: "mixed", feedback: "possible weak vowel" },
    { text: "think", status: "needs-work", feedback: "theta to s" },
  ];
  assert.equal(wordFeedbackLabel(highlights[0]), "无法确认");
  assert.equal(wordFeedbackLabel(highlights[1]), "无法确认");
  assert.deepEqual(wordFeedbackCounts(highlights), { matched: 1, review: 1, uncertain: 2, variation: 1 });
});

test("phoneme feedback describes the edit rather than presenting rule values as accuracy percentages", () => {
  const phone: PronunciationPhoneme = { symbol: "/θ/", expected: "/θ/", heard: "/s/", accuracy: 0, status: "needs-work", operation: "substitution" };
  assert.equal(phonemeFeedbackLabel(phone), "疑似替换");
  assert.equal(phonemeFeedbackLabel({ ...phone, operation: "deletion" }), "疑似漏读");
  assert.equal(phonemeFeedbackLabel({ ...phone, operation: "insertion" }), "额外音素");
  assert.equal(phonemeFeedbackLabel({ ...phone, uncertain: true }), "无法确认");
});

test("old stored assessments remain readable and are distinguished from newly aligned feedback", () => {
  const assessment: PronunciationAssessment = { targetText: "think", ipaTarget: "/θ ɪ ŋ k/", transcript: "s ɪ ŋ k", overallScore: 75, summary: "old", nextStep: "retry", engine: "wav2vec2", highlights: [], phonemes: [] };
  assert.match(pronunciationNotice(assessment)!, /历史结果/);
  assert.equal(pronunciationNotice({ ...assessment, scoringVersion: "word-alignment-v2" }), null);
  assert.equal(pronunciationNotice({ ...assessment, scoringVersion: "word-alignment-v2", assessmentWarning: "部分词无法确认" }), "部分词无法确认");
});
