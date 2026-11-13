import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { articleSegmentWords, articleTokens, createArticleReading, saveArticleAttempt, saveArticleFailure, summarizeArticle, summarizeArticleSegment, confirmArticleOmission, requireArticle } from "../../src/lib/experiments/article-reading.ts";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS } from "../../src/lib/experiments/time-alignment-judgement.ts";
import { AssessmentUnavailableError, sentenceTimeAssessment } from "../../src/lib/experiments/speaking-evaluation.ts";
import { createExperiment, listExperiments, mutateExperiment, openExperimentDatabase, readExperiment } from "../../src/lib/experiments/database.ts";
import type { TimeAlignmentMethod, TimeAlignmentResult } from "../../src/lib/experiments/time-alignment-types.ts";

type Plan = { count: number; matches: number; missing?: boolean };
function attempt(text: string, plan: Plan[]) {
  const evidence: TimeAlignmentResult["evidence"] = [], operations: Extract<TimeAlignmentMethod, { available: true }>["operations"] = [];
  const words = articleTokens(text).map(({ word }, wordIndex) => {
    const config = plan[wordIndex], indices: number[] = [];
    for (let i = 0; i < config.count; i++) {
      const index = evidence.length;
      if (!config.missing) { evidence.push({ token: i < config.matches ? "a" : "b", confidence: .9, peakSec: wordIndex + .5 }); indices.push(index); }
      operations.push({ wordIndex, expected: "a", heard: config.missing ? null : i < config.matches ? "a" : "b", operation: config.missing ? "deletion" : i < config.matches ? "match" : "substitution", targetIndex: operations.length, heardIndex: config.missing ? null : index, uncertain: Boolean(config.missing) });
    }
    return { wordIndex, word, start: config.missing ? null : wordIndex, end: config.missing ? null : wordIndex + .8,
      status: "no-clear-error" as const, expectedPhones: Array(config.count).fill("a"), heardPhones: indices.map(index => evidence[index].token), heardIndices: indices, phoneDetailsUncertain: Boolean(config.missing) };
  });
  const method: TimeAlignmentMethod = { available: true, version: "fixture", mode: "soft", words, operations, certainErrorWords: [], missingTranscriptWords: plan.flatMap((word, index) => word.missing ? [index] : []), orphanHeardIndices: [], phoneOwnerCandidates: evidence.map((_, index) => [words.find(word => word.heardIndices.includes(index))!.wordIndex]), consistencyIndex: 80, sentenceEditDistance: 0, scoreKind: "experimental-phoneme-consistency-not-calibrated" };
  const result: TimeAlignmentResult = { version: "fixture", targetText: text.trim(), transcript: words.filter((_, index) => !plan[index].missing).map(word => word.word).join(" "), transcriptSource: "whisper", duration: words.length, elapsedSeconds: .1, experimental: true,
    evidence, methods: { soft: method, hard: { ...method, mode: "hard" } }, timing: { version: "fixture", model: "fixture", device: "cpu", alignmentSeconds: .1, modelLoadSeconds: 0 } };
  return { id: randomUUID(), assessedAt: new Date().toISOString(), confirmedOmissions: [], assessment: sentenceTimeAssessment(result, DEFAULT_TIME_ALIGNMENT_SETTINGS) };
}

