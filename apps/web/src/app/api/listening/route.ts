import { NextResponse } from "next/server";
import { listeningUser, listeningBody, listeningError, listeningModel } from "@/lib/listening-api";
import { createListening, listListenings } from "@/lib/listening-store";
import { publicListening } from "@/lib/listening";
import { vocabularyContext } from "@/lib/vocabulary-store";
import { generationOptions } from "@/lib/learning-generation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  try { return NextResponse.json({ lessons: await listListenings(userId) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return listeningError(error); }
}
export async function POST(request: Request) {
  const userId = await listeningUser(request); if (typeof userId !== "string") return userId;
  let input;
  try {
    input = await listeningBody(request);
    Object.assign(input, generationOptions(input));
    if (typeof input.topic !== "string" || !input.topic.trim() || input.topic.trim().length > 160 ||
      !["short", "medium", "long"].includes(input.length ?? "medium") ||
      !["dialogue", "daily", "interview", "science", "podcast"].includes(input.format ?? "science")) throw new Error("请填写话题，并选择难度、长度和听力形式。");
    if (input.includeVocabulary !== undefined && typeof input.includeVocabulary !== "boolean") throw new Error("请选择是否带入生词本。");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "请求无效。" }, { status: 400 }); }
  try {
    const generated = await listeningModel(request, userId, "generate", { topic: input.topic.trim(), level: input.level, remarks: input.remarks,
      length: input.length ?? "medium", format: input.format ?? "science", targetWords: input.includeVocabulary === false ? [] : (await vocabularyContext(userId)).map(word => word.word) });
    if (!Array.isArray(generated.paragraphs) || generated.questions?.length !== 6) throw new Error("听力模型返回无效。");
    const lesson = await createListening(userId, { ...generated, level: input.level, remarks: input.remarks, modelProvider: "configured" });
    return NextResponse.json({ lesson: publicListening(lesson) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return listeningError(error, error instanceof Error ? error.message : undefined); }
}
