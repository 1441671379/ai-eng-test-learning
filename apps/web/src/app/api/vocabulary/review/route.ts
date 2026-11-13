import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { reviewVocabulary } from "@/lib/vocabulary-store";
import { saveLearningRecords } from "@/lib/learning-record-store";
import { ratingLabels } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const review = await reviewVocabulary(userId, await vocabularyBody(request));
    let recordWarning;
    try { await saveLearningRecords(userId, [{ id: `vocabulary:${review.id}`, module: "vocabulary", source: "vocabulary", kind: "vocabulary_review", title: `单词复习 · ${review.word}`,
      text: `${ratingLabels[review.rating as keyof typeof ratingLabels]} · 下次复习 ${new Date(review.due).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`, score: null, occurredAt: review.reviewedAt }]); }
    catch { recordWarning = "复习进度已保存，学习记录同步失败。可重试同步。"; }
    return vocabularyJson({ review, recordWarning });
  } catch (error) { return vocabularyError(error); }
}
