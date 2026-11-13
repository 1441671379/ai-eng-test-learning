import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import { getLocalProfile, writeLocalProfile } from "@/lib/local-profile";
import { isSameOrigin } from "@/lib/same-origin";
export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session.user) return NextResponse.json({ error: "请先选择用户。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从设置页保存。" }, { status: 403 });
  const profile = await getLocalProfile();
  if (session.mode !== "local" || !profile || profile.id !== session.user.id) return NextResponse.json({ error: "请在本机浏览器的本地用户设置中修改。" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.displayName !== "string" || !body.displayName.trim() || body.displayName.trim().length > 60) return NextResponse.json({ error: "名称需要 1–60 个字符。" }, { status: 400 });
  writeLocalProfile(await cookies(), { ...profile, displayName: body.displayName.trim() });
  return NextResponse.json({ ok: true });
}
