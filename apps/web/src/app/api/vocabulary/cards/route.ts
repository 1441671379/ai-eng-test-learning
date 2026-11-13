import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { addVocabulary, editVocabulary, vocabularyCards } from "@/lib/vocabulary-store";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const params = new URL(request.url).searchParams, page = Number(params.get("page") || 0), search = params.get("search") || "";
    if (!Number.isInteger(page) || page < 0 || page > 1000 || search.length > 100) throw new VocabularyError("搜索参数无效。");
    return vocabularyJson(await vocabularyCards(userId, { deckId: params.get("deck") || "all", page, search }));
  } catch (error) { return vocabularyError(error); }
}
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try { const body = await vocabularyBody(request); return vocabularyJson(await addVocabulary(userId, [body], { module: "manual", context: typeof body.example === "string" ? body.example : "" })); }
  catch (error) { return vocabularyError(error); }
}
export async function PATCH(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const body = await vocabularyBody(request);
    if (typeof body.id !== "string") throw new VocabularyError("请选择单词。");
    const changes = Object.fromEntries(["word", "meaning", "example", "phonetic", "suspended"].filter(k => k in body).map(k => [k, body[k]]));
    return vocabularyJson({ card: await editVocabulary(userId, body.id, changes) });
  } catch (error) { return vocabularyError(error); }
}
