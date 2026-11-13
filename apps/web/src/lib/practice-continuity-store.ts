import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { isPracticeModule, validatePracticeEntry, movePhraseCheckpoint, type PracticeSnapshot } from "./practice-continuity";
import type { LearningModuleId } from "./learning-modules";

function file(userId: string) {
  if (!userId || userId.length > 256) throw new Error("Invalid learner");
  return join(resolveDataDir(), "practice-continuity", createHash("sha256").update(userId).digest("hex") + ".json");
}
export function readPracticeSnapshot(userId: string): PracticeSnapshot {
  let text: string;
  try { text = readFileSync(file(userId), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  const value = JSON.parse(text);
  if (value.version !== 1 || !value.modules || typeof value.modules !== "object") throw new Error("Invalid practice state; original file preserved");
  const result: PracticeSnapshot = {};
  for (const [key, entry] of Object.entries(value.modules)) {
    if (!isPracticeModule(key)) continue;
    const checked = validatePracticeEntry(key, entry); if (checked) result[key] = checked;
  }
  return movePhraseCheckpoint(result);
}

/** A small atomic local checkpoint, separate from exercises, scores and FSRS. */
export function savePracticeEntry(userId: string, module: LearningModuleId, raw: unknown) {
  const entry = validatePracticeEntry(module, raw), snapshot = readPracticeSnapshot(userId);
  if (entry) snapshot[module] = entry; else delete snapshot[module];
  const directory = join(resolveDataDir(), "practice-continuity"); mkdirSync(directory, { recursive: true });
  const target = file(userId), temporary = target + "." + randomUUID() + ".tmp";
  try { writeFileSync(temporary, JSON.stringify({ version: 1, modules: snapshot }), "utf8"); renameSync(temporary, target); }
  finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  return snapshot;
}
