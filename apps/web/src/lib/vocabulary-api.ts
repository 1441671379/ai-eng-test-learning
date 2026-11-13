import "server-only";
import { NextResponse } from "next/server";
import { getAppSession } from "./app-session";
import { isSameOrigin } from "./same-origin";
import { VocabularyError } from "./vocabulary";
export async function vocabularyUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (request.method !== "GET" && !isSameOrigin(request)) return NextResponse.json({ error: "请从学习空间提交。" }, { status: 403 });
  return user.id;
}
export function vocabularyError(error: unknown) {
  return NextResponse.json({ error: error instanceof VocabularyError ? error.message : "单词服务暂不可用，请重试。已有词库已保留。" }, { status: error instanceof VocabularyError ? error.status : 503 });
}
export async function vocabularyBody(request: Request, limit = 12000) {
  const raw = await request.text();
  if (raw.length > limit) throw new VocabularyError("请求内容过长。", 413);
  try { const body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body; }
  catch { throw new VocabularyError("请求格式无效。"); }
}
export const vocabularyJson = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
