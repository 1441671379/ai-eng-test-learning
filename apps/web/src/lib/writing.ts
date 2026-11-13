export type WritingMode = "free" | "task2";
export const criterionLabels = { TR: "任务回应", CC: "连贯与衔接", LR: "词汇资源", GRA: "语法范围与准确性" } as const;
export type CriterionId = keyof typeof criterionLabels;
export interface WritingInput { title: string; mode: WritingMode; prompt: string; text: string; assisted?: boolean; parentVersionId?: string | null }
export interface WritingCriterion { id: CriterionId; band: number | null; evidence: string; reason: string; nextStep: string }
export interface WritingEdit { id: string; start: number; end: number; original: string; corrected: string; category: string; explanation: string; engine: "llm" | "languagetool" }
export interface WritingExpression { original: string; natural: string; advanced: string; explanation: string }
export interface WritingReview {
  summary: string; strengths: string[]; priorities: string[]; criteria: WritingCriterion[];
  corrections: WritingEdit[]; expressions: WritingExpression[]; exercises: { question: string; answer: string; explanation: string }[];
  band: number | null; wordCount: number; warnings: string[]; provider: string; model: string;
  generatedAt: string; rubricVersion: string; grammarEngine: string; omittedCorrections?: number; proofreadingVersion?: string; checkedSentences?: number; totalSentences?: number; proofreadingStatus?: "complete" | "partial"; assessmentStatus?: "complete" | "unavailable";
}
export interface WritingVersion extends WritingInput {
  id: string; number: number; requestId: string; draftRevision: number; submittedAt: string;
  assisted: boolean; parentVersionId: string | null; review: WritingReview;
}
export interface WritingDocument extends WritingInput { id: string; revision: number; updatedAt: string; versions: WritingVersion[] }
export interface WritingSummary { id: string; title: string; mode: WritingMode; updatedAt: string; versionCount: number; band: number | null }
export class WritingError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export const isWritingId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function writingWordCount(text: string) { return (text.match(/\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b/g) || []).length; }
export function validateWritingInput(raw: unknown): WritingInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new WritingError("写作内容格式无效。");
  const v = raw as Record<string, unknown>;
  if (v.mode !== "free" && v.mode !== "task2") throw new WritingError("请选择自由写作或雅思 Task 2。");
  for (const [key, max] of [["title", 160], ["prompt", 3000], ["text", 16000]] as const) {
    if (typeof v[key] !== "string" || v[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v[key])) throw new WritingError("标题、题目或正文过长，或包含无效字符。");
  }
  if (writingWordCount(v.text as string) > 2000) throw new WritingError("单次批改最多 2000 个英文词，请分篇练习。");
  if (v.assisted !== undefined && typeof v.assisted !== "boolean" || v.parentVersionId !== undefined && v.parentVersionId !== null && !isWritingId(v.parentVersionId)) throw new WritingError("修改稿标记无效。");
  return { title: (v.title as string).trim(), prompt: v.prompt as string, text: v.text as string, mode: v.mode, assisted: v.assisted === true, parentVersionId: (v.parentVersionId as string) || null };
}
// Anchors belong to an immutable submission. If the draft has changed, never
// replace the same-looking phrase somewhere else in the learner's text.
export function applyWritingEdit(text: string, snapshot: string, edit: WritingEdit) {
  if (text !== snapshot || snapshot.slice(edit.start, edit.end) !== edit.original) throw new WritingError("草稿已经改动，请自行参考此建议，或重新批改后再采用。");
  return text.slice(0, edit.start) + edit.corrected + text.slice(edit.end);
}
export function applyWritingEdits(snapshot: string, edits: WritingEdit[]) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = snapshot, boundary = snapshot.length;
  for (const edit of sorted) {
    if (edit.end > boundary || snapshot.slice(edit.start, edit.end) !== edit.original) throw new WritingError("修改位置冲突，请逐条参考建议。");
    result = result.slice(0, edit.start) + edit.corrected + result.slice(edit.end); boundary = edit.start;
  }
  return result;
}
