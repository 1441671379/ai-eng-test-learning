import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { listLearningRecords, saveLearningRecords } from "@/lib/learning-record-store";
import { validateLearningRecord } from "@/lib/learning-records";
import { isSameOrigin } from "@/lib/same-origin";
export const runtime = "nodejs";
export async function GET() {
  const session = await getAppSession();
  if (!session.user) return NextResponse.json({ error: "请先选择用户。" }, { status: 401 });
  try { return NextResponse.json({ records: await listLearningRecords(session.user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "读取学习记录失败，已有记录已保留。" }, { status: 503 }); }
}
export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session.user) return NextResponse.json({ error: "请先选择用户。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从应用内保存。" }, { status: 403 });
  let records;
  try {
    const raw = await request.text();
    if (raw.length > 800_000) return NextResponse.json({ error: "记录过大。" }, { status: 413 });
    const body = JSON.parse(raw);
    if (!Array.isArray(body.records) || !body.records.length || body.records.length > 100) throw new Error("一次可保存 1–100 条记录。");
    records = body.records.map(validateLearningRecord);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "记录无效。" }, { status: 400 }); }
  try { await saveLearningRecords(session.user.id, records); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "保存学习记录失败，请重试。" }, { status: 503 }); }
}