test("long articles split inside service limits, retain all punctuation and map repeated words by position", () => {
  const text = Array.from({length: 110}, (_, i) => `We don't forget word ${i}.`).join("\n\n");
  const article = createArticleReading(text, "A long article", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  assert.ok(article.segments.length > 2);
  assert.equal(article.segments.map(segment => segment.text).join(""), article.text);
  let next = 0, word = 0;
  for (const segment of article.segments) {
    assert.equal(segment.start, next); assert.equal(segment.wordStart, word);
    assert.equal(article.text.slice(segment.start, segment.end), segment.text);
    assert.equal(articleTokens(segment.text).length, segment.wordCount);
    assert.ok(segment.wordCount <= 35 && segment.text.length <= 600);
    next = segment.end; word += segment.wordCount;
  }
  assert.equal(word, article.wordCount); assert.equal(next, article.text.length);
  assert.deepEqual(articleTokens("had had, isn’t").map(token => token.word), ["had", "had", "isn’t"]);
});

test("English content, length and unusually long tokens are validated before saving", () => {
  for (const text of [" ", "没有英文单词", "a ".repeat(2001), "a".repeat(121), "word " + " ".repeat(16000)]) {
    assert.throws(() => createArticleReading(text, "test", DEFAULT_TIME_ALIGNMENT_SETTINGS));
  }
  const settings = { ...DEFAULT_TIME_ALIGNMENT_SETTINGS };
  const article = createArticleReading("cat", "", settings); settings.matchThreshold = 90;
  assert.equal(article.settings.matchThreshold, 60);
});

test("full scores are weighted by phone operations rather than green word counts", () => {
  const article = createArticleReading("cat elephant", "Weighted", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  saveArticleAttempt(article, 0, 0, attempt(article.text, [{count:3,matches:3},{count:7,matches:0}]));
  assert.deepEqual(articleSegmentWords(article.segments[0]).map(word => word.colour), ["green", "red"]);
  const summary = summarizeArticle(article);
  assert.equal(summary.score, 30); assert.equal(summary.complete, true); assert.equal(summary.green, 1); assert.equal(summary.red, 1);
});

test("unreliable words stay pending; confirmed omissions count as zero and can be undone", () => {
  const article = createArticleReading("cat dog", "Omission", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  saveArticleAttempt(article, 0, 0, attempt(article.text, [{count:3,matches:3},{count:3,matches:0,missing:true}]));
  assert.equal(summarizeArticle(article).score, 100); assert.equal(summarizeArticle(article).complete, false);
  assert.equal(articleSegmentWords(article.segments[0])[1].colour, "pending");
  confirmArticleOmission(article, 0, 1, 1, true);
  assert.equal(summarizeArticle(article).score, 50); assert.equal(summarizeArticle(article).complete, true);
  assert.equal(articleSegmentWords(article.segments[0])[1].colour, "red");
  confirmArticleOmission(article, 0, 2, 1, false);
  assert.equal(summarizeArticle(article).pending, 1); assert.equal(summarizeArticle(article).complete, false);
  assert.throws(() => confirmArticleOmission(article, 0, 3, 0, true), /无需手动/);
});

test("unrecorded segments cannot inflate a completed full-article score", () => {
  const article = createArticleReading(Array(75).fill("cat").join(" "), "Partial", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  const first = article.segments[0];
  saveArticleAttempt(article, 0, 0, attempt(first.text, Array(first.wordCount).fill({count:3,matches:3})));
  const summary = summarizeArticle(article);
  assert.equal(summary.score, 100); assert.equal(summary.complete, false); assert.equal(summary.scoredWords, first.wordCount);
  assert.equal(summary.recordedSegments, 1); assert.equal(summary.pending, 75 - first.wordCount);
});

test("re-recording replaces the current segment, keeps other segments and bounds attempt history", () => {
  const article = createArticleReading(Array(40).fill("cat").join(" "), "Retry", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  const second = article.segments[1];
  saveArticleAttempt(article, 1, 0, attempt(second.text, Array(second.wordCount).fill({count:3,matches:3})));
  const secondId = second.attempt!.id;
  for (let i = 0; i < 12; i++) saveArticleAttempt(article, 0, i, attempt(article.segments[0].text, Array(35).fill({count:3,matches: i === 11 ? 0 : 3})));
  assert.equal(article.segments[0].history.length, 10); assert.equal(second.attempt!.id, secondId);
  assert.equal(articleSegmentWords(article.segments[0])[0].colour, "red");
  assert.throws(() => saveArticleAttempt(article, 0, 0, attempt(article.segments[0].text, Array(35).fill({count:3,matches:3}))), /其他页面更新/);
});

test("wrong targets and settings cannot be stored against a different article segment", () => {
  const article = createArticleReading("cat", "Validation", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  assert.throws(() => saveArticleAttempt(article, 0, 0, attempt("dog", [{count:3,matches:3}])), /不一致/);
  const value = attempt("cat", [{count:3,matches:3}]); value.assessment.evaluation!.settings.matchThreshold = 90;
  assert.throws(() => saveArticleAttempt(article, 0, 0, value), /不一致/);
  assert.equal(article.segments[0].attempt, null);
});

test("article results persist and stale writes roll back without affecting an unrelated record", () => {
  const db = openExperimentDatabase(":memory:");
  try {
    const article = createArticleReading("cat dog", "Saved article", DEFAULT_TIME_ALIGNMENT_SETTINGS);
    const session = createExperiment(db, "article-reading", article.title, session => {session.articleReading = article;});
    const other = createExperiment(db, "pronunciation", "Untouched sentence");
    mutateExperiment(db, session.id, null, saved => {saveArticleAttempt(requireArticle(saved), 0, 0, attempt(article.text, [{count:3,matches:3},{count:3,matches:0}]));});
    const persisted = requireArticle(readExperiment(db, session.id));
    assert.equal(summarizeArticle(persisted).score, 50);
    const summary = listExperiments(db).find(item => item.id === session.id)!;
    assert.equal(summary.score, 50); assert.equal(summary.articleProgress!.complete, true);
    assert.throws(() => mutateExperiment(db, session.id, null, saved => {saveArticleAttempt(requireArticle(saved), 0, 0, attempt(article.text, [{count:3,matches:0},{count:3,matches:0}]));}), /其他页面更新/);
    assert.equal(summarizeArticle(requireArticle(readExperiment(db, session.id))).score, 50);
    assert.equal(readExperiment(db, other.id).topic, "Untouched sentence");
  } finally {db.close();}
});

test("failed new takes persist diagnostics, preserve the previous score and reject stale retries", () => {
  const article = createArticleReading("cat", "Retry diagnostics", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  const first = attempt("cat", [{ count: 3, matches: 3 }]);
  saveArticleAttempt(article, 0, 0, first);
  saveArticleFailure(article, 0, 1, { id: "failed-take", assessedAt: "2026-10-17T13:00:00Z", status: "failed", transcript: "cap", transcriptSource: "whisper", error: "定位不足" });
  assert.equal(article.segments[0].attempt!.id, first.id);
  assert.equal(article.segments[0].lastSubmission!.status, "failed");
  assert.equal(article.segments[0].lastSubmission!.transcript, "cap");
  assert.equal(article.segments[0].revision, 2);
  assert.equal(summarizeArticle(article).score, 100);
  assert.throws(() => saveArticleFailure(article, 0, 1, article.segments[0].lastSubmission!), /其他页面更新/);
  const retry = attempt("cat", [{ count: 3, matches: 0 }]);
  saveArticleAttempt(article, 0, 2, retry);
  assert.equal(article.segments[0].attempt!.id, retry.id);
  assert.equal(article.segments[0].lastSubmission!.status, "complete");
  assert.equal(summarizeArticle(article).score, 0);
});

test("partial current alignment scores reliable words and preserves pronunciation references", () => {
  const article = createArticleReading("cat dog", "Partial current", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  const value = attempt("cat dog", [{ count: 3, matches: 3 }, { count: 3, matches: 0, missing: true }]);
  const result = value.assessment.evaluation!.alignment;
  result.version = "time-first-lexical-partial-v2";
  const method = result.methods.soft; assert.ok(method.available);
  method.words[0].timingEligible = true;
  method.words[0].pronunciation = { version: "test", dictionary: [{ accent: "US", ipa: "/kæt/", source: "test" }], selectedPhones: ["k", "æ", "t"], source: "test", mixedAccentsAllowed: true };
  // Stale/ambiguous ASR mapping must not override the independently retained
  // safe anchor produced by the partial timing algorithm.
  result.windows = [{ owners: [0, 1], trusted: false, start: 0, end: 1 }];
  value.assessment = sentenceTimeAssessment(result, article.settings);
  assert.equal(value.assessment.score, 100);
  saveArticleAttempt(article, 0, 0, value);
  assert.equal(article.segments[0].lastSubmission!.status, "partial");
  assert.equal(articleSegmentWords(article.segments[0])[0].pronunciation!.dictionary[0].ipa, "/kæt/");
  assert.equal(summarizeArticle(article).pending, 1);
});

test("an unscorable analysis retains ASR diagnostics instead of manufacturing a zero score", () => {
  const value = attempt("cat", [{ count: 3, matches: 3 }]);
  const result = value.assessment.evaluation!.alignment;
  result.methods.soft = { available: false, mode: "soft", version: "test", reason: "无法定位" };
  assert.throws(() => sentenceTimeAssessment(result, DEFAULT_TIME_ALIGNMENT_SETTINGS), error => error instanceof AssessmentUnavailableError && error.alignment.transcript === "cat");
});

test("current timing with no assigned sounds keeps the transcript and does not generate a numeric score", () => {
  const value = attempt("cat", [{ count: 3, matches: 3 }]);
  const result = value.assessment.evaluation!.alignment; result.version = "time-first-lexical-partial-v2";
  assert.ok(result.methods.soft.available);
  result.methods.soft.words[0].heardPhones = []; result.methods.soft.words[0].heardIndices = [];
  assert.throws(() => sentenceTimeAssessment(result, DEFAULT_TIME_ALIGNMENT_SETTINGS), error => error instanceof AssessmentUnavailableError && error.alignment.transcript === "cat");
});


test("paragraph scores use only that paragraph's latest successful evidence and confirmed omissions", () => {
  const article = createArticleReading(Array(40).fill("cat").join(" "), "Paragraph scores", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  const first = article.segments[0], second = article.segments[1];
  assert.equal(summarizeArticleSegment(first).score, null);
  saveArticleAttempt(article, 0, first.revision, attempt(first.text, Array(first.wordCount).fill({count:3,matches:3})));
  assert.equal(summarizeArticleSegment(first).score, 100);
  assert.equal(summarizeArticleSegment(first).complete, true);
  assert.equal(summarizeArticleSegment(second).score, null);
  saveArticleAttempt(article, 1, second.revision, attempt(second.text, Array(second.wordCount).fill({count:3,matches:1})));
  assert.equal(summarizeArticleSegment(second).score, 33.3);
  assert.equal(summarizeArticleSegment(first).score, 100);
  saveArticleFailure(article, 0, first.revision, { id: randomUUID(), assessedAt: new Date().toISOString(), status:"failed", transcript:"", error:"unavailable" });
  assert.equal(summarizeArticleSegment(first).score, 100);

  const partial = createArticleReading("cat dog", "Partial", DEFAULT_TIME_ALIGNMENT_SETTINGS);
  saveArticleAttempt(partial, 0, 0, attempt(partial.text, [{count:3,matches:3},{count:3,matches:0,missing:true}]));
  assert.deepEqual(summarizeArticleSegment(partial.segments[0]), {score:100,scoredWords:1,wordCount:2,complete:false});
  confirmArticleOmission(partial, 0, 1, 1, true);
  assert.deepEqual(summarizeArticleSegment(partial.segments[0]), {score:50,scoredWords:2,wordCount:2,complete:true});
});
