import "server-only";
import { NextResponse } from "next/server";
import { getAppSession } from "./app-session";
import { isSameOrigin } from "./same-origin";
import { WritingError } from "./writing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { getModelServiceUrlForRequest } from "./services/runtime";
export async function writingUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (request.method !== "GET" && !isSameOrigin(request)) return NextResponse.json({ error: "请从写作页面提交。" }, { status: 403 });
  return user.id;
}
export async function writingBody(request: Request) {
  const raw = await request.text(); if (raw.length > 24000) throw new WritingError("写作请求过长。", 413);
  try { const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new WritingError("写作请求格式无效。"); }
}
export function writingJson(value: unknown) { return NextResponse.json(value, { headers: { "Cache-Control": "no-store" } }); }
export function writingError(error: unknown) {
  return NextResponse.json({ error: error instanceof WritingError ? error.message : "写作服务暂不可用，草稿和已有批改已保留，请稍后重试。" }, { status: error instanceof WritingError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export async function writingModel(request: Request, userId: string, action: "review" | "prompt", payload: unknown) {
  const token = (await readFile(join(resolveDataDir(), "coach-admin.token"), "utf8")).trim();
  const response = await fetch(`${getModelServiceUrlForRequest(request)}/writing-${action}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...(payload as object), userId }), cache: "no-store", signal: AbortSignal.timeout(480_000),
  });
  const value = await response.json();
  if (!response.ok) throw new WritingError(typeof value.detail === "string" ? value.detail : "写作批改失败，请检查全局模型设置后重试。", response.status);
  return value;
}
