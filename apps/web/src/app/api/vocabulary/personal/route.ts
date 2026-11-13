import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { markPersonalVocabulary } from "@/lib/vocabulary-store";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const body = await vocabularyBody(request);
    if (typeof body.cardId !== "string" || typeof body.collect !== "boolean") throw new VocabularyError("生词库操作无效。");
    return vocabularyJson({ card: await markPersonalVocabulary(userId, body.cardId, body.collect) });
  } catch (error) { return vocabularyError(error); }
}
