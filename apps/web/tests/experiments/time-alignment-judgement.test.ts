import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS, parseTimeAlignmentSettings, judgeTimeAlignment, createTimeAlignmentExport } from "../../src/lib/experiments/time-alignment-judgement.ts";
import { openExperimentDatabase, readTimeAlignmentSettings, saveTimeAlignmentSettings, createExperiment, readExperiment } from "../../src/lib/experiments/database.ts";
import type { TimeAlignmentResult, TimedPhoneOperation } from "../../src/lib/experiments/time-alignment-types.ts";
const defaults = { ...DEFAULT_TIME_ALIGNMENT_SETTINGS, matchThreshold: 80, confidenceThreshold: 60 };

function recording(kinds: TimedPhoneOperation["operation"][] = ["match", "match", "match", "match", "substitution"], confidences = [.3, .4, .5, .4, .3]): TimeAlignmentResult {
  const sounds = ["a", "b", "t", "d", "e"], target: string[] = [], heard: string[] = [], heardConfidence: number[] = [];
  const operations = kinds.map((operation, i) => {
    const expected = operation === "insertion" ? null : sounds[i], actual = operation === "deletion" ? null : operation === "match" ? expected : operation === "variant" ? "ɾ" : "x";
    const targetIndex = expected === null ? null : target.length, heardIndex = actual === null ? null : heard.length;
    if (expected !== null) target.push(expected);
    if (actual !== null) { heard.push(actual); heardConfidence.push(confidences[i]); }
    return { operation, targetIndex, heardIndex, wordIndex: 0, expected, heard: actual, uncertain: true };
  });
  const method = { available: true as const, mode: "soft" as const, version: "old", words: [{ wordIndex: 0, word: "sample", start: 0, end: 1, status: "uncertain" as const, expectedPhones: target, heardPhones: heard, heardIndices: heard.map((_, i) => i), phoneDetailsUncertain: true }],
    operations, certainErrorWords: [], missingTranscriptWords: [], orphanHeardIndices: [], phoneOwnerCandidates: heard.map(() => [0]), consistencyIndex: 80, sentenceEditDistance: 1, scoreKind: "experimental-phoneme-consistency-not-calibrated" as const };
  return { version: "old", targetText: "sample", transcript: "sample", transcriptSource: "provided", duration: 1, elapsedSeconds: 1, experimental: true,
    methods: { soft: method, hard: { ...method, mode: "hard" } }, windows: [{ owners: [0], trusted: true, start: 0, end: 1 }],
    evidence: heard.map((token, i) => ({ token, confidence: heardConfidence[i], peakSec: .1 + i * .1 })),
    timing: { version: "cached", model: "cached", device: "cpu", alignmentSeconds: .1, modelLoadSeconds: .1 } };
}
function judge(result = recording(), settings = defaults) { return judgeTimeAlignment(result, "soft", settings)[0]; }

