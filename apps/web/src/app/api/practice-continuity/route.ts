import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { isSameOrigin } from "@/lib/same-origin";
import { isPracticeModule } from "@/lib/practice-continuity";
import { readPracticeSnapshot, savePracticeEntry } from "@/lib/practice-continuity-store";
export const runtime = "nodejs";
export async function GET() {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  try { return NextResponse.json({ modules: readPracticeSnapshot(user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "暂时无法读取练习进度，原记录已保留。" }, { status: 503 }); }
}
// POST also accepts navigator.sendBeacon when a window is being closed.
export async function POST(request: Request) {
  const { user } = await getAppSession();
  if (!user) return NextResponse.json({ error: "请先进入学习空间。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从学习界面保存进度。" }, { status: 403 });
  let input;
  try {
    const text = await request.text(); if (text.length > 60000) throw new Error();
    input = JSON.parse(text); if (!isPracticeModule(input.module)) throw new Error();
    // Validate before entering the store so malformed input is a 400, not a storage error.
    const { validatePracticeEntry } = await import("@/lib/practice-continuity");
    input.entry = validatePracticeEntry(input.module, input.entry);
  } catch { return NextResponse.json({ error: "练习进度格式无效。" }, { status: 400 }); }
  try { savePracticeEntry(user.id, input.module, input.entry); return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "练习进度保存失败，请重试。" }, { status: 503 }); }
}
