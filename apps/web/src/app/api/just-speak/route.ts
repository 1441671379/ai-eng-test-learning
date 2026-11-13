import { NextResponse } from "next/server";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";
import { globalModelProxy } from "@/lib/models/global-proxy";
import { readingUser } from "@/lib/reading-api";

export const runtime = "nodejs";

type TranscribePayload = {
  text?: string;
  transcript?: string;
  [key: string]: unknown;
};

function pickTranscript(payload: TranscribePayload | null): string {
  const v = String(payload?.text ?? payload?.transcript ?? "").trim();
  return v;
}

export async function POST(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  const engineUrl = getSpeechServiceUrlForRequest(request);
  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "An audio file is required." }, { status: 400 });
  }

  const transcribeFormData = new FormData();
  transcribeFormData.set("audio", audio, audio.name || "attempt.wav");

  try {
    const transcribeRes = await fetch(`${engineUrl}/transcribe`, {
      method: "POST",
      body: transcribeFormData,
      cache: "no-store",
    });

    const transcribeJson = (await transcribeRes.json().catch(() => null)) as
      | TranscribePayload
      | null;

    if (!transcribeRes.ok) {
      const message =
        transcribeJson && typeof transcribeJson === "object" && "detail" in transcribeJson
          ? String((transcribeJson as { detail?: unknown }).detail)
          : "FastAPI transcription failed.";
      return NextResponse.json({ error: message }, { status: transcribeRes.status });
    }

    const whisperTranscript = pickTranscript(transcribeJson);

    let feedback = null, feedbackWarning;
    if (whisperTranscript) {
      const result = await globalModelProxy(request, "just-speak", { transcript: whisperTranscript });
      const value = await result.json();
      if (result.ok) feedback = value.feedback;
      else feedbackWarning = value.error || "模型反馈暂不可用，语音转写已保留。";
    }

    return NextResponse.json({
      whisperTranscript,
      feedback,
      feedbackWarning,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Just Speak is offline. Make sure the local ai-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}

