// FILE: src/app/api/reference-audio/generate/route.ts
import { NextResponse } from "next/server";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const engineUrl = getSpeechServiceUrlForRequest(request);
  const payload = (await request.json().catch(() => null)) as
    | { text?: string; instruct?: string; voice_id?: string }
    | null;
  const text = payload?.text?.trim();
  const instruct = payload?.instruct?.trim();
  const voiceId = payload?.voice_id;

  if (!text) {
    return NextResponse.json(
      { error: "Target text is required." },
      { status: 400 },
    );
  }

  try {
    const formData = new FormData();
    formData.set("text", text);
    if (voiceId) formData.set("voice_id", voiceId);
    if (instruct) {
      formData.set("instruct", instruct);
    }

    const response = await fetch(`${engineUrl}/reference-audio`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null;

      return NextResponse.json(
        {
          error: errorPayload?.detail ?? "Reference pronunciation generation failed.",
        },
        { status: response.status },
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
        "X-TTS-Engine": response.headers.get("x-tts-engine") ?? "unknown",
        "X-TTS-Voice": response.headers.get("x-tts-voice") ?? "unknown",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Reference pronunciation is unavailable. Make sure the local ai-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}
