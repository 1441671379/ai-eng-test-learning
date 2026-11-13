import "server-only";
import { getSpeechServiceUrlForRequest } from "../services/runtime";
import { ExperimentError } from "./types";
import { referenceSpeech } from "../speech/reference";
import { analyzeTimeAlignment } from "./time-alignment";
import { coachTimeAssessment, sentenceTimeAssessment } from "./speaking-evaluation";
import type { TimeAlignmentSettings } from "./time-alignment-judgement";
import type { PronunciationAssessment } from "../speech/types";

async function engineJson(response: Response, fallback: string) {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ExperimentError(fallback, response.status >= 500 ? 503 : 422);
  return value;
}
export async function transcribeExperiment(request: Request, audio: File) {
  const body = new FormData(); body.set("audio", audio, audio.name || "reply.webm");
  const response = await fetch(`${getSpeechServiceUrlForRequest(request)}/transcribe`, { method: "POST", body, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
  const value = await engineJson(response, "语音识别暂不可用，可以先输入英文回答。");
  if (typeof value?.transcript !== "string") throw new ExperimentError("语音识别结果无效。", 502);
  if (!value.transcript.trim()) throw new ExperimentError("没有识别到清晰的英文，请重录或直接输入。");
  return { transcript: value.transcript.trim(), engine: "whisper" };
}
export async function assessExperiment(request: Request, audio: File, text: string, settings: TimeAlignmentSettings, actualText = "") {
  return sentenceTimeAssessment(await analyzeTimeAlignment(request, audio, text, actualText), settings);
}
export async function assessCoachExperiment(request: Request, audio: File, text: string, settings: TimeAlignmentSettings, actualText = ""): Promise<PronunciationAssessment> {
  return coachTimeAssessment(await analyzeTimeAlignment(request, audio, text, actualText), settings);
}
export async function speakExperiment(request: Request, text: string) {
  try { return await referenceSpeech(request, text); }
  catch { throw new ExperimentError("本地语音生成失败，请稍后重试。", 503); }
}