test("80 percent matches stay green despite low decoder confidence and the old grey verdict", () => {
  const word = judge();
  assert.equal(word.matchPercent, 80); assert.equal(word.verdict, "green"); assert.equal(word.assignment, "unique");
  assert.ok(word.meanConfidence! < 60); assert.equal(word.lowConfidenceCount, 5);
  assert.equal(judge(recording(), { ...defaults, matchThreshold: 81 }).verdict, "orange");
});
test("100 percent matches stay green; optional confidence gate uses the whole word mean", () => {
  const result = recording(["match", "match", "match", "match", "match"]);
  assert.equal(judge(result, { ...defaults, matchThreshold: 100 }).verdict, "green");
  assert.equal(judge(result, { ...defaults, useConfidenceForColor: true }).verdict, "orange");
  const oneLow = recording(["match", "match", "match", "match", "match"], [.2, .9, .9, .9, .9]);
  assert.equal(judge(oneLow, { ...defaults, useConfidenceForColor: true }).meanConfidence, 76);
  assert.equal(judge(oneLow, { ...defaults, useConfidenceForColor: true }).verdict, "green");
});
test("both slider endpoints and exact inclusive thresholds work", () => {
  assert.equal(judge(recording(), { ...defaults, useConfidenceForColor: true, confidenceThreshold: 0 }).verdict, "green");
  assert.equal(judge(recording(undefined, [1, 1, 1, 1, 1]), { ...defaults, useConfidenceForColor: true, confidenceThreshold: 100 }).verdict, "green");
  assert.equal(judge(recording(["substitution", "substitution", "substitution", "substitution", "substitution"]), { ...defaults, matchThreshold: 0 }).verdict, "green");
  assert.equal(judge(recording(), { ...defaults, matchThreshold: 100 }).verdict, "orange");
  assert.equal(judge(recording(undefined, [.6, .6, .6, .6, .6]), { ...defaults, useConfidenceForColor: true }).verdict, "green");
});
test("deletions and insertions reduce match rate; allowed variants can be toggled", () => {
  const result = recording(["match", "match", "variant", "deletion", "insertion"]);
  assert.equal(judge(result).matchPercent, 60);
  assert.equal(judge(result, { ...defaults, acceptVariants: false }).matchPercent, 40);
  assert.equal(judge(result, { ...defaults, matchThreshold: 60 }).verdict, "green");
  assert.equal(judge(result, { ...defaults, matchThreshold: 60, acceptVariants: false }).verdict, "orange");
  const fraction = recording(["match", "match", "substitution"]);
  assert.equal(judge(fraction, { ...defaults, matchThreshold: 67 }).verdict, "orange");
});
test("missing time, empty heard phones and missing comparison are unscored even at zero threshold", () => {
  for (const change of ["time", "phones", "operations", "transcript"] as const) {
    const result = recording(), method = result.methods.soft;
    if (!method.available) throw new Error();
    if (change === "time") method.words[0].start = null;
    if (change === "phones") { method.words[0].heardPhones = []; method.words[0].heardIndices = []; }
    if (change === "operations") method.operations = [];
    if (change === "transcript") method.missingTranscriptWords = [0];
    assert.equal(judge(result, { ...defaults, matchThreshold: 0 }).verdict, "unscored", change);
  }
});
test("missing confidence never masquerades as zero; it blocks only the optional gate", () => {
  const result = recording(); result.evidence[0].confidence = NaN;
  assert.equal(judge(result).meanConfidence, null); assert.equal(judge(result).verdict, "green");
  assert.equal(judge(result, { ...defaults, useConfidenceForColor: true }).verdict, "unscored");
});
test("assignment ambiguity remains visible without automatically failing matched words", () => {
  const result = recording();
  if (!result.methods.soft.available) throw new Error();
  result.methods.soft.phoneOwnerCandidates![0] = [0, 1];
  assert.equal(judge(result).assignment, "multiple"); assert.equal(judge(result).verdict, "green");
  result.methods.soft.phoneOwnerCandidates = undefined;
  assert.equal(judge(result).assignment, "unknown"); assert.equal(judge(result).verdict, "green");
});
test("a phone displayed in a neighbour but also eligible for this word makes ownership ambiguous", () => {
  const result = recording();
  if (!result.methods.soft.available) throw new Error();
  result.methods.soft.phoneOwnerCandidates!.push([0, 1]);
  assert.equal(judge(result).assignment, "multiple");
});
test("invalid persisted/API settings are rejected, including nonfinite and string thresholds", () => {
  assert.deepEqual(parseTimeAlignmentSettings(defaults), defaults);
  for (const threshold of [-1, 101, 80.5, NaN, Infinity, "80", null]) assert.throws(() => parseTimeAlignmentSettings({ ...defaults, matchThreshold: threshold }));
  assert.throws(() => parseTimeAlignmentSettings({ ...defaults, useConfidenceForColor: "false" }));
  assert.throws(() => parseTimeAlignmentSettings({ ...defaults, version: 2 }));
});
test("export includes both recalculated methods and settings while preserving raw evidence and old verdicts", () => {
  const result = recording(), snapshot = JSON.stringify(result), exported = createTimeAlignmentExport(result, defaults, "hard");
  assert.deepEqual(exported.judgement.settings, defaults); assert.equal(exported.judgement.selectedMode, "hard");
  assert.equal(exported.judgement.methods.soft.words![0].verdict, "green");
  assert.equal(JSON.stringify(result), snapshot); assert.deepEqual(exported.methods, result.methods);
  result.methods.hard = { available: false, reason: "no timing", version: "old", mode: "hard" };
  assert.deepEqual(createTimeAlignmentExport(result, defaults, "soft").judgement.methods.hard, { available: false, reason: "no timing" });
});
test("debug settings survive reopening and remain isolated from another learner and existing records", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "time-alignment-settings-"));
  try {
    const path = join(directory, "a.sqlite"), a = openExperimentDatabase(path), b = openExperimentDatabase(join(directory, "b.sqlite"));
    const record = createExperiment(a, "coach", "existing conversation");
    const settings = { ...defaults, matchThreshold: 91, useConfidenceForColor: true };
    try { saveTimeAlignmentSettings(a, settings); assert.deepEqual(readTimeAlignmentSettings(b), DEFAULT_TIME_ALIGNMENT_SETTINGS); assert.deepEqual(readExperiment(a, record.id), record); }
    finally { a.close(); b.close(); }
    const reopened = openExperimentDatabase(path);
    try { assert.deepEqual(readTimeAlignmentSettings(reopened), settings); saveTimeAlignmentSettings(reopened, { ...defaults }); assert.deepEqual(readTimeAlignmentSettings(reopened), defaults); }
    finally { reopened.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
