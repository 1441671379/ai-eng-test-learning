import { test } from "node:test";
import assert from "node:assert/strict";
import { openExperimentDatabase, createExperiment, mutateExperiment, listExperiments, readExperiment } from "../../src/lib/experiments/database.ts";
import type { TimeAlignmentResult } from "../../src/lib/experiments/time-alignment-types.ts";

test("time alignment history preserves its own result without changing coach records or inventing a score", () => {
  const db = openExperimentDatabase(":memory:");
  try {
    const coach = createExperiment(db, "coach", "Economics");
    const session = createExperiment(db, "time-alignment", "cat");
    const unavailable = { available: false as const, version: "test", mode: "soft" as const, reason: "ambiguous" };
    const result: TimeAlignmentResult = {
      version: "test", targetText: "cat", transcript: "cat", transcriptSource: "provided", duration: 1, elapsedSeconds: .5, experimental: true,
      evidence: [{ token: "k", confidence: .9, peakSec: .5 }],
      timing: { version: "existing", model: "cached", device: "cpu", alignmentSeconds: .1, modelLoadSeconds: .1 },
      methods: { soft: unavailable, hard: { ...unavailable, mode: "hard" } },
    };
    mutateExperiment(db, session.id, 0, current => { current.timeAlignment = result; });
    assert.equal(readExperiment(db, session.id).kind, "time-alignment");
    assert.deepEqual(readExperiment(db, session.id).timeAlignment, result);
    assert.equal(listExperiments(db).find(row => row.id === session.id)?.score, null);
    assert.equal(readExperiment(db, coach.id).timeAlignment, undefined);
    mutateExperiment(db, session.id, 1, current => {
      current.timeAlignment!.methods.soft = { available: true, mode: "soft", version: "test", words: [], operations: [],
        certainErrorWords: [], missingTranscriptWords: [], orphanHeardIndices: [], consistencyIndex: 82, sentenceEditDistance: 1,
        scoreKind: "experimental-phoneme-consistency-not-calibrated" };
    });
    assert.equal(listExperiments(db).find(row => row.id === session.id)?.score, 82);
    assert.equal(listExperiments(db).find(row => row.id === coach.id)?.score, null);
  } finally { db.close(); }
});
