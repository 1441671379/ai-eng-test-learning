import { mutateExperiment, readExperiment, readTimeAlignmentSettings } from "@/lib/experiments/database";
import { experimentAudio, experimentBody, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { ExperimentError, experimentId, experimentText } from "@/lib/experiments/types";
import { activeCoachTurn, replyMode, resetCoachReply, saveCoachReply } from "@/lib/experiments/coach";
import { assessCoachExperiment, transcribeExperiment } from "@/lib/experiments/providers";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request);
    const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
    const upload = multipart ? await experimentAudio(request) : null;
    const body = upload ? Object.fromEntries(upload.form.entries()) : await experimentBody(request);
    const id = experimentId(body.sessionId), turnId = experimentId(body.turnId);
    const session = await experimentDatabase(userId, db => readExperiment(db, id));
    const revision = typeof body.revision === "string" ? Number(body.revision) : body.revision;
    if (revision !== session.revision) throw new ExperimentError("这段对话已更新，请重新打开后继续。", 409);
    const turn = activeCoachTurn(session, turnId);
    if (body.action === "retry") {
      return experimentJson({ session: await experimentDatabase(userId, db => mutateExperiment(db, id, session.revision, latest => resetCoachReply(latest, turnId))) });
    }
    const mode = replyMode(body.mode);
    if (!upload && mode !== "freedom") throw new ExperimentError("Targeted 模式需要实际录音进行发音检查。");
    const text = mode === "target" ? experimentText(turn.suggestedReply, 6000, "目标回答") :
      body.reply ? experimentText(body.reply, 6000, "英文回答") : upload ? (await transcribeExperiment(request, upload.audio)).transcript : experimentText(body.reply, 6000, "英文回答");
    let assessment = null, assessmentError = "";
    if (upload) {
      try {
        const settings = await experimentDatabase(userId, readTimeAlignmentSettings);
        // Freedom's text has already been transcribed (or confirmed by the
        // learner). Reuse it for timing; Targeted must identify actual speech.
        assessment = await assessCoachExperiment(request, upload.audio, text, settings, mode === "freedom" ? text : "");
      }
      catch (error) {
        if (mode === "target") throw error;
        assessmentError = "回答已识别并保存，本轮发音评分暂不可用，可重试。";
      }
    }
    const saved = await experimentDatabase(userId, db => mutateExperiment(db, id, session.revision, latest => saveCoachReply(latest, turnId, mode, text, assessment, assessmentError)));
    return experimentJson({ session: saved });
  } catch (error) { return experimentFailure(error); }
}
