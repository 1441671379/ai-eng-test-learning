import type { LearningLevel } from "./learning-generation";
import { containsVocabularyWord } from "./vocabulary-text";
import { validateQuizAnswers } from "./quiz-answers";
export interface Citation { paragraph: number; quote: string }
export interface ReadingQuestion {
  id: string; type: "choice" | "judgment" | "gap"; prompt: string; options?: string[];
  answer: string; explanation: string; evidence: Citation;
}
export interface SentenceAnalysis extends Citation { translation: string; structure: string }
export interface ReadingVocabulary { word: string; meaning: string; example: string }
export interface ReadingLesson {
  id: string; title: string; topic: string; paragraphs: string[]; wordCount: number;
  questions: ReadingQuestion[]; sentences: SentenceAnalysis[]; vocabulary: ReadingVocabulary[];
  targetWords: string[]; length: "standard" | "long"; provider: string; model: string; generatedAt: string;
  level?: LearningLevel; remarks?: string;
  originalQuestions?: ReadingQuestion[];
  questionUpdate?: { provider: string; model: string; updatedAt: string };
  attempt?: { answers: Record<string, string>; submittedAt: string };
}
export interface ReadingReview {
  correct: number; total: number; score: number; submittedAt: string;
  questions: (ReadingQuestion & { selected: string; correct: boolean })[];
  sentences: SentenceAnalysis[]; vocabulary: ReadingVocabulary[];
}
export type PublicReadingLesson = Omit<ReadingLesson, "questions" | "sentences" | "vocabulary" | "attempt" | "originalQuestions"> & {
  questions: Omit<ReadingQuestion, "answer" | "explanation" | "evidence">[]; review: ReadingReview | null; requiresChoiceUpgrade: boolean;
};
export interface ReadingSummary { id: string; title: string; topic: string; generatedAt: string; wordCount: number; completed: boolean }
export interface SavedWord { id: string; word: string; context: string; lessonId: string; createdAt: string; mastered: boolean }
export function readingTargets(manual: string[], saved: SavedWord[], includeVocabulary: boolean): string[] {
  const candidates = [...manual, ...(includeVocabulary ? saved.filter((word) => !word.mastered).map((word) => word.word) : [])];
  const result: string[] = [], seen = new Set<string>();
  for (const candidate of candidates) {
    const word = candidate.trim(), key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    result.push(word); seen.add(key);
    if (result.length === 8) break;
  }
  return result;
}
export function normalizedAnswer(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/[’‘]/g, "'").replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ");
}
export function gradeReading(lesson: ReadingLesson): ReadingReview | null {
  if (!lesson.attempt) return null;
  const answers = lesson.attempt.answers;
  const questions = lesson.questions.map((question) => ({ ...question, selected: answers[question.id] ?? "", correct: normalizedAnswer(answers[question.id] ?? "") === normalizedAnswer(question.answer) }));
  const correct = questions.filter((question) => question.correct).length;
  return { questions, correct, total: questions.length, score: Math.round(correct / questions.length * 100), submittedAt: lesson.attempt.submittedAt, sentences: lesson.sentences, vocabulary: lesson.vocabulary };
}
export function publicReading(lesson: ReadingLesson): PublicReadingLesson {
  // Keep answer keys and teaching notes on the server until a completed attempt exists.
  return { id: lesson.id, title: lesson.title, topic: lesson.topic, paragraphs: lesson.paragraphs, wordCount: lesson.wordCount,
    targetWords: lesson.targetWords, length: lesson.length, level: lesson.level ?? "standard", remarks: lesson.remarks ?? "", provider: lesson.provider, model: lesson.model, generatedAt: lesson.generatedAt,
    questions: lesson.questions.map(({ id, type, prompt, options }) => ({ id, type, prompt, ...(options ? { options } : {}) })), review: gradeReading(lesson), requiresChoiceUpgrade: !lesson.attempt&&lesson.questions.some(q=>q.type!=="choice") };
}
export function validatedChoiceQuestions(input: unknown, paragraphs: string[]): ReadingQuestion[] {
  if(!Array.isArray(input)||input.length!==6)throw new Error("需要六道完整的四选一选择题。");
  const prompts=new Set<string>();
  return input.map((raw,index)=>{
    const q=raw as ReadingQuestion;
    if(!q||q.type!=="choice"||typeof q.prompt!=="string"||!q.prompt.trim()||q.prompt.length>600||/___/.test(q.prompt)||!Array.isArray(q.options)||q.options.length!==4||q.options.some(o=>typeof o!=="string"||!o.trim()||o.length>300)||new Set(q.options.map(normalizedAnswer)).size!==4||!["A","B","C","D"].includes(q.answer)||typeof q.explanation!=="string"||!q.explanation.trim())throw new Error("模型返回的选择题格式无效，请重试。");
    const e=q.evidence;
    if(!e||!Number.isInteger(e.paragraph)||typeof e.quote!=="string"||!e.quote.trim()||!paragraphs[e.paragraph-1]?.replace(/\s+/g," ").toLowerCase().includes(e.quote.replace(/\s+/g," ").toLowerCase()))throw new Error("选择题缺少可核对的原文依据。");
    const key=normalizedAnswer(q.prompt);if(prompts.has(key))throw new Error("选择题重复，请重试。");prompts.add(key);
    return {id:`choice-v2-q${index+1}`,type:"choice",prompt:q.prompt.trim(),options:q.options.map(o=>o.trim()),answer:q.answer,explanation:q.explanation,evidence:{paragraph:e.paragraph,quote:e.quote}};
  });
}
export function validateAnswers(lesson: ReadingLesson, input: unknown): Record<string, string> {
  if(!lesson.attempt&&lesson.questions.some(q=>q.type!=="choice"))throw new Error("请先将旧题目更新为选择题，文章和原记录会保留。");
  return validateQuizAnswers(lesson.questions,input);
}
export function containsWord(text: string, word: string) {
  return containsVocabularyWord(text, word);
}
