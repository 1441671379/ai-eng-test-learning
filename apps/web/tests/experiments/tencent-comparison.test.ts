import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeComparisonWav, validateComparisonWav } from "../../src/lib/experiments/tencent-comparison/audio.ts";
import { tencentConfig, publicTencentConfig, tencentHeaders, tencentRequest, evaluateTencent } from "../../src/lib/experiments/tencent-comparison/tencent.ts";
import { alignWords, comparisonTokens, normalizeTencent } from "../../src/lib/experiments/tencent-comparison/normalize.ts";
import { openComparisonDatabase, saveComparison, readComparison, listComparisons, completeProvider, comparisonAudio, allComparisons } from "../../src/lib/experiments/tencent-comparison/store.ts";
import { exportComparisons } from "../../src/lib/experiments/tencent-comparison/export.ts";
import { pendingResult, type ComparisonRecord } from "../../src/lib/experiments/tencent-comparison/types.ts";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS } from "../../src/lib/experiments/time-alignment-judgement.ts";
import { openExperimentDatabase, createExperiment, listExperiments } from "../../src/lib/experiments/database.ts";

function fixture(config = tencentConfig({})): { record: ComparisonRecord; wav: Buffer } {
  const wav = Buffer.from(encodeComparisonWav(new Float32Array(1600))), id = randomUUID(), sha256 = createHash("sha256").update(wav).digest("hex"), now = new Date().toISOString();
  return { wav, record: { schemaVersion: 1, id, createdAt: now, updatedAt: now, text: "I like tea.",
    audio: { id: sha256, sha256, filename: "test.wav", bytes: wav.length, durationMs: 100, sampleRate: 16000, channels: 1, bitsPerSample: 16 },
    request: { local: { endpoint: "/experiments/time-alignment", settings: { ...DEFAULT_TIME_ALIGNMENT_SETTINGS }, spokenText: "" }, tencent: tencentRequest("I like tea.", id, config) },
    local: pendingResult(), tencent: pendingResult(), annotation: { label: "", notes: "" } } };
}
const credentials = () => tencentConfig({ ENGLISH_TENCENT_SOE_PROTOCOL: "http", ENGLISH_TENCENT_SOE_SECRET_ID: "test-id", ENGLISH_TENCENT_SOE_SECRET_KEY: "test-key", ENGLISH_TENCENT_SOE_TOKEN: "test-token" });
const tencentResponse = () => ({ Response: { Status: "Finished", SessionId: "example-session", RequestId: "request-1", SuggestedScore: 80, PronAccuracy: 90, PronFluency: .75, PronCompletion: 1,
  Words: [{ Word: "I", PronAccuracy: -1, PronFluency: -1, MatchTag: 2, MemBeginTime: 0, MemEndTime: 0, PhoneInfos: [] }, { Word: "like", PronAccuracy: 85, MemBeginTime: 100, MemEndTime: 300, PhoneInfos: [{ Phone: "l", PronAccuracy: 85 }] }, { Word: "tea", PronAccuracy: 90 }] } });

