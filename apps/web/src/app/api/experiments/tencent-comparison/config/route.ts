import { experimentBody, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { publicTencentSettings, resetTencentSettings, saveTencentSettings } from "@/lib/experiments/tencent-comparison/credentials";
import { resolveDataDir } from "@/lib/pairing/store";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const userId = await experimentUser(request); return experimentJson({ config: await publicTencentSettings(resolveDataDir(), userId) }); }
  catch (error) { return experimentFailure(error); }
}
export async function PUT(request: Request) {
  try { const userId = await experimentUser(request), body = await experimentBody(request); return experimentJson({ config: await saveTencentSettings(resolveDataDir(), userId, body) }); }
  catch (error) { return experimentFailure(error); }
}
export async function DELETE(request: Request) {
  try { const userId = await experimentUser(request); return experimentJson({ config: await resetTencentSettings(resolveDataDir(), userId) }); }
  catch (error) { return experimentFailure(error); }
}
