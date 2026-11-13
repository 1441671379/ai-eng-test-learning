type QuizAnswerQuestion = { id: string; type: "choice" | "judgment" | "gap" };

/** Shared answer validation. Module-specific question policies belong to callers. */
export function validateQuizAnswers(questions: readonly QuizAnswerQuestion[], input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("请完成全部题目后提交。");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).length !== questions.length) throw new Error("请完成全部题目后提交。");
  return Object.fromEntries(questions.map(question => {
    const answer = values[question.id];
    if (typeof answer !== "string" || !answer.trim() || answer.length > 120) throw new Error("请完成全部题目后提交。");
    if ((question.type === "choice" && !["A", "B", "C", "D"].includes(answer)) ||
        (question.type === "judgment" && !["TRUE", "FALSE", "NOT GIVEN"].includes(answer))) throw new Error("答案选项无效。");
    if (question.type === "gap" && answer.trim().split(/\s+/).length > 3) throw new Error("填空题最多填写三个英文词。");
    return [question.id, answer.trim()];
  }));
}
