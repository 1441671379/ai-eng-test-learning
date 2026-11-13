import { vocabularyUser, vocabularyError } from "@/lib/vocabulary-api";
import { exportVocabulary } from "@/lib/vocabulary-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const escape = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const cards = await exportVocabulary(userId);
    const text = ["#separator:tab", "#html:false", "#columns:Word\tMeaning\tExample\tPhonetic", ...cards.map(c => [c.word, c.meaning, c.example, c.phonetic].map(escape).join("\t"))].join("\n");
    return new Response(text, { headers: { "Content-Type": "text/tab-separated-values; charset=utf-8", "Content-Disposition": 'attachment; filename="my-vocabulary.tsv"', "Cache-Control": "no-store" } });
  } catch (error) { return vocabularyError(error); }
}
