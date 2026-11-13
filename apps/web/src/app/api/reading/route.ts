import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readingUser, readingError } from "@/lib/reading-api";
import { createReading, listReadings, readWords } from "@/lib/reading-store";
import { containsWord, publicReading, readingTargets, type ReadingLesson } from "@/lib/reading";
import { resolveDataDir } from "@/lib/pairing/store";
import { getModelServiceUrlForRequest } from "@/lib/services/runtime";
import { vocabularyContext } from "@/lib/vocabulary-store";
import { generationOptions } from "@/lib/learning-generation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try { return NextResponse.json({ lessons: await listReadings(userId) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return readingError(error); }
}
export async function POST(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  let input;
  try {
    const raw = await request.text(); if (raw.length > 12000) throw new Error("请求过长。");
    input = JSON.parse(raw);
    Object.assign(input, generationOptions(input));
    if (typeof input?.topic !== "string" || !input.topic.trim() || input.topic.trim().length > 160 || !["standard", "long"].includes(input.length)) throw new Error("请填写话题，并选择长度。");
    if (!Array.isArray(input.targetWords) || input.targetWords.length > 8 || input.targetWords.some((word: unknown) => typeof word !== "string" || !/^[a-zA-Z][a-zA-Z' -]{0,79}$/.test(word))) throw new Error("最多输入 8 个英文词或短语。");
    if (typeof input.includeVocabulary !== "boolean") throw new Error("请选择是否带入生词本词汇。");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "请求无效。" }, { status: 400 }); }
  try {
    const linkedWords = input.includeVocabulary ? (await vocabularyContext(userId)).map(word => word.word) : [];
    const targetWords = readingTargets([...input.targetWords, ...linkedWords], input.includeVocabulary ? await readWords(userId) : [], input.includeVocabulary);
    const token = (await readFile(join(resolveDataDir(), "coach-admin.token"), "utf8")).trim();
    const response = await fetch(`${getModelServiceUrlForRequest(request)}/reading-generate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ topic: input.topic.trim(), level: input.level, remarks: input.remarks, length: input.length, targetWords, userId }), cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(600_000)]) });
    const value = await response.json();
    if (!response.ok) return NextResponse.json({ error: value.detail || "阅读生成失败，请检查模型设置后重试。" }, { status: response.status });
    // Python validates structure, word count and verbatim citations before this boundary.
    if (!Array.isArray(value.paragraphs) || !Array.isArray(value.questions) || value.questions.length !== 6) throw new Error("模型返回无效。");
    const lesson = await createReading(userId, { ...value, level: input.level, remarks: input.remarks } as Omit<ReadingLesson, "id">);
    return NextResponse.json({ lesson: publicReading(lesson), usedWords: targetWords.filter((word) => containsWord(lesson.paragraphs.join(" "), word)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return readingError(error, "阅读生成或保存失败，请确认模型服务已启动后重试。已有阅读记录已保留。"); }
}
