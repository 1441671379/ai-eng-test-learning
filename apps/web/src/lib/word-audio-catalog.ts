import { DatabaseSync } from "node:sqlite";
import { wordKey } from "./vocabulary";
import type { WordRecording } from "./word-audio";

/** Shared reference catalog, never a per-learner database. */
export class WordAudioCatalog {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      this.db.exec("PRAGMA query_only=ON");
      const row = this.db.prepare("SELECT value FROM metadata WHERE name='manifest'").get();
      if (!row || JSON.parse(String(row.value)).schema !== 1) throw new Error("Unsupported word audio catalog");
    } catch (error) { this.db.close(); throw error; }
  }
  lookup(word: string): WordRecording[] {
    return this.db.prepare("SELECT payload FROM recordings WHERE word_key=? LIMIT 16").all(wordKey(word)).map(row => JSON.parse(String(row.payload)) as WordRecording);
  }
  close() { this.db.close(); }
}
