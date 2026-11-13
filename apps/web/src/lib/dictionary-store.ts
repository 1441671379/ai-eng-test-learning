import "server-only";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DictionaryReader, type DictionaryResult } from "./dictionary";

const shared = globalThis as typeof globalThis & { englishDictionary?: { path: string; reader: DictionaryReader }; dictionaryWarning?: string };
function dictionaryPath() {
  const configured = process.env.ENGLISH_DICTIONARY_DIR?.trim();
  if (configured) return join(configured, "ecdict.sqlite");
  return [resolve(process.cwd(), "../../deployment/dictionary/ecdict.sqlite"), resolve(process.cwd(), "deployment/dictionary/ecdict.sqlite")].find(existsSync);
}
export function publicDictionary(): DictionaryReader | null {
  const path = dictionaryPath();
  if (!path || !existsSync(path)) return null;
  if (shared.englishDictionary?.path === path) return shared.englishDictionary.reader;
  try {
    const reader = new DictionaryReader(path);
    shared.englishDictionary?.reader.close();
    shared.englishDictionary = { path, reader };
    return reader;
  } catch {
    if (shared.dictionaryWarning !== path) { console.warn("ECDICT index unavailable; collecting words remains available."); shared.dictionaryWarning = path; }
    return null;
  }
}
export function lookupDictionary(word: string): DictionaryResult {
  const fallback: DictionaryResult = { available: false, version: "", match: "missing", entry: null, candidates: [] };
  try { return publicDictionary()?.lookup(word) ?? fallback; }
  catch { return fallback; }
}
