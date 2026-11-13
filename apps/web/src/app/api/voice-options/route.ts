import { NextResponse } from "next/server";
import { getTtsVoiceOptions, setTtsVoice } from "@/lib/tts-voices";
import { getAppSession } from "@/lib/app-session";
import { isSameOrigin } from "@/lib/same-origin";

export async function GET() {
  try {
    if (!(await getAppSession()).user) return NextResponse.json({ error: "请先选择用户。" }, { status: 401 });
    return NextResponse.json(await getTtsVoiceOptions(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "暂时无法读取语音配置，请确认服务已启动。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await getAppSession()).user) return NextResponse.json({ error: "请先选择用户。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请从设置页保存。" }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    return NextResponse.json(await setTtsVoice(body?.voiceId, body?.roleVoices), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TypeError ? error.message : "保存音色失败，请重试。" }, { status: error instanceof TypeError ? 400 : 503 });
  }
}
