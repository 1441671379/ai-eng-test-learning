import test from "node:test";
import assert from "node:assert/strict";
import { chooseWordAudio, vocabularyAudioSettings, type WordRecording } from "../src/lib/word-audio.ts";

const recording = (word: string, id: string, accent: WordRecording["accent"], pos = ["noun"]): WordRecording => ({ word, id, accent, pos, file: id + ".ogg", relativePath: `audio/${id}.ogg`, bytes: 100, sha256: id, label: "", ipa: "", author: "Test author", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Test.ogg", processing: "Original recording; no audio modification" });

test("word audio preferences keep safe defaults and discard unrelated payload properties", () => {
  assert.deepEqual(vocabularyAudioSettings(null), { autoPlay: true, accent: "us", download: false });
  assert.deepEqual(vocabularyAudioSettings({ autoPlay: false, accent: "uk", apiKey: "ignored", download: false }), { autoPlay: false, accent: "uk", download: false });
  assert.deepEqual(vocabularyAudioSettings({ autoPlay: "false", accent: "other" }), { autoPlay: true, accent: "us", download: false });
});
test("accent preference orders available recordings without inventing unavailable accents", () => {
  const source = [recording("example", "other", "other"), recording("example", "uk", "uk"), recording("example", "us", "us")];
  assert.equal(chooseWordAudio(source, "uk").preferredId, "uk");
  assert.equal(chooseWordAudio(source, "us").preferredId, "us");
  assert.equal(chooseWordAudio(source.slice(0, 2), "us").recordings[0].accent, "uk");
  assert.equal(source[0].id, "other", "selection must not mutate the catalog array");
});
test("heteronym recordings require an explicit choice, including ambiguous verb tenses", () => {
  for (const word of ["record", "read", "lead"]) {
    const choices = chooseWordAudio([recording(word, "a", "us"), recording(word, "b", "us")], "us");
    assert.equal(choices.needsSelection, true); assert.equal(choices.preferredId, null);
  }
});
test("ordinary multiple-speaker recordings remain eligible for automatic playback", () => {
  const value = chooseWordAudio([recording("example", "a", "us"), recording("example", "b", "us")], "us");
  assert.equal(value.needsSelection, false); assert.equal(value.preferredId, "a");
});
test("missing audio packs return an empty selection suitable for local TTS fallback", () => {
  assert.deepEqual(chooseWordAudio([], "us"), { recordings: [], preferredId: null, needsSelection: false });
});

test("pre-generated alternative lexical readings require selection beyond the old heteronym list", () => {
  const source = [recording("abstract", "one", "other"), recording("abstract", "two", "other")].map(item => ({ ...item, kind: "synthesized" as const }));
  assert.equal(chooseWordAudio(source, "uk").needsSelection, true);
  assert.equal(chooseWordAudio(source, "uk").preferredId, null);
  assert.equal(chooseWordAudio(source.slice(0, 1), "uk").needsSelection, false);
});
