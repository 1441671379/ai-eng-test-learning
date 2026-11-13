import { vocabularyUser, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { vocabularyContext } from "@/lib/vocabulary-store";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const params = new URL(request.url).searchParams, targetModule = params.get("module") || "listening", limit = Number(params.get("limit") || 8);
    if (!["listening", "speaking", "reading"].includes(targetModule) || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new VocabularyError("词汇联动参数无效。");
    return vocabularyJson({ version: 1, module: targetModule, words: await vocabularyContext(userId, limit) });
  } catch (error) { return vocabularyError(error); }
}
