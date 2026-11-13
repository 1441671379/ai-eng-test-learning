import { proxyCoachFeedback } from "@/lib/models/feedback-proxy";
import { mutateExperiment, readExperiment } from "@/lib/experiments/database";
import { experimentBody, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { conversationHistory, ExperimentError, experimentId } from "@/lib/experiments/types";
import type { CoachFeedback } from "@/lib/models/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request), body = await experimentBody(request);
    const id = experimentId(body.sessionId), turnId = experimentId(body.turnId);
    const session = await experimentDatabase(userId, db => readExperiment(db, id));
    const index = session.turns.findIndex(turn => turn.id === turnId), turn = session.turns[index];
    if (session.kind !== "coach" || !turn?.reply) throw new ExperimentError("请先完成这一轮回答。");
    const upstream = new Request(request.url, { method: "POST", headers: request.headers, signal: request.signal,
      body: JSON.stringify({ topic: session.topic, mode: turn.replyMode || "freedom", coachMessage: turn.question, reply: turn.reply, history: conversationHistory({ ...session, turns: session.turns.slice(0, index) }).slice(-8) }) });
    const response = await proxyCoachFeedback(upstream, "feedback");
    if (!response.ok) return response;
    const value = await response.json() as { enabled?: boolean; feedback?: CoachFeedback };
    if (value.enabled === false) return experimentJson({ enabled: false });
    if (!value.feedback) throw new ExperimentError("模型未返回辅导建议，请重试。", 502);
    await experimentDatabase(userId, db => mutateExperiment(db, id, null, latest => {
      const target = latest.turns.find(item => item.id === turnId);
      if (!target || target.reply !== turn.reply || target.replyRevision !== turn.replyRevision) throw new ExperimentError("回答已变化，请重新生成建议。", 409);
      target.feedback = value.feedback!;
    }));
    return experimentJson({ enabled: true, feedback: value.feedback });
  } catch (error) { return experimentFailure(error); }
}
