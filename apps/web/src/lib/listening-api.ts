import "server-only";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAppSession } from "./app-session";
import { isSameOrigin } from "./same-origin";
import { resolveDataDir } from "./pairing/store";
import { getModelServiceUrlForRequest } from "./services/runtime";
export async function listeningUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (request.method !== "GET" && !isSameOrigin(request)) return NextResponse.json({ error: "请从听力页面提交。" }, { status: 403 });
  return user.id;
}
export function listeningError(error: unknown, fallback = "听力服务暂不可用，请检查本地服务后重试。") {
  const notFound = (error as NodeJS.ErrnoException)?.code === "ENOENT";
  return NextResponse.json({ error: notFound ? "听力记录不存在。" : fallback }, { status: notFound ? 404 : 503 });
}
export async function listeningModel(request: Request, userId: string, action: "generate" | "discuss", payload: Record<string, unknown>) {
  const token = (await readFile(join(resolveDataDir(), "coach-admin.token"), "utf8")).trim();
  const response = await fetch(`${getModelServiceUrlForRequest(request)}/listening-${action}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, userId }), cache: "no-store",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(action === "generate" ? 600_000 : 120_000)]),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "模型请求失败，请检查模型设置后重试。");
  return value;
}
export async function listeningBody(request: Request, limit = 5000) {
  const raw = await request.text();
  if (raw.length > limit) throw new Error("请求内容过长。");
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("请求格式无效。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求格式无效。");
  return value;
}
