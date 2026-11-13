import test from "node:test";
import assert from "node:assert/strict";
import { compatibleCookie, cookieMigration, LEGACY_COOKIE_NAMES, HISTORICAL_SPEAKING_SOURCES } from "../src/lib/compatibility/legacy.ts";
import { readLocalStorage } from "../src/lib/browser-storage.ts";
import { validateLearningRecord } from "../src/lib/learning-records.ts";

test("old browser identity migrates without creating a different learner", () => {
  const profile = JSON.stringify({ id: "local-existing-learner", displayName: "Existing learner" });
  const values = new Map([[LEGACY_COOKIE_NAMES.english_app_mode, "local"], [LEGACY_COOKIE_NAMES.english_local_profile, profile]]);
  const reader = { get: (key: string) => values.has(key) ? { value: values.get(key)! } : undefined };
  assert.equal(compatibleCookie(reader, "english_local_profile"), profile);
  const migrations = cookieMigration(reader);
  for (const item of migrations) {
    if (item.value !== null) values.set(item.name, item.value);
    values.delete(item.legacy);
  }
  assert.equal(JSON.parse(values.get("english_local_profile")!).id, "local-existing-learner");
  assert.equal(values.get("english_app_mode"), "local");
  assert.deepEqual(cookieMigration(reader), []);
});

test("a current cookie wins over an old browser identity", () => {
  const values = new Map([["english_local_profile", "current"], [LEGACY_COOKIE_NAMES.english_local_profile, "old"]]);
  const reader = { get: (key: string) => values.has(key) ? { value: values.get(key)! } : undefined };
  assert.equal(compatibleCookie(reader, "english_local_profile"), "current");
  assert.deepEqual(cookieMigration(reader), [{ name: "english_local_profile", legacy: LEGACY_COOKIE_NAMES.english_local_profile, value: null }]);
});

test("reading, listening, writing and voice browser values survive renaming", () => {
  for (const suffix of ["reading-draft:lesson-1", "listening-draft:lesson-2", "listening-discuss:lesson-2", "writing-draft:learner:lesson", "tts-voice", "reference-voice-settings"]) {
    const oldKey = `cadence-${suffix}`, key = `english-${suffix}`;
    const values = new Map([[oldKey, '{"answer":"my unsaved answer"}']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const saved = readLocalStorage(key, storage);
    assert.equal(saved, '{"answer":"my unsaved answer"}');
    assert.equal(values.get(key), saved);
    assert.equal(values.has(oldKey), false);
    values.set(oldKey, "stale");
    assert.equal(readLocalStorage(key, storage), saved);
  }
});

test("full browser storage keeps the old draft readable and does not delete it", () => {
  let deleted = false;
  const storage = { getItem: (key: string) => key.startsWith("cadence-") ? "draft" : null,
    setItem: () => { throw new Error("Quota exceeded"); }, removeItem: () => { deleted = true; } };
  assert.equal(readLocalStorage("english-reading-draft:1", storage), "draft");
  assert.equal(deleted, false);
});

test("historical speaking records and new shared speech records remain readable", () => {
  for (const source of [...Object.values(HISTORICAL_SPEAKING_SOURCES), "speech"]) {
    const record = { id: "saved-record", module: "speaking", source, kind: "pronunciation", title: "A saved sentence", text: "A saved sentence", score: 81, occurredAt: "2026-01-01T00:00:00.000Z" };
    assert.deepEqual(validateLearningRecord(record), record);
  }
});
