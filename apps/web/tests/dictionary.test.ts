import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { DictionaryReader, dictionaryFields, fillCardFromDictionary, type DictionaryResult } from "../src/lib/dictionary.ts";
import { freshSchedule, type VocabularyCard } from "../src/lib/vocabulary.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "english-dictionary-test-")), path = join(directory, "ecdict.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE entries(word_key TEXT PRIMARY KEY,word TEXT,phonetic TEXT,definition TEXT,translation TEXT,pos TEXT,tags TEXT,exchange TEXT);
    CREATE TABLE forms(form_key TEXT,headword_key TEXT,kind TEXT);
    INSERT INTO metadata VALUES ('schema','1'),('source','ECDICT'),('commit','bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'),('entries','5');`);
  const add = db.prepare("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?)");
  add.run("economist", "economist", "ɪˈkɒnəmɪst", "an expert", "n. 经济学家\\n经济专家", "n", "cet6", "s:economists");
  add.run("saw", "saw", "sɔː", "a tool", "n. 锯；see 的过去式", "n", "", "0:see");
  add.run("see", "see", "siː", "perceive", "v. 看见", "v", "", "p:saw");
  add.run("us", "us", "ʌs", "we", "我们", "pron", "", "");
  add.run("sow", "sow", "səʊ", "plant", "v. 播种", "v", "", "");
  const form = db.prepare("INSERT INTO forms VALUES (?,?,?)");
  form.run("economists", "economist", "s"); form.run("saw", "see", "p");
  form.run("ambiguousword", "see", "p"); form.run("ambiguousword", "sow", "p");
  db.close();
  const reader = new DictionaryReader(path);
  return { reader, close() { reader.close(); const target = resolve(directory); assert.equal(resolve(join(target, "..")), resolve(tmpdir())); assert.ok(basename(target).startsWith("english-dictionary-test-")); rmSync(target, { recursive: true }); } };
}

test("dictionary lookup prefers an exact homograph and normalizes ordinary capitalization", () => {
  const f = fixture(); try {
    assert.equal(f.reader.lookup("Economist").entry?.translation, "n. 经济学家\n经济专家");
    assert.equal(f.reader.lookup("saw").match, "exact");
    assert.equal(f.reader.lookup("saw").entry?.word, "saw");
    assert.equal(f.reader.lookup("US").match, "missing");
    assert.equal(f.reader.lookup("us").match, "exact");
    assert.equal(f.reader.lookup("notindictionary").entry, null);
    assert.equal(f.reader.lookup("' OR 1=1 --").match, "missing");
  } finally { f.close(); }
});

test("lemma fallback uses explicit forms, retains ambiguity and never guesses by suffix", () => {
  const f = fixture(); try {
    const form = f.reader.lookup("economists");
    assert.equal(form.match, "lemma"); assert.equal(form.entry?.word, "economist");
    assert.equal(dictionaryFields({ word: "economists" }, form).phonetic, undefined);
    const ambiguous = f.reader.lookup("ambiguousword");
    assert.equal(ambiguous.match, "ambiguous"); assert.equal(ambiguous.entry, null); assert.equal(ambiguous.candidates.length, 2);
    assert.deepEqual(dictionaryFields({ word: "ambiguousword" }, ambiguous), {});
    assert.equal(f.reader.lookup("economisted").match, "missing");
  } finally { f.close(); }
});

test("dictionary enrichment only fills blank fields and preserves identity, examples and review state", () => {
  const f = fixture(); try {
    const card: VocabularyCard = { id: "preserved", word: "economist", meaning: "我的语境义", phonetic: "", example: "The economist explained inflation.",
      deckIds: ["personal"], sources: [{ module: "reading", context: "Original" }], createdAt: "2026-10-23T00:00:00Z", revision: 4, suspended: true, schedule: freshSchedule(new Date("2026-10-23T00:00:00Z")) };
    const before = structuredClone(card);
    assert.equal(fillCardFromDictionary(card, f.reader.lookup(card.word)), true);
    assert.equal(card.meaning, before.meaning); assert.equal(card.phonetic, "ɪˈkɒnəmɪst");
    assert.deepEqual(card.dictionary?.fields, ["phonetic"]); assert.equal(card.revision, 5);
    for (const key of ["id", "word", "example", "deckIds", "sources", "schedule", "suspended"] as const) assert.deepEqual(card[key], before[key]);
    assert.equal(fillCardFromDictionary(card, f.reader.lookup(card.word)), false);
  } finally { f.close(); }
});

test("missing dictionary never prevents saving an unknown word; long definitions fit card limits", () => {
  const result: DictionaryResult = { available: false, version: "", match: "missing", entry: null, candidates: [] };
  assert.deepEqual(dictionaryFields({ word: "newword" }, result), {});
  const f = fixture(); try {
    const long = f.reader.lookup("economist"); long.entry!.translation = "义".repeat(5000);
    assert.equal(dictionaryFields({ word: "economist" }, long).meaning?.length, 4000);
  } finally { f.close(); }
});

test("the public index is opened read-only and cannot be used as a learner database", () => {
  const f = fixture(); try {
    const db = (f.reader as unknown as { db: DatabaseSync }).db;
    assert.throws(() => db.exec("CREATE TABLE learner_cards(word TEXT)"), /readonly|read-only/i);
    assert.equal(f.reader.count, 5);
  } finally { f.close(); }
});
