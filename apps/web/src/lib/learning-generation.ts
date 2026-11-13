export const difficultyLabels = {
  foundation: "1 级 · 高中英语",
  standard: "2 级 · 大学英语",
  advanced: "3 级 · 雅思 7.5–8",
} as const;
export type LearningLevel = keyof typeof difficultyLabels;
export function generationOptions(input: { level?: unknown; remarks?: unknown }) {
  const level = input.level ?? "standard", remarks = input.remarks ?? "";
  if (typeof level !== "string" || !Object.hasOwn(difficultyLabels, level)) throw new Error("请选择 1、2 或 3 级文章难度。");
  if (typeof remarks !== "string" || remarks.length > 100 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(remarks)) throw new Error("备注限 100 字符，请删除无效字符。");
  return { level: level as LearningLevel, remarks: remarks.trim() };
}
