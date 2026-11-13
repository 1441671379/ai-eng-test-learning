import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPEAKING_DISPLAY, isSpeakingDisplayPreferences, parseSpeakingDisplay } from "../src/lib/speaking-display.ts";

test("missing, corrupt and mistyped display preferences keep all optional details hidden", () => {
  for (const value of [undefined, "{", "null", "[]", '{"showPhonemeDetails":"false"}', '{"showPhonemeDetails":true}']) {
    assert.deepEqual(parseSpeakingDisplay(value), DEFAULT_SPEAKING_DISPLAY);
  }
  assert.equal(isSpeakingDisplayPreferences(null), false);
  assert.equal(isSpeakingDisplayPreferences({ ...DEFAULT_SPEAKING_DISPLAY, showParagraphHistory: "true" }), false);
});

test("saved display choices round-trip independently without accepting extra payload fields", () => {
  const selected = { showPhonemeDetails: true, showTranscriptCorrection: false, showParagraphHistory: true };
  assert.equal(isSpeakingDisplayPreferences(selected), true);
  assert.deepEqual(parseSpeakingDisplay(JSON.stringify({ ...selected, unrelated: "ignored" })), selected);
  const parsed = parseSpeakingDisplay(undefined);
  parsed.showPhonemeDetails = true;
  assert.equal(DEFAULT_SPEAKING_DISPLAY.showPhonemeDetails, false);
});
