import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceDestination, practiceSeed, validatePracticeEntry, type PracticeSnapshot } from "../src/lib/practice-continuity.ts";
const id = "11111111-1111-4111-8111-111111111111";
test("each learning module resumes its own last open practice", () => {
  const state: PracticeSnapshot = { reading: { route: `/reading?id=${id}`, view: { answers: { q1: "B" }, questionIndex: 2 } }, speaking: { route: `/speaking/article-reading?session=${id}`, view: { activeIndex: 1 } } };
  assert.equal(practiceDestination("reading", state), `/reading?id=${id}`);
  assert.equal(practiceDestination("speaking", state), `/speaking/article-reading?session=${id}`);
  assert.equal(practiceDestination("listening", state), "/listening");
  assert.deepEqual(practiceSeed(state, "reading", `/reading?id=${id}`), state.reading!.view);
  assert.deepEqual(practiceSeed(state, "reading", "/reading?id=22222222-2222-4222-8222-222222222222"), {});
});
test("resumable routes include drafts and all three speaking activities", () => {
  for (const page of ["coach", "pronunciation", "article-reading"]) {
    for (const suffix of ["", `?session=${id}`]) assert.ok(validatePracticeEntry("speaking", { route: `/speaking/${page}${suffix}`, view: {} }));
  }
  for (const moduleId of ["reading", "listening", "writing", "vocabulary"] as const) assert.ok(validatePracticeEntry(moduleId, { route: `/${moduleId}`, view: {} }));
  assert.equal(validatePracticeEntry("speaking", null), null);
});
test("resume links cannot leave the module, carry credentials, or duplicate IDs", () => {
  for (const route of ["https://example.com", "//example.com/reading", "/settings", "/reading/../settings", "/reading?apiKey=secret", `/reading?id=${id}&id=${id}`, "/reading?id=../../x", `/reading?id=${id}#x`]) assert.throws(() => validatePracticeEntry("reading", { route, view: {} }));
  assert.throws(() => validatePracticeEntry("reading", { route: "/reading", view: { text: "x".repeat(56000) } }));
});
test("clearing a resume pointer returns to the module without changing other pointers", () => {
  const state: PracticeSnapshot = { reading: { route: `/reading?id=${id}`, view: { answers: { q1: "A" } } }, listening: { route: `/listening?id=${id}`, view: {} } };
  delete state.reading;
  assert.equal(practiceDestination("reading", state), "/reading");
  assert.equal(practiceDestination("listening", state), `/listening?id=${id}`);
});
