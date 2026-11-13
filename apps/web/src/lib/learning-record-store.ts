import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "@/lib/pairing/store";
import { mergeLearningRecords, validateLearningRecord, type LearningRecord } from "./learning-records";
const storageGlobal = globalThis as typeof globalThis & { learningQueues?: Map<string, Promise<unknown>> };
const queues = storageGlobal.learningQueues ??= new Map<string, Promise<unknown>>();
function recordPath(userId: string) {
  if (!userId || userId.length > 256) throw new Error("用户无效。");
  return join(resolveDataDir(), "learning-records", createHash("sha256").update(userId).digest("hex") + ".json");
}
async function readRecords(path: string): Promise<LearningRecord[]> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.records)) throw new Error("学习记录文件无效，原文件已保留。");
  return data.records.map(validateLearningRecord);
}
export async function listLearningRecords(userId: string) {
  const path = recordPath(userId);
  await queues.get(path)?.catch(() => undefined);
  return readRecords(path);
}
export async function saveLearningRecords(userId: string, incoming: LearningRecord[]) {
  const path = recordPath(userId);
  const operation = (queues.get(path) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const records = mergeLearningRecords(await readRecords(path), incoming.map(validateLearningRecord));
    await mkdir(join(resolveDataDir(), "learning-records"), { recursive: true });
    const temporary = path + "." + randomUUID() + ".tmp";
    try { await writeFile(temporary, JSON.stringify({ version: 1, records }), "utf8"); await rename(temporary, path); }
    finally { await unlink(temporary).catch(() => undefined); }
    return records;
  });
  queues.set(path, operation);
  try { return await operation; } finally { if (queues.get(path) === operation) queues.delete(path); }
}
