import { test } from "node:test";
import assert from "node:assert/strict";
import { tencentConfig, tencentRequest } from "../../src/lib/experiments/tencent-comparison/tencent.ts";
import { evaluateTencentWebsocket, tencentWebsocketUrl, type TencentSocket, type TencentSocketFactory } from "../../src/lib/experiments/tencent-comparison/tencent-websocket.ts";
import { pendingResult, type ComparisonRecord } from "../../src/lib/experiments/tencent-comparison/types.ts";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS } from "../../src/lib/experiments/time-alignment-judgement.ts";

const config = () => tencentConfig({ ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID: "1300000000", ENGLISH_TENCENT_SOE_SECRET_ID: "dummy-id", ENGLISH_TENCENT_SOE_SECRET_KEY: "dummy-key" });
function fixture(): ComparisonRecord {
  const id = "aabbccdd-1234-1234-1234-aabbccddeeff";
  return { schemaVersion: 1, id, text: "I like tea.", createdAt: "2026-10-27", updatedAt: "2026-10-27",
    audio: { id: "sha", sha256: "sha", filename: "x.wav", bytes: 46, durationMs: 1, sampleRate: 16000, channels: 1, bitsPerSample: 16 },
    request: { local: { endpoint: "/experiments/time-alignment", spokenText: "", settings: { ...DEFAULT_TIME_ALIGNMENT_SETTINGS } }, tencent: tencentRequest("I like tea.", id, config()) },
    local: pendingResult(), tencent: pendingResult(), annotation: { label: "", notes: "" } };
}
const metrics = () => ({ SentenceId: -1, SuggestedScore: 91, PronAccuracy: 92, PronFluency: .83, PronCompletion: 1, Words: [{ Word: "tea", MemBeginTime: 10, MemEndTime: 100, PronAccuracy: 90, PhoneInfos: [{ Phone: "t", PronAccuracy: 80 }] }] });
class FakeSocket implements TencentSocket {
  sent: (string | Uint8Array)[] = [];
  listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  readonly onSend: (data: string | Uint8Array, socket: FakeSocket) => void;
  constructor(onSend: (data: string | Uint8Array, socket: FakeSocket) => void = () => {}) { this.onSend = onSend; }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.set(type, [...this.listeners.get(type) || [], listener]); }
  emit(type: string, data?: unknown) { for (const listener of this.listeners.get(type) || []) listener({ data }); }
  message(data: unknown) { this.emit("message", typeof data === "string" ? data : JSON.stringify(data)); }
  send(data: string | Uint8Array) { this.sent.push(data); this.onSend(data, this); }
  close() { this.emit("close"); }
}
function connection(socket: FakeSocket, start: () => void): TencentSocketFactory { return () => { queueMicrotask(() => { socket.emit("open"); start(); }); return socket; }; }

