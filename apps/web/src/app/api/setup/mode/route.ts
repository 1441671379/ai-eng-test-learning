import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { APP_MODE_COOKIE, getAppModeCookieOptions } from "@/lib/app-mode";
import { createDefaultLocalProfile, readLocalProfileFromCookies, writeLocalProfile } from "@/lib/local-profile";
import { isSameOrigin } from "@/lib/same-origin";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从本机学习页面提交。" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.mode !== "local") return NextResponse.json({ error: "本应用仅使用本地学习空间。" }, { status: 400 });
  const next = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") && !body.next.includes("\\") ? body.next : "/dashboard";
  const response = NextResponse.json({ ok: true, redirectTo: next });
  response.cookies.set(APP_MODE_COOKIE, "local", getAppModeCookieOptions());
  writeLocalProfile(response.cookies, readLocalProfileFromCookies(await cookies()) ?? createDefaultLocalProfile());
  return response;
}
