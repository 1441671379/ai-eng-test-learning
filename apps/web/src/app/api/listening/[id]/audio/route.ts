import { NextResponse } from "next/server";
import { listeningUser, listeningError } from "@/lib/listening-api";
import { readListening, listeningAudioPath } from "@/lib/listening-store";
import { listeningAudio } from "@/lib/listening-audio";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  try {
    const { id } = await context.params, lesson = await readListening(userId, id);
    const turnId = new URL(request.url).searchParams.get("turn") || undefined;
    const turn = turnId ? lesson.conversation.find((turn) => turn.id === turnId) : undefined;
    if (turnId && !turn) return NextResponse.json({ error: "对话记录不存在。" }, { status: 404 });
    return await listeningAudio(request, listeningAudioPath(userId, id, turnId), turn ? [turn.assistant] : lesson.paragraphs, turn ? "science" : lesson.format);
  } catch (error) { return listeningError(error, "本地语音生成失败，请稍后重试。"); }
}
