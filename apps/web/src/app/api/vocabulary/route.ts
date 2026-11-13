import { vocabularyUser, vocabularyBody, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { vocabularySnapshot, setVocabularySettings, setVocabularyAudioSettings } from "@/lib/vocabulary-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try { return vocabularyJson(await vocabularySnapshot(userId, new URL(request.url).searchParams.get("deck") || "all")); }
  catch (error) { return vocabularyError(error); }
}
export async function PATCH(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try { const body = await vocabularyBody(request); return body.audio !== undefined ? vocabularyJson({ audio: await setVocabularyAudioSettings(userId, body.audio) }) : vocabularyJson({ settings: await setVocabularySettings(userId, body.dailyNew, body.retention) }); }
  catch (error) { return vocabularyError(error); }
}
