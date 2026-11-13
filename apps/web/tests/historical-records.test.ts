import test from "node:test";
import assert from "node:assert/strict";
import { mergeLearningRecords, validateLearningRecord, type LearningRecord } from "../src/lib/learning-records.ts";

test("retiring the speaking module preserves both historical record formats and stable retry identities", () => {
  const records: LearningRecord[] = ["cadence", "openpronounce"].map(source => validateLearningRecord({
    id: `historical:${source}`, module: "speaking", source, kind: "pronunciation", title: "Previous practice",
    text: "My earlier practice", score: 80, occurredAt: "2026-01-01T00:00:00.000Z", resourceId: "old-conversation",
  }));
  const merged = mergeLearningRecords(records, [{ ...records[0], text: "Saved historical feedback" }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(record => record.source === "cadence")?.text, "Saved historical feedback");
  assert.equal(merged.find(record => record.source === "openpronounce")?.module, "speaking");
  assert.equal(merged[0].occurredAt, "2026-01-01T00:00:00.000Z");
});
