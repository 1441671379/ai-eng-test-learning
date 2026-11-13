import { createExperiment, mutateExperiment, readTimeAlignmentSettings } from "@/lib/experiments/database";
import { experimentAudio, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { assessExperiment } from "@/lib/experiments/providers";
import { ExperimentError, experimentText } from "@/lib/experiments/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request), { form, audio } = await experimentAudio(request);
    const text = experimentText(form.get("text"), 500, "目标句子").replaceAll("’", "'");
    if (!/[a-z]/i.test(text)) throw new ExperimentError("请输入一段英文句子。");
    const rawActual = form.get("spoken_text");
    if (rawActual !== null && (typeof rawActual !== "string" || rawActual.length > 600)) throw new ExperimentError("实际说出的文字不能超过 600 个字符。");
    const settings = await experimentDatabase(userId, readTimeAlignmentSettings);
    const assessment = await assessExperiment(request, audio, text, settings, typeof rawActual === "string" ? rawActual.trim() : "");
    const session = await experimentDatabase(userId, db => {
      const created = createExperiment(db, "pronunciation", text);
      return mutateExperiment(db, created.id, 0, latest => { latest.assessment = assessment; });
    });
    return experimentJson({ session });
  } catch (error) { return experimentFailure(error); }
}
