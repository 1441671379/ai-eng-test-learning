import { NextResponse } from "next/server";
import { listeningUser, listeningError, listeningBody, listeningModel } from "@/lib/listening-api";
import { updateListening } from "@/lib/listening-store";
import { publicListening, validateListeningTurn } from "@/lib/listening";
import { saveLearningRecords } from "@/lib/learning-record-store";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  let input;
  try { input = validateListeningTurn(await listeningBody(request)); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  try {
    const { id } = await context.params;
    const lesson = await updateListening(userId, id, async (lesson) => {
      if (!lesson.attempt) throw new Error("请先完成听力答题，再开始听后交流。");
      const existing = lesson.conversation.find((turn) => turn.id === input.id);
      if (existing) { if (existing.user !== input.message) throw new Error("这条回答已保存，请刷新对话后发送新的回答。"); return; }
      if (lesson.conversation.length >= 20) throw new Error("本次练习已完成 20 轮交流，可以开始新的话题练习。");
      const result = await listeningModel(request, userId, "discuss", { message: input.message, paragraphs: lesson.paragraphs, level: lesson.level,
        history: lesson.conversation.slice(-10) });
      if (typeof result.reply !== "string" || !result.reply.trim() || result.reply.length > 1900) throw new Error("模型回复无效，请重试。");
      lesson.conversation.push({ id: input.id, user: input.message, assistant: result.reply.trim(), createdAt: new Date().toISOString() });
    });
    const turn = lesson.conversation.find((turn) => turn.id === input.id)!;
    let recordWarning;
    try { await saveLearningRecords(userId, [{ id: `listening-reply:${id}:${turn.id}`, module: "listening", source: "listening", kind: "listening_reply",
      title: `听后交流 · ${lesson.title}`, text: `You: ${turn.user}\nAI: ${turn.assistant}`, score: null, occurredAt: turn.createdAt, resourceId: id }]); }
    catch { recordWarning = "对话已保存，学习记录同步失败。可再次发送同一条回答重试同步。"; }
    return NextResponse.json({ lesson: publicListening(lesson), recordWarning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /请先完成|20 轮|这条回答已保存/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return listeningError(error, error instanceof Error ? error.message : undefined);
  }
}
