import "server-only";
import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile, rename, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { chooseWordAudio, type WordAccent } from "./word-audio";
import { WordAudioCatalog } from "./word-audio-catalog";
import { WordAudioDownloader } from "./word-audio-download";
import { resolveDataDir } from "./pairing/store";
import { lexicalPronunciations } from "./word-pronunciations";

const shared = globalThis as typeof globalThis & { wordAudioCatalog?: { directory: string; catalog: WordAudioCatalog }; wordAudioDownloader?: WordAudioDownloader };
const downloader = shared.wordAudioDownloader ??= new WordAudioDownloader();
const cacheDirectory = () => join(resolveDataDir(), "word-audio-cache");
function directory() {
  const configured = process.env.ENGLISH_WORD_AUDIO_DIR?.trim();
  if (configured) return configured;
  return [resolve(process.cwd(), "../../deployment/word-audio"), resolve(process.cwd(), "deployment/word-audio")].find(path => existsSync(join(path, "catalog.sqlite")));
}
function catalog() {
  const folder = directory(); if (!folder || !existsSync(join(folder, "catalog.sqlite"))) return null;
  if (shared.wordAudioCatalog?.directory === folder) return shared.wordAudioCatalog;
  try {
    const next = { directory: folder, catalog: new WordAudioCatalog(join(folder, "catalog.sqlite")) };
    shared.wordAudioCatalog?.catalog.close(); shared.wordAudioCatalog = next; return next;
  } catch { return null; }
}
export function wordAudioChoices(word: string, accent: WordAccent, allowDownload = true) {
  const lexical = lexicalPronunciations(word);
  if (lexical.length) return chooseWordAudio(lexical, accent);
  if (/^[A-Z]{2,5}$/.test(word.trim())) return chooseWordAudio([], accent);
  try {
    const source = catalog();
    const recordings = source?.catalog.lookup(word).map(recording => ({ ...recording,
      cached: (recording.bytes > 0 && existsSync(join(source.directory, recording.relativePath))) || (existsSync(join(cacheDirectory(), recording.id + ".ogg")) && existsSync(join(cacheDirectory(), recording.id + ".json"))) })) ?? [];
    const choices = chooseWordAudio(recordings, accent);
    if (!allowDownload || downloader.cooldownUntil > Date.now()) {
      const cached = chooseWordAudio(recordings.filter(item => item.cached), accent);
      return { ...choices, preferredId: choices.needsSelection ? null : cached.preferredId };
    }
    return choices;
  } catch { return chooseWordAudio([], accent); }
}
async function verifiedFile(path: string, length: number, hash: string) {
  try {
    const details = await stat(path); if (details.size > 2 * 1024 * 1024 || details.size !== length) return null;
    const bytes = await readFile(path);
    return createHash("sha256").update(bytes).digest("hex") === hash ? bytes : null;
  } catch { return null; }
}
export async function wordAudioFile(word: string, id: string, allowDownload = true) {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const source = catalog(); if (!source) return null;
  const recording = source.catalog.lookup(word).find(item => item.id === id);
  if (!recording || recording.relativePath !== `audio/${id}.ogg`) return null;
  if (recording.bytes > 0) {
    const bytes = await verifiedFile(join(source.directory, recording.relativePath), recording.bytes, recording.sha256);
    if (bytes) return { recording, bytes, hash: recording.sha256 };
  }
  const cache = cacheDirectory(), cachedFile = join(cache, id + ".ogg"), sidecar = join(cache, id + ".json");
  try {
    const saved = JSON.parse(await readFile(sidecar, "utf8")) as { bytes: number; sha256: string };
    const bytes = await verifiedFile(cachedFile, saved.bytes, saved.sha256);
    if (bytes) return { recording, bytes, hash: saved.sha256 };
  } catch { /* An interrupted or absent cache can be retried without changing learner data. */ }
  if (!allowDownload || !recording.url) return null;
  const bytes = await downloader.get(recording.url); if (!bytes) return null;
  const hash = createHash("sha256").update(bytes).digest("hex");
  try {
    await mkdir(cache, { recursive: true });
    const temporary = cachedFile + "." + randomUUID() + ".tmp";
    await writeFile(temporary, bytes); await rename(temporary, cachedFile);
    const metadata = sidecar + "." + randomUUID() + ".tmp";
    await writeFile(metadata, JSON.stringify({ ...recording, bytes: bytes.length, sha256: hash })); await rename(metadata, sidecar);
  } catch { /* A read-only/full cache directory must not prevent this playback. */ }
  return { recording, bytes, hash };
}
