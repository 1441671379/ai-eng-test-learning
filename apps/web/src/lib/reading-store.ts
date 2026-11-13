import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { resolveDataDir } from "@/lib/pairing/store";
import { validateAnswers, validatedChoiceQuestions, type ReadingLesson, type SavedWord } from "./reading";
const globalStore = globalThis as typeof globalThis & { readingQueues?: Map<string, Promise<unknown>> };
const queues = globalStore.readingQueues ??= new Map<string, Promise<unknown>>();
function userPath(userId: string) {
  if (!userId || userId.length > 256) throw new Error("用户无效。");
  return join(resolveDataDir(), "reading", createHash("sha256").update(userId).digest("hex"));
}
function lessonPath(userId: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("阅读记录不存在。");
  return join(userPath(userId), "lessons", id + ".json");
}
export function readingAudioPath(userId: string, id: string) { return lessonPath(userId, id).replace(/\.json$/, ".wav"); }
async function atomicWrite(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + "." + randomUUID() + ".tmp";
  try { await writeFile(temporary, JSON.stringify(value), "utf8"); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => undefined); }
}
async function serialized<T>(path: string, action: () => Promise<T>) {
  const task = (queues.get(path) ?? Promise.resolve()).catch(() => undefined).then(action);
  queues.set(path, task);
  try { return await task; } finally { if (queues.get(path) === task) queues.delete(path); }
}
export async function readReading(userId: string, id: string): Promise<ReadingLesson> {
  const path = lessonPath(userId, id);
  await queues.get(path)?.catch(() => undefined);
  return JSON.parse(await readFile(path, "utf8")) as ReadingLesson;
}
export async function createReading(userId: string, generated: Omit<ReadingLesson, "id">) {
  const lesson: ReadingLesson = { ...generated, questions:validatedChoiceQuestions(generated.questions,generated.paragraphs), id: randomUUID() };
  await atomicWrite(lessonPath(userId, lesson.id), lesson);
  return lesson;
}
const choiceUpgrades=new Map<string,Promise<ReadingLesson>>();
export function upgradeReadingChoices(userId:string,id:string,generate:(lesson:ReadingLesson)=>Promise<{questions:unknown;provider:string;model:string;updatedAt:string}>){
  const path=lessonPath(userId,id), existing=choiceUpgrades.get(path);if(existing)return existing;
  const task=serialized(path,async()=>{
    const lesson=JSON.parse(await readFile(path,"utf8")) as ReadingLesson;
    if(lesson.attempt||lesson.questions.every(q=>q.type==="choice"))return lesson;
    const value=await generate(lesson);
    const questions=validatedChoiceQuestions(value.questions,lesson.paragraphs);
    const updated={...lesson,originalQuestions:lesson.originalQuestions||lesson.questions,questions,questionUpdate:{provider:value.provider,model:value.model,updatedAt:value.updatedAt}};
    await atomicWrite(path,updated);return updated;
  });
  choiceUpgrades.set(path,task);
  void task.finally(()=>{if(choiceUpgrades.get(path)===task)choiceUpgrades.delete(path);}).catch(()=>{});
  return task;
}
export async function listReadings(userId: string) {
  const directory = join(userPath(userId), "lessons");
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const lessons = await Promise.all(names.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)).map((name) => readReading(userId, name.slice(0, -5))));
  return lessons.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map(({ id, title, topic, generatedAt, wordCount, attempt }) => ({ id, title, topic, generatedAt, wordCount, completed: Boolean(attempt) }));
}
export async function submitReading(userId: string, id: string, input: unknown) {
  const path = lessonPath(userId, id);
  return serialized(path, async () => {
    const lesson = JSON.parse(await readFile(path, "utf8")) as ReadingLesson;
    if (lesson.attempt) return lesson; // Network retries keep the first completed attempt.
    lesson.attempt = { answers: validateAnswers(lesson, input), submittedAt: new Date().toISOString() };
    await atomicWrite(path, lesson);
    return lesson;
  });
}
export async function readWords(userId: string): Promise<SavedWord[]> {
  const path = join(userPath(userId), "words.json");
  await queues.get(path)?.catch(() => undefined);
  try { return JSON.parse(await readFile(path, "utf8")) as SavedWord[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function updateWords(userId: string, update: (words: SavedWord[]) => SavedWord[]) {
  const path = join(userPath(userId), "words.json");
  return serialized(path, async () => {
    let previous: SavedWord[];
    try { previous = JSON.parse(await readFile(path, "utf8")) as SavedWord[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; previous = []; }
    const words = update(previous);
    await atomicWrite(path, words);
    return words;
  });
}
