import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { wordKey } from "./vocabulary";
import type { WordRecording } from "./word-audio";

type Lexical = {id: string; word: string; label: string; referencePhones: string[]};
let cached: {path: string; entries: Lexical[]} | undefined;
export function lexicalPronunciations(word: string): WordRecording[] {
  const folder = process.env.ENGLISH_WORD_PRONUNCIATIONS_DIR ||
    [resolve(process.cwd(), "../../deployment/word-pronunciations"), resolve(process.cwd(), "deployment/word-pronunciations")]
      .find(path => existsSync(join(path, "catalog.json")));
  if (!folder) return [];
  const path = join(folder, "catalog.json");
  if (!existsSync(path)) return [];
  if (cached?.path !== path) {
    const data = JSON.parse(readFileSync(path, "utf8")) as {schema: number; entries: Lexical[]};
    if (data.schema !== 1 || !Array.isArray(data.entries)) throw new Error("Invalid lexical pronunciation catalog");
    cached = {path, entries: data.entries};
  }
  return cached.entries.filter(item => wordKey(item.word) === wordKey(word)).map(item => ({...item,
    file: item.id + ".wav", relativePath: "", bytes: 0, sha256: "", accent: "other", pos: [], ipa: "",
    author: "Locally generated Kokoro speech", license: "See Kokoro model card and lexical notices",
    licenseUrl: "https://huggingface.co/hexgrad/Kokoro-82M", sourceUrl: "", processing: "Local Kokoro synthesis from a selected lexical pronunciation",
    kind: "synthesized", engine: "kokoro", localSynthesis: true, cached: false}));
}
