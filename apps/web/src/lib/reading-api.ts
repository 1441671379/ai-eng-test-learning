import "server-only";
import { getAppSession } from "./app-session";
import { isSameOrigin } from "./same-origin";
import { NextResponse } from "next/server";
export async function readingUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (request.method !== "GET" && !isSameOrigin(request)) return NextResponse.json({ error: "请从阅读页面提交。" }, { status: 403 });
  return user.id;
}
export function readingError(error: unknown, fallback = "读取阅读数据失败，请重试。") {
  const notFound = (error as NodeJS.ErrnoException)?.code === "ENOENT";
  return NextResponse.json({ error: notFound ? "阅读记录不存在。" : fallback }, { status: notFound ? 404 : 503 });
}
