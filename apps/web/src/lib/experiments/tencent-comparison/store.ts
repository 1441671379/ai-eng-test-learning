import { DatabaseSync } from "node:sqlite";
import type { ComparisonRecord, ComparisonSummary, ProviderResult } from "./types";
import { experimentId, ExperimentError } from "../types";
import { detailedComparison } from "./details";

export function openComparisonDatabase(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS comparisons (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY, wav BLOB NOT NULL);");
  } catch (error) { db.close(); throw error; }
  return db;
}
type Database = ReturnType<typeof openComparisonDatabase>;
export function saveComparison(db: Database, record: ComparisonRecord, wav: Uint8Array) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT OR IGNORE INTO audio(id,wav) VALUES(?,?)").run(record.audio.id, wav);
    db.prepare("INSERT INTO comparisons(id,created_at,payload) VALUES(?,?,?)").run(record.id, record.createdAt, JSON.stringify(record));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function readComparison(db: Database, id: string): ComparisonRecord {
  const row = db.prepare("SELECT payload FROM comparisons WHERE id=?").get(experimentId(id));
  if (!row) throw new ExperimentError("对照实验记录不存在。", 404);
  return detailedComparison(JSON.parse(row.payload as string));
}
export function completeProvider(db: Database, id: string, provider: "local" | "tencent", result: ProviderResult) {
  // Each provider patches the latest payload in a short transaction; a fast failure cannot erase the other result.
  db.exec("BEGIN IMMEDIATE");
  try {
    const record = readComparison(db, id); record[provider] = result; record.updatedAt = new Date().toISOString();
    db.prepare("UPDATE comparisons SET payload=? WHERE id=?").run(JSON.stringify(record), id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function allComparisons(db: Database): ComparisonRecord[] {
  return db.prepare("SELECT payload FROM comparisons ORDER BY created_at DESC,id DESC").all().map(row => detailedComparison(JSON.parse(row.payload as string)));
}
export function listComparisons(db: Database): ComparisonSummary[] {
  return db.prepare("SELECT payload FROM comparisons ORDER BY created_at DESC,id DESC LIMIT 100").all().map(row => {
    const record = JSON.parse(row.payload as string) as ComparisonRecord;
    return { id: record.id, createdAt: record.createdAt, text: record.text, audio: record.audio, localStatus: record.local.status, tencentStatus: record.tencent.status };
  });
}
export function comparisonAudio(db: Database, id: string): Uint8Array {
  const record = readComparison(db, id), row = db.prepare("SELECT wav FROM audio WHERE id=?").get(record.audio.id);
  if (!row) throw new ExperimentError("对照录音不存在。", 404);
  return row.wav as Uint8Array;
}
