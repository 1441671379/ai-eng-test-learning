import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { addVocabulary } from "@/lib/vocabulary-store";
import { cleanWord, VocabularyError, type VocabularySource } from "@/lib/vocabulary";
import { readReading } from "@/lib/reading-store";
import { readListening } from "@/lib/listening-store";
import { containsWord } from "@/lib/reading";
import { vocabularyExcerpt } from "@/lib/vocabulary-text";
import { readWriting } from "@/lib/writing-store";
import { WritingError } from "@/lib/writing";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const body = await vocabularyBody(request), fields = cleanWord(body), source = body.source;
    if (!source || !["reading", "listening", "speaking", "writing"].includes(source.module)) throw new VocabularyError("收藏来源无效。");
    let context = "";
    if (source.module === "reading" || source.module === "listening") {
      if (typeof source.resourceId !== "string") throw new VocabularyError("请选择对应学习材料。");
      if (source.module === "reading") context = (await readReading(userId, source.resourceId)).paragraphs.find(p => containsWord(p, fields.word)) || "";
      else {
        const lesson = await readListening(userId, source.resourceId);
        if (!lesson.attempt && !lesson.revealedAt) throw new VocabularyError("查看听力原文或完成答题后，可以收藏原文生词。");
        context = [...lesson.paragraphs, ...lesson.conversation.flatMap(t => [t.user, t.assistant])].find(p => containsWord(p, fields.word)) || "";
      }
    } else if (source.module === "writing") {
      if (typeof source.resourceId !== "string") throw new VocabularyError("请选择对应写作记录。");
      const doc = await readWriting(userId, source.resourceId);
      context = [doc.text, ...doc.versions.map(v => v.text)].flatMap(t => t.split(/\n\s*\n/)).find(p => containsWord(p, fields.word)) || "";
    } else {
      // English Learning coach history lives in the learner's browser; retain this as user-supplied context.
      if (typeof source.context === "string" && source.context.length <= 2500 && containsWord(source.context, fields.word)) context = source.context;
    }
    if (!context) throw new VocabularyError("请选择当前内容中实际出现的英文词汇。");
    context = vocabularyExcerpt(context, fields.word);
    const origin: VocabularySource = { module: source.module, context, ...(source.module === "speaking" ? { label: "口语页面收藏" } : { resourceId: source.resourceId }) };
    return vocabularyJson(await addVocabulary(userId, [{ ...fields, example: fields.example || context }], origin));
  } catch (error) {
    if (error instanceof WritingError) return vocabularyError(new VocabularyError(error.message, error.status));
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return vocabularyError(new VocabularyError("学习材料不存在。", 404));
    return vocabularyError(error);
  }
}
