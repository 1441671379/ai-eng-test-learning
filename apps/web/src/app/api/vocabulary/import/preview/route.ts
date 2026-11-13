import { vocabularyUser, vocabularyError, vocabularyJson } from "@/lib/vocabulary-api";
import { vocabularyCoach } from "@/lib/vocabulary-coach";
import { VocabularyError } from "@/lib/vocabulary";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    if (Number(request.headers.get("content-length")) > 513 * 1024 * 1024) throw new VocabularyError("文件超过 512 MB。", 413);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 512 * 1024 * 1024) throw new VocabularyError("请选择不超过 512 MB 的词书文件。");
    const form = new FormData(); form.set("file", file);
    return vocabularyJson(await vocabularyCoach(request, "vocabulary-import-preview", form));
  } catch (error) { return vocabularyError(error); }
}
