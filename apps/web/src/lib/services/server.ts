import "server-only";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { isSameOrigin } from "@/lib/same-origin";

export async function serviceUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (request.method !== "GET" && !isSameOrigin(request)) return NextResponse.json({ error: "请从学习应用提交。" }, { status: 403 });
  return user.id;
}
