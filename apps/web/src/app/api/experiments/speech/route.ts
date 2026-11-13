import { experimentBody, experimentFailure, experimentUser } from "@/lib/experiments/server";
import { speakExperiment } from "@/lib/experiments/providers";
import { experimentText } from "@/lib/experiments/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { await experimentUser(request); const body = await experimentBody(request); return await speakExperiment(request, experimentText(body.text, 6000, "朗读文本")); }
  catch (error) { return experimentFailure(error); }
}
