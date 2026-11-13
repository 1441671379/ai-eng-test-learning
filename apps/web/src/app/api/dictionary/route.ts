import { lookupDictionary, publicDictionary } from "@/lib/dictionary-store";
import { vocabularyUser, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { cleanWord } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const word = new URL(request.url).searchParams.get("word");
    if (word === null) { const reader = publicDictionary(); return vocabularyJson({ available: Boolean(reader), source: "ECDICT", count: reader?.count ?? 0, version: reader?.version ?? "" }); }
    return vocabularyJson(lookupDictionary(cleanWord({ word }).word));
  } catch (error) { return vocabularyError(error); }
}
