import "server-only";
import { DatabaseSync } from "node:sqlite";
import type { VocabularyState } from "./vocabulary";

type Row = Record<string, unknown>;
interface Statement { all(...params: (string | number)[]): Row[]; get(...params: (string | number)[]): Row | undefined; run(...params: (string | number)[]): unknown }
export interface VocabularyDatabase { exec(sql: string): void; prepare(sql: string): Statement; close(): void }
// node:sqlite is bundled with the local Node 24 runtime; no external native binary is needed.
export function openVocabularyDatabase(path: string) {
  const db = new DatabaseSync(path);
  try { db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, word TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`); }
  catch (error) { db.close(); throw error; }
  return db;
}
export function readVocabularyDatabase(db: VocabularyDatabase): VocabularyState | null {
  const meta = db.prepare("SELECT payload FROM metadata WHERE id=1").get();
  if (!meta) return null;
  const state = JSON.parse(meta.payload as string) as VocabularyState;
  state.cards = db.prepare("SELECT payload FROM cards ORDER BY rowid").all().map(row => JSON.parse(row.payload as string));
  state.reviews = db.prepare("SELECT payload FROM reviews ORDER BY rowid").all().map(row => JSON.parse(row.payload as string));
  return state;
}
export function writeVocabularyDatabase(db: VocabularyDatabase, state: VocabularyState) {
  const { cards, reviews, ...meta } = state;
  db.prepare("INSERT INTO metadata VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(meta));
  const old = new Map(db.prepare("SELECT id,revision FROM cards").all().map(row => [row.id, row.revision]));
  const upsert = db.prepare("INSERT INTO cards VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET word=excluded.word,revision=excluded.revision,payload=excluded.payload");
  for (const card of cards) if (old.get(card.id) !== card.revision) upsert.run(card.id, card.word.toLowerCase(), card.revision, JSON.stringify(card));
  const existing = new Set(db.prepare("SELECT id FROM reviews").all().map(row => row.id));
  const insert = db.prepare("INSERT INTO reviews VALUES (?,?)");
  for (const review of reviews) if (!existing.has(review.id)) insert.run(review.id, JSON.stringify(review));
}
