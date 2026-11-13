import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { vocabularyCoach } from "@/lib/vocabulary-coach";
import { editVocabulary, exportVocabulary } from "@/lib/vocabulary-store";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const body = await vocabularyBody(request), card = (await exportVocabulary(userId)).find(c => c.id === body.cardId);
    if (!card) throw new VocabularyError("单词不存在。", 404);
    const result = await vocabularyCoach(request, "vocabulary-explain", { userId, word: card.word, context: card.example || card.sources.find(s => s.context)?.context || "" });
    return vocabularyJson({ card: await editVocabulary(userId, card.id, { meaning: result.meaning, example: card.example || result.example }, card.revision) });
  } catch (error) { return vocabularyError(error); }
}
