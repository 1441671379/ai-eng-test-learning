import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { readingUser, readingError } from "@/lib/reading-api";
import { readReading, readingAudioPath } from "@/lib/reading-store";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";
import { joinReadingWav } from "@/lib/reading-wav";
import { ttsVoiceSnapshot } from "@/lib/tts-voices";
export const runtime = "nodejs";
const audioGlobal = globalThis as typeof globalThis & { readingAudioJobs?: Map<string, Promise<Buffer>> };
const jobs = audioGlobal.readingAudioJobs ??= new Map<string, Promise<Buffer>>();
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try {
    const { id } = await context.params;
    const lesson = await readReading(userId, id); // Authenticate ownership before serving the cached file.
    const voice = await ttsVoiceSnapshot();
    const path = readingAudioPath(userId, id).replace(/\.wav$/, `.${voice.cacheKey}.wav`);
    let audio: Buffer;
    try { audio = await readFile(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let job = jobs.get(path);
      if (!job) {
        job = (async () => {
          const parts: Buffer[] = [];
          const signal = AbortSignal.timeout(480_000);
          for (const paragraph of lesson.paragraphs) {
            const body = new FormData(); body.set("text", paragraph);
            body.set("voice_id", voice.voiceId);
            const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/reference-audio`, { method: "POST", body, cache: "no-store", signal });
            if (!response.ok || response.headers.get("x-tts-engine") !== voice.provider) throw new Error("本地语音合成暂不可用。");
            parts.push(Buffer.from(await response.arrayBuffer()));
          }
          const combined = joinReadingWav(parts);
          const temporary = path + "." + randomUUID() + ".tmp";
          try { await writeFile(temporary, combined); await rename(temporary, path); }
          finally { await unlink(temporary).catch(() => undefined); }
          return combined;
        })();
        jobs.set(path, job);
      }
      try { audio = await job; } finally { if (jobs.get(path) === job) jobs.delete(path); }
    }
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store", "X-TTS-Engine": voice.provider, "X-TTS-Voice": voice.voiceId, "X-TTS-Voice-Label": encodeURIComponent(voice.label) } });
  } catch (error) { return readingError(error, "文章音频准备失败，请检查本地语音服务后点击重试。阅读和答题仍可继续。"); }
}
