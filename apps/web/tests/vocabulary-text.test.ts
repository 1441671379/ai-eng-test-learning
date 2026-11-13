import test from "node:test";
import assert from "node:assert/strict";
import { containsVocabularyWord, selectedVocabularyWord, vocabularyExcerpt } from "../src/lib/vocabulary-text.ts";

test("reading capture accepts typographic apostrophes, word hyphens and wrapped phrases", () => {
  assert.equal(selectedVocabularyWord("“we’re”"), "we're");
  assert.equal(selectedVocabularyWord(" trade‑off "), "trade-off");
  assert.equal(selectedVocabularyWord("interest\n rates"), "interest rates");
  assert.equal(containsVocabularyWord("We’re discussing a trade‑off and interest\n rates.", "we're"), true);
  assert.equal(containsVocabularyWord("We’re discussing a trade‑off and interest\n rates.", "trade-off"), true);
  assert.equal(containsVocabularyWord("We’re discussing a trade‑off and interest\n rates.", "interest rates"), true);
});

test("source verification never accepts substrings, absent words or regexp patterns", () => {
  assert.equal(containsVocabularyWord("Economists discuss inflation.", "economist"), false);
  assert.equal(containsVocabularyWord("Economists discuss inflation.", "monetary"), false);
  assert.equal(containsVocabularyWord("Economists discuss inflation.", "inflat.*"), false);
  assert.equal(containsVocabularyWord("Economists discuss inflation.", ""), false);
  assert.equal(selectedVocabularyWord("one two three four five six seven eight nine"), "");
});

test("long reading contexts keep the selected word within the 2500-character card limit", () => {
  for (const text of ["We're discussing inflation.", "Background. ".repeat(350) + "We’re discussing inflation.", "We’re discussing inflation. " + "Background. ".repeat(350)]) {
    const context = vocabularyExcerpt(text, "we're");
    assert.ok(context.length <= 2500);
    assert.ok(containsVocabularyWord(context, "we're"));
  }
  assert.equal(vocabularyExcerpt("An unrelated paragraph.", "inflation"), "");
});
