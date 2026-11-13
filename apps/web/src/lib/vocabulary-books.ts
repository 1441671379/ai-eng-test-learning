import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { importVocabulary, vocabularySnapshot } from "./vocabulary-store";
import { VocabularyError, type WordInput } from "./vocabulary";
export interface LocalWordbook { id: string; name: string; level: string; count: number; description: string; sources: string[]; license: string; sha256: string }
function booksPath() { return process.env.ENGLISH_WORDBOOKS_DIR || join(resolveDataDir(), "..", "vocabulary", "books"); }
async function manifest(): Promise<LocalWordbook[]> {
  try { return JSON.parse(await readFile(join(booksPath(), "manifest.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function localWordbooks(userId: string) {
  const [books, snapshot] = await Promise.all([manifest(), vocabularySnapshot(userId)]);
  return books.map(book => ({ ...book, deckId: snapshot.decks.find(d => d.name === book.name)?.id ?? null }));
}
export async function startLocalWordbook(userId: string, id: string) {
  const book = (await manifest()).find(b => b.id === id);
  if (!book || !/^[a-z0-9-]+$/.test(book.id)) throw new VocabularyError("本地词书不存在。", 404);
  const saved = (await vocabularySnapshot(userId)).decks.find(d => d.name === book.name);
  if (saved) return { deckId: saved.id };
  const bytes = await readFile(join(booksPath(), book.id + ".json"));
  if (createHash("sha256").update(bytes).digest("hex") !== book.sha256) throw new VocabularyError("本地词书校验失败，请重新安装词书。", 503);
  const words: WordInput[] = JSON.parse(bytes.toString("utf8"));
  return importVocabulary(userId, book.name, words, "builtin");
}
