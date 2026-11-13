import { HISTORICAL_SPEAKING_SOURCES } from "./compatibility/legacy";
import type { LearningModuleId } from "./learning-modules";
export interface LearningRecord {
  id: string;
  module: LearningModuleId | "speaking"; // Preserve historical records after removing the old module.
  source: typeof HISTORICAL_SPEAKING_SOURCES[keyof typeof HISTORICAL_SPEAKING_SOURCES] | "speech" | "reading" | "listening" | "vocabulary" | "writing";
  kind: "pronunciation" | "coach_reply" | "reading_quiz" | "listening_quiz" | "listening_reply" | "vocabulary_review" | "writing_review";
  title: string;
  text: string;
  score: number | null;
  occurredAt: string;
  resourceId?: string;
}
export function validateLearningRecord(value: unknown): LearningRecord {
  if (!value || typeof value !== "object") throw new Error("学习记录格式无效。");
  const item = value as Record<string, unknown>;
  const validSource = item.module === "speaking" && ((item.source === HISTORICAL_SPEAKING_SOURCES.conversation || item.source === "speech") && ["pronunciation", "coach_reply"].includes(String(item.kind)) || item.source === HISTORICAL_SPEAKING_SOURCES.pronunciation && item.kind === "pronunciation") || item.module === "reading" && item.source === "reading" && item.kind === "reading_quiz" || item.module === "listening" && item.source === "listening" && ["listening_quiz", "listening_reply"].includes(String(item.kind));
  if (typeof item.id !== "string" || !/^[a-zA-Z0-9:_-]{1,240}$/.test(item.id) || !(validSource || item.module === "writing" && item.source === "writing" && item.kind === "writing_review" || item.module === "vocabulary" && item.source === "vocabulary" && (item.kind === "vocabulary_review" && item.score === null || item.kind === "pronunciation" && item.score !== null))) throw new Error("学习记录来源无效。");
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 500 || typeof item.text !== "string" || item.text.length > 6000) throw new Error("学习记录内容无效。");
  if (item.score !== null && (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 100)) throw new Error("分数必须在 0–100 之间。");
  if (item.module === "writing" && item.score !== null && (Number(item.score) > 9 || Number(item.score) * 2 % 1 !== 0)) throw new Error("写作参考分必须在 0–9 之间，以 0.5 为单位。");
  if (typeof item.occurredAt !== "string" || !Number.isFinite(Date.parse(item.occurredAt)) || Date.parse(item.occurredAt) > Date.now() + 300_000) throw new Error("学习时间无效。");
  if (item.resourceId !== undefined && (typeof item.resourceId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(item.resourceId))) throw new Error("关联对话无效。");
  return { id: item.id, module: item.module as LearningRecord["module"], source: item.source as LearningRecord["source"], kind: item.kind as LearningRecord["kind"], title: item.title.trim(), text: item.text, score: item.score as number | null, occurredAt: new Date(item.occurredAt).toISOString(), ...(item.resourceId ? { resourceId: item.resourceId as string } : {}) };
}
export function mergeLearningRecords(previous: LearningRecord[], incoming: LearningRecord[]) {
  const records = new Map(previous.map((record) => [record.id, record]));
  for (const record of incoming) {
    const existing = records.get(record.id);
    if (existing && (existing.module !== record.module || existing.source !== record.source || existing.kind !== record.kind)) throw new Error("已有记录的来源不能更改。");
    records.set(record.id, { ...record, occurredAt: existing?.occurredAt ?? record.occurredAt });
  }
  return [...records.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
