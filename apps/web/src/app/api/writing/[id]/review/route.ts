import { writingUser, writingBody, writingJson, writingError, writingModel } from "@/lib/writing-api";
import { findWritingVersion, readWriting, saveWritingVersion } from "@/lib/writing-store";
import { isWritingId, WritingError, writingWordCount, type WritingVersion, type WritingReview } from "@/lib/writing";
import { saveLearningRecords } from "@/lib/learning-record-store";
export const runtime = "nodejs";
const scope = globalThis as typeof globalThis & { writingJobs?: Map<string, { fingerprint: string; task: Promise<WritingVersion> }> };
const jobs = scope.writingJobs ??= new Map();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await writingUser(request); if (typeof user !== "string") return user;
  try {
    const id = (await context.params).id, body = await writingBody(request);
    if (!isWritingId(body.requestId) || !Number.isSafeInteger(body.draftRevision) || typeof body.assisted !== "boolean" || !(body.parentVersionId === null || isWritingId(body.parentVersionId))) throw new WritingError("批改请求无效。");
    const fingerprint = JSON.stringify([body.draftRevision, body.assisted, body.parentVersionId]);
    let version = await findWritingVersion(user, id, body.requestId);
    if (version && JSON.stringify([version.draftRevision, version.assisted, version.parentVersionId]) !== fingerprint) throw new WritingError("该提交编号已经用于其他版本，请重新提交。", 409);
    if (!version) {
      const key = `${user}:${id}:${body.requestId}`;
      let job = jobs.get(key);
      if (job && job.fingerprint !== fingerprint) throw new WritingError("该提交编号正在批改其他版本。", 409);
      if (!job) {
        const snapshot = await readWriting(user, id);
        const completed = snapshot.versions.find(v => v.requestId === body.requestId);
        if (completed) {
          if (JSON.stringify([completed.draftRevision, completed.assisted, completed.parentVersionId]) !== fingerprint) throw new WritingError("该提交编号已经用于其他版本。", 409);
          job = { fingerprint, task: Promise.resolve(completed) };
        } else {
          if (snapshot.revision !== body.draftRevision) throw new WritingError("草稿已更新，请保存后重新提交。", 409);
          if (writingWordCount(snapshot.text) < 5) throw new WritingError("请先写至少 5 个英文词再提交批改。");
          if (body.parentVersionId && !snapshot.versions.some(v => v.id === body.parentVersionId)) throw new WritingError("原稿版本不存在。");
        }
        // Recheck after the asynchronous read: another identical request may
        // already have installed its job while this request was awaiting disk.
        job ??= jobs.get(key);
        if (!job) {
          const task = (async () => {
            const review = await writingModel(request, user, "review", { mode: snapshot.mode, prompt: snapshot.prompt, text: snapshot.text }) as WritingReview;
            if (!Array.isArray(review.criteria) || review.criteria.length !== 4 || !Array.isArray(review.corrections) || !review.model) throw new Error("Invalid writing review");
            return saveWritingVersion(user, snapshot, body.requestId, body.assisted, body.parentVersionId, review);
          })();
          job = { fingerprint, task }; jobs.set(key, job);
        }
      }
      if (job.fingerprint !== fingerprint) throw new WritingError("该提交编号正在批改其他版本。", 409);
      try { version = await job.task; } finally { if (jobs.get(key) === job) jobs.delete(key); }
    }
    if (!version) throw new Error("Writing version was not saved");
    let recordWarning = "";
    try {
      await saveLearningRecords(user, [{ id: `writing:${version.id}`, module: "writing", source: "writing", kind: "writing_review",
        title: `${version.title || "写作练习"} · 第 ${version.number} 稿`, text: `${version.assisted ? "使用建议后的修改稿" : "自主写作"}\n${version.review.summary}`, score: version.review.band, occurredAt: version.submittedAt, resourceId: id }]);
    } catch { recordWarning = "批改已保存，但统一学习记录同步失败。点击重试批改会同步同一记录，不会重复记次。"; }
    return writingJson({ version, document: await readWriting(user, id), recordWarning });
  } catch (error) { return writingError(error); }
}
