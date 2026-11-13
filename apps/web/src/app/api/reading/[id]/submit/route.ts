import { NextResponse } from "next/server";
import { readingUser, readingError } from "@/lib/reading-api";
import { submitReading } from "@/lib/reading-store";
import { gradeReading, publicReading } from "@/lib/reading";
import { saveLearningRecords } from "@/lib/learning-record-store";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try {
    const { id } = await context.params;
    const raw = await request.text(); if (raw.length > 3000) return NextResponse.json({ error: "答案过长。" }, { status: 400 });
    const input = JSON.parse(raw);
    const lesson = await submitReading(userId, id, input.answers);
    const review = gradeReading(lesson)!;
    let recordWarning;
    try { await saveLearningRecords(userId, [{ id: `reading:${id}`, module: "reading", source: "reading", kind: "reading_quiz", title: lesson.title, text: `${review.correct} / ${review.total} 题答对 · ${lesson.wordCount} 词 · ${lesson.topic}`, score: review.score, occurredAt: review.submittedAt, resourceId: id }]); }
    catch { recordWarning = "答题结果已保存，但统一学习记录同步失败。请再次点击同步记录。"; }
    return NextResponse.json({ lesson: publicReading(lesson), recordWarning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "答案格式无效。" }, { status: 400 });
    if (error instanceof Error && !("code" in error)) return NextResponse.json({ error: error.message }, { status: 400 });
    return readingError(error, "保存答题结果失败，请重试。");
  }
}
