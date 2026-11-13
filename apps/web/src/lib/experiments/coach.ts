import { ExperimentError, type ExperimentSession, type ExperimentReplyMode } from "./types";
import type { PronunciationAssessment } from "../speech/types";
export function replyMode(value: unknown): ExperimentReplyMode {
  if (value !== "target" && value !== "freedom") throw new ExperimentError("请选择 Targeted 或 Freedom 模式。");
  return value;
}
export function activeCoachTurn(session: ExperimentSession, turnId: string) {
  const turn = session.turns.at(-1);
  if (session.kind !== "coach" || !turn || turn.id !== turnId) throw new ExperimentError("只能修改当前一轮回答，请重新打开实验记录。", 409);
  return turn;
}
export function saveCoachReply(session: ExperimentSession, turnId: string, mode: ExperimentReplyMode, reply: string, assessment: PronunciationAssessment | null, assessmentError = "") {
  const turn = activeCoachTurn(session, turnId);
  turn.reply = reply; turn.replyMode = mode; turn.assessment = assessment; turn.assessmentError = assessmentError;
  turn.feedback = null; turn.replyRevision = (turn.replyRevision || 0) + 1; session.replyMode = mode;
}
export function resetCoachReply(session: ExperimentSession, turnId: string) {
  const turn = activeCoachTurn(session, turnId);
  turn.reply = null; turn.assessment = null; turn.assessmentError = ""; turn.feedback = null;
  turn.replyRevision = (turn.replyRevision || 0) + 1;
}
