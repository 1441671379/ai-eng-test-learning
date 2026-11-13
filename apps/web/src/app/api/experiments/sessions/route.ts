import { createExperiment, deleteExperiment, listExperiments, readExperiment } from "@/lib/experiments/database";
import { experimentBody, experimentDatabase, experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { experimentId, experimentText } from "@/lib/experiments/types";
import { replyMode } from "@/lib/experiments/coach";
import { mutateExperiment } from "@/lib/experiments/database";
import { readPracticeSnapshot, savePracticeEntry } from "@/lib/practice-continuity-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const userId = await experimentUser(request), id = new URL(request.url).searchParams.get("id");
    return experimentJson(await experimentDatabase(userId, db => id ? { session: readExperiment(db, id) } : { sessions: listExperiments(db).filter(item => item.kind !== "time-alignment") }));
  } catch (error) { return experimentFailure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await experimentUser(request), body = await experimentBody(request);
    const topic = experimentText(body.topic, 500, "话题");
    // Pronunciation records are created only by the scoring endpoint, with real results.
    const mode = replyMode(body.mode || "target");
    return experimentJson({ session: await experimentDatabase(userId, db => {
      const session = createExperiment(db, "coach", topic);
      return mutateExperiment(db, session.id, 0, latest => { latest.replyMode = mode; });
    }) });
  } catch (error) { return experimentFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    const userId = await experimentUser(request), id = experimentId(new URL(request.url).searchParams.get("id"));
    await experimentDatabase(userId, db => deleteExperiment(db, id));
    try { const entry = readPracticeSnapshot(userId).speaking; if (entry && new URL(entry.route, request.url).searchParams.get("session") === id) savePracticeEntry(userId, "speaking", null); } catch { /* Record deletion already succeeded; preserve any damaged checkpoint file. */ }
    return experimentJson({ deleted: true });
  } catch (error) { return experimentFailure(error); }
}
