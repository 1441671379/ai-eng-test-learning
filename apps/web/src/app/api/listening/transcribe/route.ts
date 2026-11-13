import { NextResponse } from "next/server";
import { listeningUser, listeningError } from "@/lib/listening-api";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  try {
    const form = await request.formData(), audio = form.get("audio");
    if (!(audio instanceof File) || !audio.size || audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "请提供不超过 25 MB 的语音录音。" }, { status: 400 });
    const body = new FormData(); body.set("audio", audio, "listening-reply.webm");
    const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/transcribe`, { method: "POST", body, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
    const value = await response.json();
    return NextResponse.json(response.ok ? value : { error: "语音识别失败，请重试或直接输入英文。" }, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return listeningError(error, "语音识别暂不可用，可以直接输入英文交流。"); }
}
