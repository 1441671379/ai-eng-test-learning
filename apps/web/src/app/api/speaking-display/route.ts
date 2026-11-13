import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getAppModeCookieOptions } from "@/lib/app-mode";
import { isSameOrigin } from "@/lib/same-origin";
import { isSpeakingDisplayPreferences, parseSpeakingDisplay, SPEAKING_DISPLAY_COOKIE } from "@/lib/speaking-display";

export async function PUT(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从设置页保存。" }, { status: 403 });
  const value: unknown = await request.json().catch(() => null);
  if (!isSpeakingDisplayPreferences(value)) return NextResponse.json({ error: "口语显示设置无效。" }, { status: 400 });
  const preferences = parseSpeakingDisplay(JSON.stringify(value));
  const response = NextResponse.json({ preferences });
  response.cookies.set(SPEAKING_DISPLAY_COOKIE, JSON.stringify(preferences), { ...getAppModeCookieOptions(), httpOnly: true });
  return response;
}
