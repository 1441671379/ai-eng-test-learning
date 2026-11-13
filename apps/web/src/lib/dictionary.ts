import { DatabaseSync } from "node:sqlite";
import { wordKey, type VocabularyCard, type WordInput } from "./vocabulary";

export interface DictionaryEntry {
  word: string; phonetic: string; definition: string; translation: string;
  pos: string; tags: string[]; exchange: string;
}
export interface DictionaryResult {
  available: boolean; version: string; match: "exact" | "lemma" | "ambiguous" | "missing";
  entry: DictionaryEntry | null; candidates: DictionaryEntry[];
}
const text = (value: unknown) => typeof value === "string" ? value.replace(/\\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "";
function entry(row: Record<string, unknown>): DictionaryEntry {
  return { word: text(row.word), phonetic: text(row.phonetic), definition: text(row.definition),
    translation: text(row.translation), pos: text(row.pos), tags: text(row.tags).split(/\s+/).filter(Boolean), exchange: text(row.exchange) };
}

/** The public dictionary is immutable. It has no learner cards or schedules. */
export class DictionaryReader {
  private db: DatabaseSync;
  readonly version: string;
  readonly count: number;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      this.db.exec("PRAGMA query_only=ON");
      const metadata = Object.fromEntries(this.db.prepare("SELECT name,value FROM metadata").all().map(row => [row.name, row.value]));
      if (metadata.schema !== "1" || metadata.source !== "ECDICT" || !/^[a-f0-9]{40}$/.test(String(metadata.commit))) throw new Error("Unsupported dictionary index");
      this.version = String(metadata.commit);
      this.count = Number(metadata.entries);
    } catch (error) { this.db.close(); throw error; }
  }
  lookup(word: string): DictionaryResult {
    const key = wordKey(word);
    const result: DictionaryResult = { available: true, version: this.version, match: "missing", entry: null, candidates: [] };
    if (!key || key.length > 80 || !/^[a-z][a-z' -]*$/.test(key)) return result;
    const row = this.db.prepare("SELECT * FROM entries WHERE word_key=?").get(key);
    // Don't silently interpret an acronym such as US or IT as the pronoun us/it.
    if (/^[A-Z]{2,5}$/.test(word.trim()) && row?.word !== word.trim()) return result;
    if (row && (text(row.translation) || text(row.definition))) return { ...result, match: "exact", entry: entry(row) };
    const candidates = this.db.prepare(`SELECT DISTINCT e.* FROM forms f JOIN entries e ON e.word_key=f.headword_key
      WHERE f.form_key=? AND (e.translation<>'' OR e.definition<>'') ORDER BY e.word_key LIMIT 16`).all(key).map(entry);
    if (candidates.length === 1) return { ...result, match: "lemma", entry: candidates[0] };
    return candidates.length ? { ...result, match: "ambiguous", candidates } : result;
  }
  close() { this.db.close(); }
}

/** Fill blanks only; a lemma's IPA is never presented as the surface word's IPA. */
export function dictionaryFields(input: WordInput, result: DictionaryResult): { meaning?: string; phonetic?: string; dictionary?: VocabularyCard["dictionary"] } {
  if (!result.entry || !["exact", "lemma"].includes(result.match)) return {};
  const fields: ("meaning" | "phonetic")[] = [];
  const output: ReturnType<typeof dictionaryFields> = {};
  if (!input.meaning?.trim()) {
    const meaning = result.entry.translation || result.entry.definition;
    if (meaning) { output.meaning = meaning.slice(0, 4000); fields.push("meaning"); }
  }
  if (!input.phonetic?.trim() && result.match === "exact" && result.entry.phonetic && result.entry.phonetic.length <= 200) {
    output.phonetic = result.entry.phonetic; fields.push("phonetic");
  }
  if (fields.length) output.dictionary = { source: "ECDICT", version: result.version, headword: result.entry.word,
    match: result.match as "exact" | "lemma", fields };
  return output;
}

export function fillCardFromDictionary(card: VocabularyCard, result: DictionaryResult): boolean {
  const fields = dictionaryFields(card, result);
  if (!fields.dictionary) return false;
  // A pre-existing attribution may describe the other field filled earlier.
  if (card.dictionary?.version === fields.dictionary.version && card.dictionary.headword === fields.dictionary.headword) {
    fields.dictionary.fields = [...new Set([...card.dictionary.fields, ...fields.dictionary.fields])];
  }
  Object.assign(card, fields); card.revision++;
  return true;
}
