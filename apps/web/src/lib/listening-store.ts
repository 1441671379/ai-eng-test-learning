import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { validateListeningAnswers, type ListeningLesson } from "./listening";
const state = globalThis as typeof globalThis & { listeningQueues?: Map<string, Promise<unknown>> };
const queues = state.listeningQueues ??= new Map<string, Promise<unknown>>();
function lessonPath(userId: string, id: string) {
  if (!userId || userId.length > 256 || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("听力记录不存在。");
  return join(resolveDataDir(), "listening", createHash("sha256").update(userId).digest("hex"), "lessons", id + ".json");
}
export function listeningAudioPath(userId: string, id: string, turnId?: string) {
  if (turnId && !/^[a-f0-9-]{36}$/.test(turnId)) throw new Error("对话记录不存在。");
  return lessonPath(userId, id).replace(/\.json$/, turnId ? `.${turnId}.wav` : ".wav");
}
async function writeLesson(userId: string, lesson: ListeningLesson) {
  const path = lessonPath(userId, lesson.id), temporary = path + "." + randomUUID() + ".tmp";
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(temporary, JSON.stringify(lesson), "utf8"); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function readListening(userId: string, id: string): Promise<ListeningLesson> {
  const path = lessonPath(userId, id);
  await queues.get(path)?.catch(() => undefined);
  return JSON.parse(await readFile(path, "utf8"));
}
export async function createListening(userId: string, generated: Omit<ListeningLesson, "id" | "conversation">) {
  const lesson: ListeningLesson = { ...generated, id: randomUUID(), conversation: [] };
  await writeLesson(userId, lesson); return lesson;
}
export async function listListenings(userId: string) {
  const directory = dirname(lessonPath(userId, randomUUID()));
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const lessons = await Promise.all(names.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)).map((name) => readListening(userId, name.slice(0, -5))));
  return lessons.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map(({ id, title, topic, generatedAt, wordCount, attempt }) => ({ id, title, topic, generatedAt, wordCount, completed: Boolean(attempt) }));
}
export async function updateListening(userId: string, id: string, update: (lesson: ListeningLesson) => Promise<void> | void) {
  const path = lessonPath(userId, id);
  const job = (queues.get(path) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const lesson: ListeningLesson = JSON.parse(await readFile(path, "utf8"));
    await update(lesson); await writeLesson(userId, lesson); return lesson;
  });
  queues.set(path, job);
  try { return await job; } finally { if (queues.get(path) === job) queues.delete(path); }
}
export function submitListening(userId: string, id: string, answers: unknown) {
  return updateListening(userId, id, (lesson) => {
    if (!lesson.attempt) lesson.attempt = { answers: validateListeningAnswers(lesson, answers), submittedAt: new Date().toISOString(), assisted: Boolean(lesson.revealedAt) };
  });
}
