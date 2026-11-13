import { NextResponse } from "next/server";
import { listeningUser, listeningError } from "@/lib/listening-api";
import { updateListening } from "@/lib/listening-store";
import { publicListening } from "@/lib/listening";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  try {
    const lesson = await updateListening(userId, (await context.params).id, (lesson) => {
      if (!lesson.attempt && !lesson.revealedAt) lesson.revealedAt = new Date().toISOString();
    });
    return NextResponse.json({ lesson: publicListening(lesson) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return listeningError(error); }
}
