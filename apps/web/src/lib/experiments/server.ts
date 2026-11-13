import "server-only";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getAppSession } from "../app-session";
import { isSameOrigin } from "../same-origin";
import { resolveDataDir } from "../pairing/store";
import { openExperimentDatabase } from "./database";
import { ExperimentError } from "./types";

export async function experimentUser(request: Request) {
  const { user } = await getAppSession();
  if (!user) throw new ExperimentError("请先进入学习空间。", 401);
  if (request.method !== "GET" && !isSameOrigin(request)) throw new ExperimentError("请从实验页面提交。", 403);
  return user.id;
}
export async function experimentDatabase<T>(userId: string, run: (db: ReturnType<typeof openExperimentDatabase>) => T): Promise<T> {
  const directory = join(resolveDataDir(), "experiments"); await mkdir(directory, { recursive: true });
  const db = openExperimentDatabase(join(directory, createHash("sha256").update(userId).digest("hex") + ".sqlite"));
  try { return run(db); } finally { db.close(); }
}
export function experimentFailure(error: unknown) {
  return Response.json({ error: error instanceof ExperimentError ? error.message : "实验服务暂不可用，请重试。" },
    { status: error instanceof ExperimentError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export function experimentJson(value: unknown) { return Response.json(value, { headers: { "Cache-Control": "no-store" } }); }
export async function experimentBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 20_000) throw new ExperimentError("请求内容过长。", 413);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ExperimentError("请求格式无效。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExperimentError("请求格式无效。");
  return value as Record<string, unknown>;
}
export async function experimentAudio(request: Request) {
  const form = await request.formData(), audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size || audio.size > 25 * 1024 * 1024) throw new ExperimentError("请选择不超过 25 MB 的录音文件。");
  if (!/^(audio\/|video\/webm)/.test(audio.type)) throw new ExperimentError("请选择 WAV、WebM、MP3 等音频文件。");
  return { form, audio };
}
