import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { getModelServiceUrlForRequest } from "./services/runtime";
import { VocabularyError } from "./vocabulary";
export async function vocabularyCoach(request: Request, path: "vocabulary-import-preview" | "vocabulary-explain" | "phrase-learning", body: FormData | Record<string, unknown>) {
  const token = (await readFile(join(resolveDataDir(), "coach-admin.token"), "utf8")).trim();
  const response = await fetch(`${getModelServiceUrlForRequest(request)}/${path}`, { method: "POST", headers: {
    Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
  }, body: body instanceof FormData ? body : JSON.stringify(body), cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
  const value = await response.json();
  if (!response.ok) throw new VocabularyError(typeof value.detail === "string" ? value.detail : "单词服务请求失败。", response.status);
  return value;
}
