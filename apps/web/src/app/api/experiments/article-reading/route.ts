import { randomUUID } from "node:crypto";
import { createExperiment, mutateExperiment, readExperiment, readTimeAlignmentSettings } from "@/lib/experiments/database";
import { articleSegment, confirmArticleOmission, createArticleReading, requireArticle, saveArticleAttempt, saveArticleFailure } from "@/lib/experiments/article-reading";
import { AssessmentUnavailableError } from "@/lib/experiments/speaking-evaluation";
import { experimentAudio, experimentBody, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { assessExperiment } from "@/lib/experiments/providers";
import { ExperimentError, experimentId } from "@/lib/experiments/types";
import { readReading } from "@/lib/reading-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request), body = await experimentBody(request);
    let text = body.text, title = body.title, lessonId: string | null = null;
    if (body.lessonId) {
      lessonId = experimentId(body.lessonId);
      const lesson = await readReading(userId, lessonId).catch(() => { throw new ExperimentError("阅读材料不存在，请重新选择。", 404); });
      text = lesson.paragraphs.join("\n\n"); title = lesson.title;
    }
    return experimentJson({ session: await experimentDatabase(userId, db => {
      const article = createArticleReading(text, title, readTimeAlignmentSettings(db), lessonId);
      return createExperiment(db, "article-reading", article.title, session => { session.articleReading = article; });
    }) });
  } catch (error) { return experimentFailure(error); }
}
export async function PUT(request: Request) {
  try {
    const userId = await experimentUser(request), { form, audio } = await experimentAudio(request);
    const id = experimentId(form.get("sessionId")), index = integer(form.get("segmentIndex")), revision = integer(form.get("revision"));
    const article = await experimentDatabase(userId, db => requireArticle(readExperiment(db, id))), segment = articleSegment(article, index, revision);
    const actual = form.get("spoken_text");
    if (actual !== null && (typeof actual !== "string" || actual.length > 600)) throw new ExperimentError("实际说出的文字不能超过 600 个字符。");
    let assessment;
    try { assessment = await assessExperiment(request, audio, segment.text.trim(), article.settings, typeof actual === "string" ? actual.trim() : ""); }
    catch (error) {
      const alignment = error instanceof AssessmentUnavailableError ? error.alignment : undefined;
      const reason = error instanceof ExperimentError ? error.message : "本次评分服务暂不可用，请稍后重试。";
      const session = await experimentDatabase(userId, db => mutateExperiment(db, id, null, latest => {
        saveArticleFailure(requireArticle(latest), index, revision, { id: randomUUID(), assessedAt: new Date().toISOString(), status: "failed",
          transcript: alignment?.transcript || (typeof actual === "string" ? actual.trim() : ""), transcriptSource: alignment?.transcriptSource, error: reason });
        latest.revision++;
      }));
      return experimentJson({ session, error: reason, attemptStatus: "failed" });
    }
    const attempt = { id: randomUUID(), assessedAt: new Date().toISOString(), assessment, confirmedOmissions: [] };
    const session = await experimentDatabase(userId, db => mutateExperiment(db, id, null, latest => {
      saveArticleAttempt(requireArticle(latest), index, revision, attempt); latest.revision++;
    }));
    return experimentJson({ session });
  } catch (error) { return experimentFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    const userId = await experimentUser(request), body = await experimentBody(request), id = experimentId(body.sessionId);
    const session = await experimentDatabase(userId, db => mutateExperiment(db, id, null, latest => {
      confirmArticleOmission(requireArticle(latest), body.segmentIndex as number, body.revision as number, body.wordIndex, body.confirmed); latest.revision++;
    }));
    return experimentJson({ session });
  } catch (error) { return experimentFailure(error); }
}
function integer(input: FormDataEntryValue | null): number {
  if (typeof input !== "string" || !/^\d{1,7}$/.test(input)) throw new ExperimentError("文章分段或版本编号无效。");
  return Number(input);
}
