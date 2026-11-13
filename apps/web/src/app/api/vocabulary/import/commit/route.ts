import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { importVocabulary } from "@/lib/vocabulary-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try { const body = await vocabularyBody(request, 12_000_000); return vocabularyJson(await importVocabulary(userId, body.name, body.words)); }
  catch (error) { return vocabularyError(error); }
}
