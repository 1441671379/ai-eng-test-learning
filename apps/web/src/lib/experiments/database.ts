import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ExperimentError, experimentId, type ExperimentKind, type ExperimentSession, type ExperimentSummary } from "./types";
import { DEFAULT_TIME_ALIGNMENT_SETTINGS, parseTimeAlignmentSettings, type TimeAlignmentSettings } from "./time-alignment-judgement";
import { summarizeArticle } from "./article-reading";

export function openExperimentDatabase(path: string) {
  const db = new DatabaseSync(path);
  try { db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS time_alignment_settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);"); }
  catch (error) { db.close(); throw error; }
  return db;
}
type Database = ReturnType<typeof openExperimentDatabase>;
export function readTimeAlignmentSettings(db: Database): TimeAlignmentSettings {
  const row = db.prepare("SELECT payload FROM time_alignment_settings WHERE id=1").get();
  if (row) { try { return parseTimeAlignmentSettings(JSON.parse(row.payload as string)); } catch { /* Old or damaged settings do not invalidate learning records. */ } }
  return { ...DEFAULT_TIME_ALIGNMENT_SETTINGS };
}
export function saveTimeAlignmentSettings(db: Database, settings: TimeAlignmentSettings): TimeAlignmentSettings {
  const value = parseTimeAlignmentSettings(settings);
  db.prepare("INSERT INTO time_alignment_settings(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(value));
  return value;
}
export function readExperiment(db: Database, id: string): ExperimentSession {
  const row = db.prepare("SELECT payload FROM sessions WHERE id=?").get(experimentId(id));
  if (!row) throw new ExperimentError("实验记录不存在。", 404);
  return JSON.parse(row.payload as string) as ExperimentSession;
}
export function listExperiments(db: Database): ExperimentSummary[] {
  return db.prepare("SELECT payload FROM sessions ORDER BY updated_at DESC LIMIT 100").all().map(row => {
    const session = JSON.parse(row.payload as string) as ExperimentSession;
    const article = session.articleReading ? summarizeArticle(session.articleReading) : null;
    return { id: session.id, kind: session.kind, topic: session.topic, createdAt: session.createdAt, updatedAt: session.updatedAt,
      replies: session.turns.filter(turn => turn.reply).length, score: article ? article.score : session.assessment?.score ?? (session.timeAlignment?.methods.soft.available ? session.timeAlignment.methods.soft.consistencyIndex : null),
      ...(article ? { articleProgress: { recorded: article.recordedSegments, total: article.segmentCount, complete: article.complete } } : {}) };
  });
}
export function createExperiment(db: Database, kind: ExperimentKind, topic: string, initialize?: (session: ExperimentSession) => void): ExperimentSession {
  const now = new Date().toISOString();
  const session: ExperimentSession = { id: randomUUID(), kind, topic, createdAt: now, updatedAt: now, revision: 0, turns: [], assessment: null };
  initialize?.(session);
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(session.id, now, JSON.stringify(session));
  return session;
}
export function mutateExperiment(db: Database, id: string, revision: number | null, change: (session: ExperimentSession) => void): ExperimentSession {
  db.exec("BEGIN IMMEDIATE");
  try {
    const session = readExperiment(db, id);
    if (revision !== null && revision !== session.revision) throw new ExperimentError("这段实验已在其他页面更新，请重新打开记录后继续。", 409);
    change(session);
    // Feedback is an independent patch and does not invalidate an in-flight conversation turn.
    if (revision !== null) session.revision++;
    session.updatedAt = new Date().toISOString();
    db.prepare("UPDATE sessions SET updated_at=?,payload=? WHERE id=?").run(session.updatedAt, JSON.stringify(session), id);
    db.exec("COMMIT"); return session;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function deleteExperiment(db: Database, id: string) { db.prepare("DELETE FROM sessions WHERE id=?").run(experimentId(id)); }
