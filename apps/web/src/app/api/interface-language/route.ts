import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { isSameOrigin } from "@/lib/same-origin";
import { getAppModeCookieOptions } from "@/lib/app-mode";
import { LOCALE_COOKIE } from "@/lib/i18n";
export async function PUT(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从设置页保存。" }, { status: 403 });
  const value = await request.json().catch(() => null);
  if (!["en", "zh-CN"].includes(value?.locale)) return NextResponse.json({ error: "请选择中文或英文。" }, { status: 400 });
  const response = NextResponse.json({ locale: value.locale });
  response.cookies.set(LOCALE_COOKIE, value.locale, { ...getAppModeCookieOptions(), httpOnly: true });
  return response;
}
