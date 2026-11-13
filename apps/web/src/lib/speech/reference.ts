import "server-only";
import { getSpeechServiceUrlForRequest } from "../services/runtime";
import { ttsVoiceSnapshot } from "../tts-voices";

/** Shared synthesis transport; independent of every learning module. */
export async function referenceSpeech(request: Request, text: string, voiceId?: string, instruct?: string, pronunciation?: string) {
  const snapshot = await ttsVoiceSnapshot();
  const voice = voiceId || snapshot.voiceId;
  const body = new FormData(); body.set("text", text); body.set("voice_id", voice);
  if (instruct) body.set("instruct", instruct);
  if (pronunciation && snapshot.provider === 'kokoro') body.set('pronunciation', pronunciation);
  const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/reference-audio`, {
    method: "POST", body, cache: "no-store",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
  });
  if (!response.ok || response.headers.get("x-tts-engine") !== snapshot.provider) {
    throw new Error("本地语音生成失败，请稍后重试。");
  }
  return new Response(await response.arrayBuffer(), { headers: {
    "Content-Type": "audio/wav", "Cache-Control": "no-store", "X-TTS-Engine": snapshot.provider,
    "X-TTS-Voice": response.headers.get("x-tts-voice") || voice,
  } });
}
