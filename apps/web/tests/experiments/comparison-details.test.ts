import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { normalizeLocal, normalizeTencent } from "../../src/lib/experiments/tencent-comparison/normalize.ts";
import { comparisonMode, comparisonPhones, comparisonRows, detailedComparison, playableRange, wordTimingDelta } from "../../src/lib/experiments/tencent-comparison/details.ts";
import { exportComparisons } from "../../src/lib/experiments/tencent-comparison/export.ts";
import { openComparisonDatabase, readComparison, saveComparison } from "../../src/lib/experiments/tencent-comparison/store.ts";
import { pendingResult, type ComparisonRecord } from "../../src/lib/experiments/tencent-comparison/types.ts";
import { tencentConfig, tencentRequest } from "../../src/lib/experiments/tencent-comparison/tencent.ts";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS as settings } from "../../src/lib/experiments/time-alignment-judgement.ts";
import type { TimeAlignmentResult } from "../../src/lib/experiments/time-alignment-types.ts";

const cloud = () => ({ SuggestedScore: 87, PronAccuracy: 88, PronFluency: .9, PronCompletion: 1, Words: [{ Word: "test", ReferenceWord: "test_0", MemBeginTime: 0, MemEndTime: 200, PronAccuracy: 88, PronFluency: .8, MatchTag: 0,
  PhoneInfos: [{ Phone: "t", ReferencePhone: "", PronAccuracy: 75, MemBeginTime: 0, MemEndTime: 80, MatchTag: 0, Stress: false, DetectedStress: false, ReferenceLetter: "t_0" }], Tone: { Valid: false, RefTone: -1, HypothesisTone: -1 } }] });
