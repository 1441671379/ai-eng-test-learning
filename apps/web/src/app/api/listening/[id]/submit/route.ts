import { NextResponse } from "next/server";
import { listeningUser, listeningError, listeningBody } from "@/lib/listening-api";
import { submitListening } from "@/lib/listening-store";
import { publicListening } from "@/lib/listening";
import { saveLearningRecords } from "@/lib/learning-record-store";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  let input;
  try { input = await listeningBody(request); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  try {
    const { id } = await context.params;
    const lesson = await submitListening(userId, id, input.answers), value = publicListening(lesson), review = value.review!;
    let recordWarning;
    try { await saveLearningRecords(userId, [{ id: `listening:${id}`, module: "listening", source: "listening", kind: "listening_quiz", title: lesson.title,
      text: `${review.correct} / ${review.total} 题答对 · ${lesson.wordCount} 词 · ${review.assisted ? "辅助练习（提交前已看原文）" : "听音练习"} · ${lesson.topic}`,
      score: review.score, occurredAt: review.submittedAt, resourceId: id }]); }
    catch { recordWarning = "答题结果已保存，学习记录同步失败。请点击重新同步记录。"; }
    return NextResponse.json({ lesson: value, recordWarning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && !("code" in error)) return NextResponse.json({ error: error.message }, { status: 400 });
    return listeningError(error);
  }
}
