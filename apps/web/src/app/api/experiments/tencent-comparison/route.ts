import { experimentFailure, experimentJson, experimentUser } from "@/lib/experiments/server";
import { ExperimentError, experimentId } from "@/lib/experiments/types";
import { comparisonDatabase, runComparison } from "@/lib/experiments/tencent-comparison/server";
import { listComparisons, readComparison, allComparisons, comparisonAudio } from "@/lib/experiments/tencent-comparison/store";
import { publicTencentSettings } from "@/lib/experiments/tencent-comparison/credentials";
import { resolveDataDir } from "@/lib/pairing/store";
import { exportComparisons } from "@/lib/experiments/tencent-comparison/export";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const userId = await experimentUser(request), url = new URL(request.url), format = url.searchParams.get("format"), rawId = url.searchParams.get("id"), id = rawId === null ? null : experimentId(rawId);
    if (format === "audio") {
      if (!id) throw new ExperimentError("请指定对照实验编号。");
      const wav = await comparisonDatabase(userId, db => comparisonAudio(db, id));
      const headers = { "Content-Type": "audio/wav", "Content-Disposition": `attachment; filename="${id}.wav"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
      const range = request.headers.get("range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : Math.max(0, wav.length - Number(match?.[2]));
        const end = match?.[1] && match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= wav.length) {
          return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${wav.length}` } });
        }
        return new Response(new Uint8Array(wav.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${wav.length}` } });
      }
      return new Response(new Uint8Array(wav), { headers: { ...headers, "Content-Length": String(wav.length) } });
    }
    if (format) {
      if (format !== "jsonl" && format !== "csv" && format !== "words" && format !== "phones") throw new ExperimentError("导出格式无效。");
      const records = await comparisonDatabase(userId, db => id ? [readComparison(db, id)] : allComparisons(db));
      return new Response(exportComparisons(records, format), { headers: { "Content-Type": format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tencent-comparison-${id || "all"}${format === "words" || format === "phones" ? "-" + format : ""}.${format === "jsonl" ? "jsonl" : "csv"}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return experimentJson(id ? { record: await comparisonDatabase(userId, db => readComparison(db, id)) } : { config: await publicTencentSettings(resolveDataDir(), userId), records: await comparisonDatabase(userId, listComparisons) });
  } catch (error) { return experimentFailure(error); }
}
export async function POST(request: Request) {
  try { const userId = await experimentUser(request); return experimentJson({ record: await runComparison(request, userId) }); }
  catch (error) { return experimentFailure(error); }
}
