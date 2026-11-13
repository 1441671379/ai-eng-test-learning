import { randomUUID } from "node:crypto";
import { globalModelProxy } from "@/lib/models/global-proxy";
import { mutateExperiment, readExperiment } from "@/lib/experiments/database";
import { experimentBody, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { conversationHistory, ExperimentError, experimentId, experimentText } from "@/lib/experiments/types";
import { replyMode } from "@/lib/experiments/coach";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request), body = await experimentBody(request), id = experimentId(body.sessionId);
    const session = await experimentDatabase(userId, db => readExperiment(db, id));
    if (session.kind !== "coach") throw new ExperimentError("请选择对话实验记录。");
    if (body.revision !== session.revision) throw new ExperimentError("记录已更新，请重新打开后继续。", 409);
    if (session.turns.length >= 40) throw new ExperimentError("本次实验已完成 40 轮，请开启新的对话。");
    const last = session.turns.at(-1), mode = replyMode(body.mode || session.replyMode || "freedom");
    if (last && !last.reply) throw new ExperimentError("请先录音或提交本轮回答，再继续下一轮。");
    const history = conversationHistory(session);
    // Keep a hidden target available so modes can switch without changing the coach's question.
    const response = await globalModelProxy(request, "coach", { topic: session.topic, action: last ? "continue" : "start", mode: "target", history });
    if (!response.ok) return response;
    const value = await response.json();
    const question = experimentText(value.turn?.coachMessage, 6000, "AI 回答");
    const suggestedReply = experimentText(value.turn?.learnerReply, 6000, "示范回答");
    const saved = await experimentDatabase(userId, db => mutateExperiment(db, id, session.revision, latest => {
      latest.replyMode = mode;
      latest.turns.push({ id: randomUUID(), question, suggestedReply, replyMode: mode, assessment: null, replyRevision: 0, reply: null, feedback: null, provider: String(value.provider || "global"), model: String(value.model || "全局模型") });
    }));
    return experimentJson({ session: saved });
  } catch (error) { return experimentFailure(error); }
}
