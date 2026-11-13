import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { getSpeechServiceUrlForRequest } from "./services/runtime";
import { joinReadingWav } from "./reading-wav";
import { listeningRoleChunks } from "./listening-speech";
import { ttsListeningVoiceSnapshot } from "./tts-voices";
import { joinListeningWav } from "./listening-wav";
import type { ListeningFormat } from "./listening";
const state = globalThis as typeof globalThis & { listeningAudioJobs?: Map<string, Promise<Buffer>> };
const jobs = state.listeningAudioJobs ??= new Map<string, Promise<Buffer>>();
// The caller must verify lesson ownership before looking up any cached audio.
export async function listeningAudio(request: Request, path: string, paragraphs: string[], format?: ListeningFormat) {
  const snapshot = await ttsListeningVoiceSnapshot();
  const chunks = listeningRoleChunks(paragraphs, !format || ["dialogue", "daily", "interview"].includes(format));
  const plan = chunks.map((chunk) => ({ ...chunk, voice: chunk.role ? snapshot.roles[chunk.role] : snapshot.global }));
  const usedRoles = [...new Set(chunks.flatMap((chunk) => chunk.role ? [chunk.role] : []))];
  const label = usedRoles.length ? usedRoles.map((role) => `${role}：${snapshot.roles[role].label}`).join(" · ") : snapshot.global.label;
  const cacheKey = createHash("sha256").update(JSON.stringify(["roles-v1", plan.map((part) => [part.text, part.role, part.voice.cacheKey])])).digest("hex").slice(0, 24);
  path = path.replace(/\.wav$/, `.${cacheKey}.wav`);
  let audio: Buffer;
  try { audio = await readFile(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    let job = jobs.get(path);
    if (!job) {
      job = (async () => {
        const parts: { audio: Buffer; pauseBefore: boolean }[] = [], signal = AbortSignal.timeout(900_000);
        for (const [index, part] of plan.entries()) {
          const body = new FormData(); body.set("text", part.text);
          body.set("voice_id", part.voice.voiceId);
          const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/reference-audio`, { method: "POST", body, cache: "no-store", signal });
          if (!response.ok || response.headers.get("x-tts-engine") !== part.voice.provider) throw new Error("本地语音合成暂不可用。");
          parts.push({ audio: Buffer.from(await response.arrayBuffer()), pauseBefore: index > 0 && part.role !== plan[index - 1].role });
        }
        const combined = usedRoles.length ? joinListeningWav(parts) : joinReadingWav(parts.map((part) => part.audio)), temporary = path + "." + randomUUID() + ".tmp";
        try { await writeFile(temporary, combined); await rename(temporary, path); }
        finally { await unlink(temporary).catch(() => undefined); }
        return combined;
      })();
      jobs.set(path, job);
    }
    try { audio = await job; } finally { if (jobs.get(path) === job) jobs.delete(path); }
  }
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store", "X-TTS-Engine": snapshot.global.provider, "X-TTS-Voice": usedRoles.length ? "role-voices" : snapshot.global.voiceId, "X-TTS-Voice-Label": encodeURIComponent(label), "X-TTS-Roles": JSON.stringify(Object.fromEntries(usedRoles.map((role) => [role, snapshot.roles[role].voiceId]))) } });
}
