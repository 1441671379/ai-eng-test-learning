import { randomUUID } from "node:crypto";
import { vocabularyUser, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { vocabularyCard } from "@/lib/vocabulary-store";
import { VocabularyError } from "@/lib/vocabulary";
import { getSpeechServiceUrlForRequest } from "@/lib/services/runtime";
import { saveLearningRecords } from "@/lib/learning-record-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await vocabularyUser(request);
  if (typeof userId !== "string") return userId;
  try {
    if (Number(request.headers.get("content-length")) > 12 * 1024 * 1024) throw new VocabularyError("录音过大，请录制较短的单词发音。", 413);
    let form: FormData;
    try { form = await request.formData(); }
    catch { throw new VocabularyError("录音请求格式无效。"); }
    const cardId = form.get("cardId"), audio = form.get("audio");
    if (typeof cardId !== "string" || !cardId || cardId.length > 200) throw new VocabularyError("请选择要练习的单词。");
    if (!(audio instanceof File) || !audio.size) throw new VocabularyError("请先录制单词发音。");
    if (audio.size > 10 * 1024 * 1024) throw new VocabularyError("录音过大，请录制较短的单词发音。", 413);
    const card = await vocabularyCard(userId, cardId);
    const upstream = new FormData();
    upstream.set("audio", audio, audio.name || "word-attempt.wav");
    // Use the authenticated learner's saved word, never a client-supplied target.
    upstream.set("text", card.word);
    const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/assess`, {
      method: "POST", body: upstream, cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new VocabularyError(response.status === 503 ? "发音模型尚未就绪，请稍后重试。" : "无法分析这段录音，请确认录到清晰的人声后重录。", response.status === 503 ? 503 : 422);
    if (!result || !Number.isFinite(result.overallScore) || result.overallScore < 0 || result.overallScore > 100 || !Array.isArray(result.phonemes) || !Array.isArray(result.highlights)) throw new Error("Invalid assessment");
    request.signal.throwIfAborted();
    let recordWarning: string | undefined;
    try {
      await saveLearningRecords(userId, [{ id: `vocabulary-pronunciation:${randomUUID()}`, module: "vocabulary", source: "vocabulary", kind: "pronunciation",
        title: `单词发音 · ${card.word}`, text: `${card.word}\n${result.summary ?? ""}\n${result.nextStep ?? ""}`.slice(0, 6000), score: result.overallScore, occurredAt: new Date().toISOString() }]);
    } catch { recordWarning = "发音评分已完成，但学习记录保存失败。"; }
    return vocabularyJson({ ...result, ...(recordWarning ? { recordWarning } : {}) });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return vocabularyError(error);
  }
}
