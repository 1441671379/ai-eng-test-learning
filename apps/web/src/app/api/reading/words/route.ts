import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readingUser, readingError } from "@/lib/reading-api";
import { readReading, readWords, updateWords } from "@/lib/reading-store";
import { containsWord } from "@/lib/reading";
import { addVocabulary, editVocabulary, exportVocabulary } from "@/lib/vocabulary-store";
import { cleanWord } from "@/lib/vocabulary";
import { vocabularyExcerpt } from "@/lib/vocabulary-text";
export async function GET(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try {
    const [words, cards] = await Promise.all([readWords(userId), exportVocabulary(userId)]);
    return NextResponse.json({ words: words.map(word => ({ ...word, mastered: cards.find(card => card.word.toLowerCase() === word.word.toLowerCase())?.suspended ?? word.mastered })) }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return readingError(error); }
}
export async function POST(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try {
    const raw = await request.text(); if (raw.length > 2000) throw new Error("请求过长。");
    const body = JSON.parse(raw);
    if (typeof body?.word !== "string" || typeof body.lessonId !== "string") throw new Error("请选择英文单词或短语。");
    const { word } = cleanWord(body);
    const lesson = await readReading(userId, body.lessonId);
    const paragraph = lesson.paragraphs.find((text) => containsWord(text, word));
    if (!paragraph) throw new Error("请选择当前文章中的词汇。");
    const context = vocabularyExcerpt(paragraph, word);
    const collected = await addVocabulary(userId, [{ word, example: context }], { module: "reading", context, resourceId: lesson.id });
    if (collected.card?.suspended) await editVocabulary(userId, collected.card.id, { suspended: false });
    const words = await updateWords(userId, (previous) => {
      const existing = previous.find((entry) => entry.word.toLowerCase() === word.toLowerCase());
      if (existing) return [{ ...existing, mastered: false }, ...previous.filter((entry) => entry.id !== existing.id)];
      return [{ id: randomUUID(), word, context, lessonId: lesson.id, createdAt: new Date().toISOString(), mastered: false }, ...previous];
    });
    return NextResponse.json({ words });
  } catch (error) { return (error as NodeJS.ErrnoException)?.code ? readingError(error) : NextResponse.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  const userId = await readingUser(request); if (typeof userId !== "string") return userId;
  try {
    const raw = await request.text(); if (raw.length > 1000) throw new Error("请求过长。");
    const body = JSON.parse(raw);
    if (typeof body?.id !== "string" || typeof body.mastered !== "boolean") throw new Error("词汇状态无效。");
    const words = await updateWords(userId, (previous) => {
      if (!previous.some((entry) => entry.id === body.id)) throw new Error("词汇不存在。");
      return previous.map((entry) => entry.id === body.id ? { ...entry, mastered: body.mastered } : entry);
    });
    const changed = words.find(word => word.id === body.id)!;
    const card = (await exportVocabulary(userId)).find(card => card.word.toLowerCase() === changed.word.toLowerCase());
    if (card) await editVocabulary(userId, card.id, { suspended: changed.mastered });
    return NextResponse.json({ words });
  } catch (error) { return (error as NodeJS.ErrnoException)?.code ? readingError(error) : NextResponse.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 400 }); }
}