test("default matches Go workbench: account AppID path, English WAV, recording mode; auth never enters stored request", () => {
  const record = fixture(); assert.equal(config().protocol, "websocket"); assert.equal(config().configured, true);
  assert.equal(record.request.tencent.endpoint, "wss://soe.cloud.tencent.com/soe/api/1300000000");
  assert.equal(record.request.tencent.parameters.rec_mode, 1); assert.equal(record.request.tencent.parameters.voice_format, 1); assert.equal(record.request.tencent.parameters.server_engine_type, "16k_en");
  assert.doesNotMatch(JSON.stringify(record), /dummy-id|dummy-key|secretid|signature/);
  const c = config(), recordWithPunctuation = fixture(); recordWithPunctuation.request.tencent.parameters.ref_text = "It's tea, isn't it?";
  const url = new URL(tencentWebsocketUrl(recordWithPunctuation, c, 1700000000, 42));
  assert.equal(url.searchParams.get("ref_text"), "It's tea, isn't it?"); assert.equal(url.searchParams.get("nonce"), "42"); assert.equal(url.searchParams.get("secretid"), "dummy-id");
  assert.ok(url.searchParams.get("signature")); assert.notEqual(tencentWebsocketUrl(recordWithPunctuation, c, 1700000000, 43), url.href);
  assert.equal(tencentConfig({ ENGLISH_TENCENT_SOE_SECRET_ID: "id", ENGLISH_TENCENT_SOE_SECRET_KEY: "key" }).configured, false);
});
test("waits for handshake, sends the identical WAV once plus end, and accepts only final=1", async () => {
  const record = fixture(), wav = Buffer.from([82, 73, 70, 70, 1, 2]), handshake = { code: 0, voice_id: record.id }, final = { code: 0, voice_id: record.id, message_id: "final-message-id", final: 1, result: metrics() };
  const socket = new FakeSocket((data, self) => { if (typeof data === "string") queueMicrotask(() => self.message(final)); });
  const result = await evaluateTencentWebsocket(record, wav, config(), connection(socket, () => { assert.equal(socket.sent.length, 0); socket.message(handshake); }));
  assert.equal(result.status, "success"); assert.equal(result.httpStatus, 101); assert.equal(result.requestId, "final-message-id");
  assert.deepEqual(Buffer.from(socket.sent[0] as Uint8Array), wav); assert.equal(socket.sent[1], '{"type":"end"}'); assert.equal(socket.sent.length, 2);
  assert.equal(result.metrics?.score, 91); assert.equal(result.metrics?.fluency, 83); assert.equal(result.metrics?.words[0].targetIndex, 2);
  assert.equal(result.rawResponse, [handshake, final].map(value => JSON.stringify(value)).join("\n"));
});
test("cloud handshake errors keep raw evidence without transmitting audio", async () => {
  for (const code of [4002, 4003, 4004, 4005]) {
    const record = fixture(), socket = new FakeSocket(), raw = JSON.stringify({ code, voice_id: record.id, message: "cloud failure" });
    const result = await evaluateTencentWebsocket(record, Buffer.from([1]), config(), connection(socket, () => socket.message(raw)));
    assert.equal(result.status, "failed"); assert.equal(result.rawResponse, raw); assert.equal(result.metrics, null); assert.equal(socket.sent.length, 0); assert.match(result.error!, new RegExp(String(code)));
  }
});
test("malformed replies, mismatched voice ids, and a closed stream never become scores", async () => {
  for (const reply of ["not-json", { code: 0, voice_id: "wrong-id" }, { code: 0, voice_id: fixture().id, final: 1 }]) {
    const socket = new FakeSocket(), result = await evaluateTencentWebsocket(fixture(), Buffer.from([1]), config(), connection(socket, () => socket.message(reply)));
    assert.equal(result.status, "failed"); assert.equal(result.metrics, null); assert.ok(result.rawResponse);
  }
  const socket = new FakeSocket(); const closed = await evaluateTencentWebsocket(fixture(), Buffer.from([1]), config(), connection(socket, () => socket.emit("close")));
  assert.equal(closed.status, "failed"); assert.equal(closed.rawResponse, null);
});
test("only aggregate SentenceId=-1 can supply scores when the final frame has no metrics", async () => {
  for (const sentenceId of [-1, 0]) {
    const record = fixture(), socket = new FakeSocket((data, self) => { if (typeof data === "string") queueMicrotask(() => { self.message({ code: 0, voice_id: record.id, result: { ...metrics(), SentenceId: sentenceId } }); self.message({ code: 0, voice_id: record.id, final: 1 }); }); });
    const result = await evaluateTencentWebsocket(record, Buffer.from([1]), config(), connection(socket, () => socket.message({ code: 0, voice_id: record.id })));
    assert.equal(result.status, sentenceId === -1 ? "success" : "failed");
  }
});
test("timeout retains handshake, and missing configuration never connects", async () => {
  const record = fixture(), socket = new FakeSocket();
  const timed = await evaluateTencentWebsocket(record, Buffer.from([1]), config(), connection(socket, () => socket.message({ code: 0, voice_id: record.id })), 10);
  assert.equal(timed.status, "failed"); assert.match(timed.error!, /超时/); assert.ok(timed.rawResponse);
  const missing = await evaluateTencentWebsocket(record, Buffer.from([1]), tencentConfig({}), () => { throw new Error("must not connect"); });
  assert.equal(missing.status, "not_configured"); assert.equal(missing.rawResponse, null);
});
