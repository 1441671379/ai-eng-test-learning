import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openExperimentDatabase, createExperiment, deleteExperiment, listExperiments, mutateExperiment, readExperiment } from "../../src/lib/experiments/database.ts";
import { conversationHistory, experimentId, experimentText } from "../../src/lib/experiments/types.ts";
import { activeCoachTurn, replyMode, resetCoachReply, saveCoachReply } from "../../src/lib/experiments/coach.ts";

test("experiment records persist on reopen, remain isolated from another learner, and can be deleted", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "english-lab-test-"));
  try {
    const path = join(directory, "learner-a.sqlite"), db = openExperimentDatabase(path);
    const session = createExperiment(db, "coach", "University life"); db.close();
    const reopened = openExperimentDatabase(path), other = openExperimentDatabase(join(directory, "learner-b.sqlite"));
    try {
      assert.equal(readExperiment(reopened, session.id).topic, "University life");
      assert.equal(listExperiments(other).length, 0);
      assert.throws(() => readExperiment(other, session.id), /不存在/);
      deleteExperiment(reopened, session.id); assert.equal(listExperiments(reopened).length, 0);
    } finally { reopened.close(); other.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a stale conversation update rolls back instead of duplicating or overwriting turns", () => {
  const db = openExperimentDatabase(":memory:");
  try {
    const session = createExperiment(db, "coach", "Economics");
    mutateExperiment(db, session.id, 0, current => current.turns.push({ id: randomUUID(), question: "Why study economics?", reply: null, feedback: null, provider: "local", model: "test" }));
    assert.throws(() => mutateExperiment(db, session.id, 0, current => { current.topic = "overwritten"; }), /其他页面更新/);
    const saved = readExperiment(db, session.id); assert.equal(saved.revision, 1); assert.equal(saved.topic, "Economics"); assert.equal(saved.turns.length, 1);
    assert.throws(() => mutateExperiment(db, session.id, 1, current => { current.topic = "invalid"; throw new Error("failure"); }), /failure/);
    assert.equal(readExperiment(db, session.id).topic, "Economics");
  } finally { db.close(); }
});

test("feedback patches merge with newer conversation turns without invalidating in-flight generation", () => {
  const db = openExperimentDatabase(":memory:");
  try {
    const session = createExperiment(db, "coach", "History"), turnId = randomUUID();
    mutateExperiment(db, session.id, 0, current => current.turns.push({ id: turnId, question: "What happened?", reply: "I learned a lot.", feedback: null, provider: "local", model: "test" }));
    mutateExperiment(db, session.id, null, current => { current.turns[0].feedback = { summary: "Good", directions: [], betterAnswer: "I learned a great deal.", expressions: [], grammar: [], provider: "local", model: "test", generatedAt: new Date().toISOString() }; });
    const saved = mutateExperiment(db, session.id, 1, current => current.turns.push({ id: randomUUID(), question: "What did you learn?", reply: null, feedback: null, provider: "local", model: "test" }));
    assert.equal(saved.turns[0].feedback?.summary, "Good"); assert.equal(saved.turns.length, 2); assert.equal(saved.revision, 2);
    assert.deepEqual(conversationHistory(saved).map(item => item.role), ["coach", "user", "coach"]);
  } finally { db.close(); }
});




test("rejects path-like record IDs and empty or excessive prompts", () => {
  assert.throws(() => experimentId("../../records"), /编号无效/);
  assert.throws(() => experimentText(" ", 500, "话题"), /不能为空/);
  assert.throws(() => experimentText("x".repeat(501), 500, "话题"), /500/);
  assert.equal(experimentText("  economics ", 500, "话题"), "economics");
});

test("retry clears the current attempt while retaining the question, target and earlier turns", () => {
  const db = openExperimentDatabase(":memory:");
  try {
    const session = createExperiment(db, "coach", "Weather"), oldId = randomUUID(), turnId = randomUUID();
    session.turns = [
      { id: oldId, question: "How are you?", reply: "Fine.", feedback: null, provider: "local", model: "test" },
      { id: turnId, question: "How is the weather?", suggestedReply: "It is sunny.", reply: null, feedback: null, provider: "local", model: "test" },
    ];
    saveCoachReply(session, turnId, "freedom", "It is warm.", null, "scoring unavailable");
    assert.equal(session.turns[1].replyRevision, 1);
    assert.equal(session.replyMode, "freedom");
    resetCoachReply(session, turnId);
    const turn = session.turns[1];
    assert.equal(turn.reply, null); assert.equal(turn.assessment, null); assert.equal(turn.assessmentError, "");
    assert.equal(turn.question, "How is the weather?"); assert.equal(turn.suggestedReply, "It is sunny.");
    assert.equal(turn.replyRevision, 2); assert.equal(session.turns[0].reply, "Fine.");
    assert.throws(() => activeCoachTurn(session, oldId), /只能修改当前/);
    assert.throws(() => resetCoachReply(session, oldId), /只能修改当前/);
    assert.throws(() => replyMode("unknown"), /请选择/);
    assert.equal(replyMode("target"), "target");
  } finally { db.close(); }
});