test("canonical audio is validated by header and bytes, including format, duration and truncation", () => {
  const { wav } = fixture(); assert.equal(validateComparisonWav(wav), 100);
  for (const mutate of [(b: Buffer) => b.writeUInt32LE(48000, 24), (b: Buffer) => b.writeUInt16LE(2, 22), (b: Buffer) => b.writeUInt32LE(2, 40), (b: Buffer) => b.writeUInt16LE(3, 20)]) {
    const bad = Buffer.from(wav); mutate(bad); assert.throws(() => validateComparisonWav(bad), /PCM WAV/);
  }
  assert.throws(() => validateComparisonWav(wav.subarray(0, 43)));
  assert.throws(() => validateComparisonWav(new Uint8Array(encodeComparisonWav(new Float32Array(16000 * 31)))));
});
test("missing/invalid credentials remain explicit and public status contains no credentials", async () => {
  const config = tencentConfig({}); assert.equal(config.configured, false); assert.equal(config.scoreCoeff, 4);
  assert.equal(config.missing.length, 3);
  for (const value of ["0", "NaN", "5"]) assert.equal(tencentConfig({ ...process.env, ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID: "1300000000", ENGLISH_TENCENT_SOE_SECRET_ID: "x", ENGLISH_TENCENT_SOE_SECRET_KEY: "y", ENGLISH_TENCENT_SOE_SCORE_COEFF: value }).configured, false);
  assert.doesNotMatch(JSON.stringify(publicTencentConfig(credentials())), /test-key|test-id|test-token/);
  const { record, wav } = fixture();
  const result = await evaluateTencent(record, wav, config, async () => { throw new Error("must not call"); });
  assert.equal(result.status, "not_configured"); assert.equal(result.rawResponse, null); assert.equal(result.metrics, null);
});
test("TC3 signature covers transmitted bytes and temporary credentials are only in request headers", () => {
  const config = credentials(), body = '{"RefText":"I like tea."}', timestamp = 1700000000, headers = tencentHeaders(body, config, timestamp);
  assert.equal(headers.Authorization, "TC3-HMAC-SHA256 Credential=test-id/2023-11-14/soe/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=f6ec018238d38e51b76bb7f7083185697ed08fb656d2fa4e8a8956eebcf8d9a2");
  assert.equal(headers["X-TC-Token"], "test-token");
  assert.notEqual(headers.Authorization, tencentHeaders(body + " ", config, timestamp).Authorization);
  assert.doesNotMatch(JSON.stringify(fixture(config).record), /test-id|test-key|test-token|Authorization|UserVoiceData/);
});
test("successful Tencent requests use the identical WAV and retain exact raw response and final metrics", async () => {
  const config = credentials(), { record, wav } = fixture(config), raw = JSON.stringify(tencentResponse(), null, 2);
  const result = await evaluateTencent(record, wav, config, async (url, init) => {
    assert.equal(url, "https://soe.tencentcloudapi.com"); const sent = JSON.parse(init!.body as string);
    assert.deepEqual(Buffer.from(sent.UserVoiceData, "base64"), wav); assert.equal(sent.RefText, record.text); assert.equal(sent.SessionId, record.id);
    assert.equal(sent.WorkMode, 1); assert.equal(sent.VoiceFileType, 2); assert.equal(sent.EvalMode, 1); assert.equal(sent.ScoreCoeff, 4);
    return new Response(raw);
  });
  assert.equal(result.status, "success"); assert.equal(result.rawResponse, raw); assert.equal(result.requestId, "request-1");
  assert.equal(result.metrics?.fluency, 75); assert.equal(result.metrics?.completion, 100); assert.equal(result.metrics?.words[0].accuracy, null);
  assert.equal(result.metrics?.phonemeMatch, null); assert.equal(result.metrics?.words[0].fluency, null);
});
test("Tencent API errors, non-final responses, malformed JSON and network failures stay failed with no invented scores", async () => {
  const { record, wav } = fixture(credentials());
  for (const raw of ["bad json", JSON.stringify({ Response: { Error: { Code: "AuthFailure.AccountUnavailable", Message: "account unavailable" }, RequestId: "error-id" } }), JSON.stringify({ Response: { Status: "Evaluating", SuggestedScore: 99 } }), JSON.stringify({ Response: { Status: "Finished", PronAccuracy: null, Words: [] } })]) {
    const result = await evaluateTencent(record, wav, credentials(), async () => new Response(raw));
    assert.equal(result.status, "failed"); assert.equal(result.rawResponse, raw); assert.equal(result.metrics, null);
  }
  const failure = await evaluateTencent(record, wav, credentials(), async () => { throw new Error("private transport internals"); });
  assert.equal(failure.status, "failed"); assert.equal(failure.rawResponse, null); assert.doesNotMatch(failure.error!, /private transport/);
});
test("word alignment handles omissions, insertions, repeated words and mismatches without index zipping", () => {
  assert.deepEqual(comparisonTokens("It's a well-known story."), ["It's", "a", "well", "known", "story"]);
  assert.deepEqual(alignWords(["I", "like", "tea"], ["I", "really", "like", "tea"]).map(w => w.targetIndex), [0, null, 1, 2]);
  assert.deepEqual(alignWords(["I", "like", "tea"], ["I", "tea"]).map(w => w.targetIndex), [0, 2]);
  assert.deepEqual(alignWords(["very", "very", "good"], ["very", "very", "good"]).map(w => w.targetIndex), [0, 1, 2]);
  assert.equal(alignWords(["tea"], ["coffee"])[0].alignment, "substitution");
  const value = tencentResponse().Response; value.PronAccuracy = -1;
  assert.equal(normalizeTencent(value, "I like tea.").accuracy, null);
  value.SuggestedScore = -1;
  assert.equal(normalizeTencent(value, "I like tea.").score, null);
});
test("records and WAV persist on reopen, providers merge independently, and learner/formal stores remain isolated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "soe-comparison-"));
  try {
    const path = join(directory, "a.sqlite"), db = openComparisonDatabase(path), { record, wav } = fixture();
    saveComparison(db, record, wav); db.close();
    const reopened = openComparisonDatabase(path), other = openComparisonDatabase(join(directory, "b.sqlite")), formal = openExperimentDatabase(join(directory, "formal.sqlite"));
    try {
      const practice = createExperiment(formal, "pronunciation", "Existing practice");
      completeProvider(reopened, record.id, "tencent", { ...pendingResult(), status: "not_configured", error: "missing" });
      completeProvider(reopened, record.id, "local", { ...pendingResult(), status: "success", rawResponse: '{"local":true}' });
      const saved = readComparison(reopened, record.id); assert.equal(saved.local.status, "success"); assert.equal(saved.tencent.status, "not_configured");
      assert.deepEqual(Buffer.from(comparisonAudio(reopened, record.id)), wav);
      assert.equal(createHash("sha256").update(comparisonAudio(reopened, record.id)).digest("hex"), record.audio.sha256);
      assert.equal(listComparisons(other).length, 0); assert.throws(() => readComparison(other, record.id), /不存在/); assert.throws(() => readComparison(reopened, "../../x"), /编号/);
      assert.equal(listExperiments(formal).length, 1); assert.equal(listExperiments(formal)[0].id, practice.id);
    } finally { reopened.close(); other.close(); formal.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("export includes all records beyond UI limit, exact raw JSON, word details and annotation columns with safe CSV cells", () => {
  const db = openComparisonDatabase(":memory:");
  try {
    const { record, wav } = fixture(); record.text = '=HYPERLINK("bad")'; record.audio.filename = "@danger.wav";
    record.tencent = { ...pendingResult(), status: "success", rawResponse: JSON.stringify(tencentResponse()), metrics: normalizeTencent(tencentResponse().Response, "I like tea.") };
    for (let i = 0; i < 102; i++) saveComparison(db, { ...record, id: randomUUID() }, wav);
    assert.equal(listComparisons(db).length, 100); assert.equal(allComparisons(db).length, 102);
    const jsonl = exportComparisons(allComparisons(db), "jsonl").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(jsonl.length, 102); assert.equal(jsonl[0].tencent.rawResponse, record.tencent.rawResponse); assert.equal(jsonl[0].annotation.label, "");
    const csv = exportComparisons([record], "csv"), words = exportComparisons([record], "words");
    assert.match(csv, /human_label/); assert.match(csv, /"'=HYPERLINK/); assert.match(csv, /"'@danger.wav"/); assert.ok(csv.startsWith("\uFEFF"));
    assert.match(words, /phones_json/); assert.match(words, /human_notes/); assert.match(words, /"tea"/);
  } finally { db.close(); }
});
