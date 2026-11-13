import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { isSameOrigin } from "@/lib/same-origin";
import { ensureSharedServices, localDesktopRoot } from "@/lib/services/lifecycle";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session.user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (!isSameOrigin(request) || session.mode !== "local" || !["127.0.0.1", "localhost"].includes(new URL(request.url).hostname)) return NextResponse.json({ error: "请从本机学习应用连接。" }, { status: 403 });
  if (!localDesktopRoot()) return NextResponse.json({ error: "本地后台自动启动暂不可用，请检查应用启动配置。" }, { status: 503 });
  try { await ensureSharedServices(); return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "后台服务启动失败。" }, { status: 503 }); }
}

