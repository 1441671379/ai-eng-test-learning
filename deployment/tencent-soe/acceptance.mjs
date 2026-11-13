// Synthetic integration fixture; no real microphone, speech model, or Tencent account is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const origin = process.env.SOE_QA_ORIGIN || "http://127.0.0.1:3011", endpoint = `${origin}/api/experiments/tencent-comparison`;
const directory = new URL("./artifacts/", import.meta.url); await mkdir(directory, { recursive: true });
const profile = id => encodeURIComponent(JSON.stringify({ id, displayName: "SOE QA", practiceFocus: "conversations", practiceCadence: "15-minutes", createdAt: "2026-10-26T00:00:00.000Z", onboardingCompleted: true }));
const headers = { Cookie: `english_local_profile=${profile("tencent-soe-qa")}`, Origin: origin };
const wav = Buffer.alloc(44 + 3200); wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(3200, 40);
await writeFile(new URL("synthetic.wav", directory), wav);
const operations = [{ operation: "match", targetIndex: 0, heardIndex: 0, wordIndex: 0, expected: "t", heard: "t", uncertain: false }];
const method = { available: true, mode: "soft", version: "synthetic-acceptance-only", words: [{ wordIndex: 0, word: "test", start: 0, end: .1, status: "no-clear-error", expectedPhones: ["t"], heardPhones: ["t"], heardIndices: [0], phoneDetailsUncertain: false, timingEligible: true }], operations, certainErrorWords: [], missingTranscriptWords: [], orphanHeardIndices: [], phoneOwnerCandidates: [[0]], consistencyIndex: 100, sentenceEditDistance: 0, scoreKind: "experimental-phoneme-consistency-not-calibrated" };
const localResponse = JSON.stringify({ version: "time-first-lexical-partial-v2", experimental: true, targetText: "test", transcript: "test", transcriptSource: "whisper", duration: .1, elapsedSeconds: .01, methods: { soft: method, hard: { ...method, mode: "hard" } }, evidence: [{ token: "t", confidence: .9, peakSec: .05 }], windows: [{ owners: [0], trusted: true, start: 0, end: .1 }], timing: { version: "synthetic", model: "synthetic", device: "cpu", alignmentSeconds: .001, modelLoadSeconds: 0 } }, null, 2);
let localCalls = 0, failLocal = false;
const mock = createServer(async (req, res) => {
  if (req.url === "/experiments/time-alignment/status") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ready":true}'); return; }
  if (req.url !== "/experiments/time-alignment") { res.writeHead(404); res.end(); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const request = new Request("http://localhost/mock", { method: "POST", headers: { "Content-Type": req.headers["content-type"] }, body: Buffer.concat(chunks) });
  const form = await request.formData(); assert.equal(form.get("text"), "test");
  assert.deepEqual(Buffer.from(await form.get("audio").arrayBuffer()), wav); localCalls++;
  res.writeHead(failLocal ? 503 : 200, { "Content-Type": "application/json" }); res.end(failLocal ? '{"detail":"synthetic failure"}' : localResponse);
});
await new Promise(resolve => mock.listen(3012, "127.0.0.1", resolve));
try {
  assert.equal((await fetch(endpoint)).status, 401);
  const configResponse = await fetch(endpoint, { headers }), state = await configResponse.json(); assert.equal(configResponse.status, 200); assert.equal(state.config.configured, false);
  const form = () => { const data = new FormData(); data.set("audio", new File([wav], "synthetic.wav", { type: "audio/wav" })); data.set("text", "test"); return data; };
  assert.equal((await fetch(endpoint, { method: "POST", headers: { ...headers, Origin: "http://untrusted.invalid" }, body: form() })).status, 403);
  const malformed = form(); malformed.set("audio", new File(["broken"], "x.wav", { type: "audio/wav" }));
  assert.equal((await fetch(endpoint, { method: "POST", headers, body: malformed })).status, 422);
  const overlong = form(); overlong.set("text", "hello ".repeat(31)); assert.equal((await fetch(endpoint, { method: "POST", headers, body: overlong })).status, 400);
  const submission = await fetch(endpoint, { method: "POST", headers, body: form() });
  assert.equal(submission.status, 200, await submission.clone().text()); const { record } = await submission.json();
  assert.equal(record.local.status, "success"); assert.equal(record.tencent.status, "not_configured"); assert.equal(record.local.rawResponse, localResponse);
  assert.equal(record.audio.sha256, createHash("sha256").update(wav).digest("hex")); assert.equal(record.local.metrics.phonemeMatch, 100); assert.equal(localCalls, 1);
  const saved = await (await fetch(`${endpoint}?id=${record.id}`, { headers })).json(); assert.deepEqual(saved.record, record);
  assert.deepEqual(Buffer.from(await (await fetch(`${endpoint}?id=${record.id}&format=audio`, { headers })).arrayBuffer()), wav);
  for (const [range, start, end] of [["bytes=0-43", 0, 43], ["bytes=44-", 44, wav.length - 1], ["bytes=-8", wav.length - 8, wav.length - 1]]) {
    const part = await fetch(`${endpoint}?id=${record.id}&format=audio`, { headers: { ...headers, Range: range } });
    assert.equal(part.status, 206); assert.equal(part.headers.get("content-range"), `bytes ${start}-${end}/${wav.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), wav.subarray(start, end + 1));
  }
  for (const range of ["bytes=", "bytes=-0", "bytes=9000-", "bytes=80-20", "bytes=0-1,4-5"]) assert.equal((await fetch(`${endpoint}?id=${record.id}&format=audio`, { headers: { ...headers, Range: range } })).status, 416);
  assert.equal((await fetch(`${endpoint}?id=${record.id}`, { headers: { ...headers, Cookie: `english_local_profile=${profile("different-soe-learner")}` } })).status, 404);
  for (const format of ["jsonl", "csv", "words", "phones"]) {
    const response = await fetch(`${endpoint}?format=${format}&id=${record.id}`, { headers }); assert.equal(response.status, 200); assert.match(response.headers.get("content-disposition"), /attachment/);
    const content = await response.text(); assert.ok(content.includes(record.id)); await writeFile(new URL(format === "jsonl" ? "sample.jsonl" : format === "words" || format === "phones" ? `sample.${format}.csv` : "sample.csv", directory), content);
  }
  failLocal = true;
  const failed = await (await fetch(endpoint, { method: "POST", headers, body: form() })).json();
  assert.equal(failed.record.local.status, "failed"); assert.equal(failed.record.local.rawResponse, '{"detail":"synthetic failure"}'); assert.equal(failed.record.tencent.status, "not_configured");
  assert.deepEqual(Buffer.from(await (await fetch(`${endpoint}?id=${failed.record.id}&format=audio`, { headers })).arrayBuffer()), wav);
  const formal = await (await fetch(`${origin}/api/experiments/sessions`, { headers })).json(); assert.deepEqual(formal.sessions, []);
  const invalidMode = form(); invalidMode.set("eval_mode", "9"); assert.equal((await fetch(endpoint, { method: "POST", headers, body: invalidMode })).status, 400);
  const invalidCorrection = form(); invalidCorrection.set("eval_mode", "4"); invalidCorrection.set("text", "two words"); assert.equal((await fetch(endpoint, { method: "POST", headers, body: invalidCorrection })).status, 400);
  failLocal = false; const correctionForm = form(); correctionForm.set("eval_mode", "4");
  const correction = await (await fetch(endpoint, { method: "POST", headers, body: correctionForm })).json(); assert.equal(correction.record.request.tencent.parameters.eval_mode, 4); assert.equal(correction.record.local.status, "success"); assert.equal(correction.record.tencent.status, "not_configured");
  const result = { date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }), syntheticOnly: true, passed: true, recordId: record.id, cases: ["authentication", "same-origin", "invalid WAV", "text limit", "same WAV bytes at local provider", "missing credentials", "raw local response retained", "persist/reopen", "learner isolation", "WAV download/hash and byte-range seeking", "JSONL/sentence/word/phone CSV exports", "failed local response and audio retained", "sentence/correction mode validation and metadata", "formal sessions unchanged"] };
  await writeFile(new URL("acceptance.json", directory), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes("--serve")) { failLocal = false; console.log("Synthetic speech fixture remains on 127.0.0.1:3012 for browser QA. Ctrl+C to stop."); await new Promise(() => {}); }
} finally { await new Promise(resolve => mock.close(resolve)); }
