import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { localWordbooks, startLocalWordbook } from "@/lib/vocabulary-books";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try { return vocabularyJson({ books: await localWordbooks(userId) }); }
  catch (error) { return vocabularyError(error); }
}
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const body = await vocabularyBody(request);
    if (typeof body.id !== "string") throw new VocabularyError("请选择本地词书。");
    return vocabularyJson(await startLocalWordbook(userId, body.id));
  } catch (error) { return vocabularyError(error); }
}
