import { experimentAudio, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { transcribeExperiment } from "@/lib/experiments/providers";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { await experimentUser(request); const { audio } = await experimentAudio(request); return experimentJson(await transcribeExperiment(request, audio)); }
  catch (error) { return experimentFailure(error); }
}
