import "server-only";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { isWritingId, WritingError, type WritingDocument, type WritingInput, type WritingReview, type WritingSummary, type WritingVersion } from "./writing";

async function database<T>(userId: string, action: (db: DatabaseSync) => T) {
  if (!userId || userId.length > 256) throw new WritingError("用户无效。", 401);
  const directory = join(resolveDataDir(), "writing"); await mkdir(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, createHash("sha256").update(userId).digest("hex") + ".sqlite"));
  try {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, request_id TEXT NOT NULL, number INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(document_id,request_id), UNIQUE(document_id,number));`);
    return action(db);
  } finally { db.close(); }
}
function validId(id: string) { if (!isWritingId(id)) throw new WritingError("写作记录不存在。", 404); }
function readDocument(db: DatabaseSync, id: string): WritingDocument {
  validId(id);
  const row = db.prepare("SELECT payload FROM documents WHERE id=?").get(id);
  if (!row) throw new WritingError("写作记录不存在。", 404);
  const draft = JSON.parse(row.payload as string) as WritingDocument;
  draft.versions = db.prepare("SELECT payload FROM versions WHERE document_id=? ORDER BY number").all(id).map(row => JSON.parse(row.payload as string));
  return draft;
}
export function readWriting(userId: string, id: string) { return database(userId, db => readDocument(db, id)); }
export function listWritings(userId: string): Promise<WritingSummary[]> {
  return database(userId, db => db.prepare("SELECT id FROM documents ORDER BY updated_at DESC").all().map(row => {
    const doc = readDocument(db, row.id as string), last = doc.versions.at(-1);
    return { id: doc.id, title: doc.title || "未命名写作", mode: doc.mode, updatedAt: doc.updatedAt, versionCount: doc.versions.length, band: last?.review.band ?? null };
  }));
}
export function saveWriting(userId: string, id: string, expectedRevision: number, input: WritingInput) {
  validId(id);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new WritingError("草稿版本无效。");
  return database(userId, db => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const old = db.prepare("SELECT revision FROM documents WHERE id=?").get(id);
      if ((old?.revision ?? 0) !== expectedRevision) throw new WritingError("草稿已在其他窗口更新。请保留当前文字，重新打开历史记录后再修改。", 409);
      if (input.parentVersionId && (!old || !readDocument(db, id).versions.some(v => v.id === input.parentVersionId))) throw new WritingError("对应原稿版本不存在。");
      const draft = { ...input, id, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
      db.prepare("INSERT INTO documents VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,payload=excluded.payload").run(id, draft.revision, draft.updatedAt, JSON.stringify(draft));
      const versions = readDocument(db, id).versions;
      db.exec("COMMIT"); return { ...draft, versions };
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
}
export function findWritingVersion(userId: string, id: string, requestId: string) {
  return database(userId, db => { readDocument(db, id); const row = db.prepare("SELECT payload FROM versions WHERE document_id=? AND request_id=?").get(id, requestId); return row ? JSON.parse(row.payload as string) as WritingVersion : null; });
}
export function saveWritingVersion(userId: string, snapshot: WritingDocument, requestId: string, assisted: boolean, parentVersionId: string | null, review: WritingReview) {
  return database(userId, db => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = readDocument(db, snapshot.id);
      const previous = current.versions.find(v => v.requestId === requestId);
      if (previous) { db.exec("COMMIT"); return previous; }
      if (parentVersionId && !current.versions.some(v => v.id === parentVersionId)) throw new WritingError("修改稿对应的原稿不存在。");
      const version: WritingVersion = { id: randomUUID(), number: current.versions.length + 1, requestId, draftRevision: snapshot.revision,
        title: snapshot.title, mode: snapshot.mode, prompt: snapshot.prompt, text: snapshot.text,
        assisted, parentVersionId, review, submittedAt: new Date().toISOString() };
      db.prepare("INSERT INTO versions VALUES (?,?,?,?,?)").run(version.id, snapshot.id, requestId, version.number, JSON.stringify(version));
      db.exec("COMMIT"); return version;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
}