function local(): TimeAlignmentResult {
  const method = { available: true as const, version: "test", mode: "soft" as const, words: [{ wordIndex: 0, word: "test", start: .02, end: .3, status: "uncertain" as const, expectedPhones: ["t"], heardPhones: ["t"], heardIndices: [0], phoneDetailsUncertain: false, timingEligible: true }],
    operations: [{ operation: "match" as const, wordIndex: 0, targetIndex: 0, heardIndex: 0, expected: "t", heard: "t", uncertain: false }], certainErrorWords: [], missingTranscriptWords: [], orphanHeardIndices: [], phoneOwnerCandidates: [[0]], consistencyIndex: 100, sentenceEditDistance: 0, scoreKind: "experimental-phoneme-consistency-not-calibrated" as const };
  return { version: "time-first-lexical-partial-v2", experimental: true, targetText: "test", transcript: "test", transcriptSource: "whisper", duration: .4, elapsedSeconds: .1,
    methods: { soft: method, hard: { ...method, mode: "hard" } }, evidence: [{ token: "t", confidence: .6, peakSec: .07 }], timing: { version: "test", model: "test", device: "cpu", alignmentSeconds: 0, modelLoadSeconds: 0 } };
}
function record(): ComparisonRecord {
  const id = randomUUID(); return { schemaVersion: 1, id, createdAt: "2026-10-27", updatedAt: "2026-10-27", text: "test", audio: { id: "sha", sha256: "sha", filename: "test.wav", bytes: 44, durationMs: 400, sampleRate: 16000, channels: 1, bitsPerSample: 16 },
    request: { local: { endpoint: "/experiments/time-alignment", settings: { ...settings }, spokenText: "" }, tencent: tencentRequest("test", id, tencentConfig({})) },
    local: { ...pendingResult(), status: "success", rawResponse: JSON.stringify(local()), metrics: normalizeLocal(local(), settings) },
    tencent: { ...pendingResult(), status: "success", rawResponse: JSON.stringify({ code: 0, final: 1, result: cloud() }), metrics: normalizeTencent(cloud(), "test") }, annotation: { label: "", notes: "" } };
}
test("sentence phones retain zero times, false stress flags, raw scores, and absent reference phones without guessing", () => {
  const m = normalizeTencent(cloud(), "test"), word = m.words[0], phone = word.phonemes![0];
  assert.equal(m.detailsVersion, 2); assert.equal(phone.expected, null); assert.equal(phone.heard, "t"); assert.equal(phone.startMs, 0); assert.equal(phone.accuracy, 75);
  assert.equal(phone.confidence, null); assert.equal(phone.stress, false); assert.equal(phone.detectedStress, false); assert.equal(phone.rawAccuracy, 75); assert.equal(phone.accuracyScale, 100);
  assert.deepEqual(word.tone, { valid: false, reference: null, detected: null }); assert.equal(word.referenceWord, "test_0");
});
test("word correction uses mode-specific score scales and does not turn inapplicable completion into a measured score", () => {
  const data = cloud(); data.SuggestedScore = .97; data.PronAccuracy = .96; data.Words[0].PhoneInfos[0].PronAccuracy = .91; data.Words[0].PhoneInfos[0].ReferencePhone = "t";
  const m = normalizeTencent(data, "test", 4); assert.equal(m.score, 97); assert.equal(m.accuracy, 96); assert.equal(m.words[0].accuracy, 88); assert.equal(m.words[0].phonemes![0].accuracy, 91); assert.equal(m.completion, null);
  data.Words[0].PhoneInfos[0].PronAccuracy = 91;
  const unusual = normalizeTencent(data, "test", 4).words[0].phonemes![0]; assert.equal(unusual.accuracy, null); assert.equal(unusual.rawAccuracy, 91); // Do not silently infer a different scale.
});
test("local phone confidence and peak times stay distinct from pronunciation scores and intervals", () => {
  const phone = normalizeLocal(local(), settings).words[0].phonemes![0]; assert.equal(phone.confidence, 60); assert.equal(phone.accuracy, null); assert.equal(phone.peakMs, 70);
  assert.equal(phone.startMs, null); assert.equal(phone.endMs, null); assert.equal(phone.operation, "match"); assert.equal(phone.stress, null);
});
test("legacy enrichment exposes phone/tone fields while preserving every byte of the saved record and raw responses", () => {
  const r = record(); delete r.local.metrics!.detailsVersion; delete r.local.metrics!.words[0].phonemes;
  r.local.metrics!.score = 42; r.local.metrics!.phonemeMatch = 42; r.tencent.metrics!.score = 43;
  delete r.tencent.metrics!.detailsVersion; delete r.tencent.metrics!.words[0].phonemes; delete r.tencent.metrics!.words[0].tone;
  const db = openComparisonDatabase(":memory:");
  try {
    saveComparison(db, r, new Uint8Array([1])); const before = db.prepare("SELECT payload FROM comparisons WHERE id=?").get(r.id)!.payload;
    const loaded = readComparison(db, r.id); assert.equal(loaded.local.metrics!.words[0].phonemes![0].confidence, 60); assert.equal(loaded.tencent.metrics!.words[0].tone!.valid, false);
    assert.equal(loaded.local.metrics!.score, 42); assert.equal(loaded.local.metrics!.phonemeMatch, 42); assert.equal(loaded.tencent.metrics!.score, 43);
    assert.equal(loaded.tencent.rawResponse, r.tencent.rawResponse); assert.equal(loaded.local.rawResponse, r.local.rawResponse);
    assert.equal(db.prepare("SELECT payload FROM comparisons WHERE id=?").get(r.id)!.payload, before);
    const missing = { ...r, local: { ...r.local, rawResponse: "broken" }, tencent: { ...r.tencent, rawResponse: "broken" } }; assert.equal(detailedComparison(missing).local.metrics!.words[0].phonemes, undefined);
  } finally { db.close(); }
});
test("phone exports include raw and normalized scales, confidence, reference/heard phones, booleans, timings and annotation columns", () => {
  const r = record(), csv = exportComparisons([r], "phones"), words = exportComparisons([r], "words"), jsonl = JSON.parse(exportComparisons([r], "jsonl"));
  for (const field of ["reference_phone", "recognized_phone", "raw_accuracy_scale", "decoder_confidence_0_100", "local_peak_ms", "reference_stress", "detected_stress", "human_notes"]) assert.ok(csv.includes(field), field);
  assert.ok(csv.includes('"false","false"')); assert.ok(words.includes("tone_valid")); assert.equal(jsonl.tencent.metrics.words[0].phonemes[0].expected, null);
});
test("comparison indices, safe audio intervals, and timing differences never fabricate missing evidence", () => {
  const r = record(), rows = comparisonRows(r); assert.equal(rows[0].local[0].word, "test"); assert.equal(rows[0].tencent[0].word, "test");
  assert.deepEqual(wordTimingDelta(rows[0].local[0], rows[0].tencent[0]), { startMs: 20, endMs: 100 });
  assert.deepEqual(wordTimingDelta({ ...rows[0].local[0], alignment: "substitution" }, rows[0].tencent[0]), { startMs: null, endMs: null });
  assert.equal(playableRange(null, 200, 400), null); assert.equal(playableRange(-1, 200, 400), null); assert.equal(playableRange(200, 100, 400), null); assert.equal(playableRange(500, 600, 400), null);
  assert.deepEqual(playableRange(0, 1000, 400), { start: 0, end: .4 });
  const config = tencentConfig({}); r.request.tencent = tencentRequest("test", r.id, config, 4); assert.equal(comparisonMode(r), 4); assert.equal(r.request.tencent.parameters.eval_mode, 4);
  const fallback = { ...r.tencent.metrics!.words[0] }; delete fallback.phonemes; assert.equal(comparisonPhones(fallback, "tencent", 1)[0].expected, null);
});
