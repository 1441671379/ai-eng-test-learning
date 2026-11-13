import { gradeReading, type ReadingLesson, type ReadingQuestion, type ReadingReview } from "./reading";
import { validateQuizAnswers } from "./quiz-answers";
import type { LearningLevel } from "./learning-generation";
export const listeningFormats = { dialogue: "双人对话", daily: "日常场景对话", interview: "访谈 · 行业资讯", science: "科普", podcast: "Podcast" };
export type ListeningFormat = keyof typeof listeningFormats;
export type ListeningLength = "short" | "medium" | "long";
export interface ListeningTurn { id: string; user: string; assistant: string; createdAt: string }
export interface ListeningLesson {
  id: string; title: string; topic: string; paragraphs: string[]; wordCount: number;
  questions: ReadingQuestion[]; level: LearningLevel; remarks?: string; provider: string; model: string;
  modelProvider: "configured" | "local"; generatedAt: string; revealedAt?: string;
  length?: ListeningLength; format?: ListeningFormat; interestsUsed?: string[]; targetWords?: string[];
  attempt?: { answers: Record<string, string>; submittedAt: string; assisted: boolean };
  conversation: ListeningTurn[];
}
export type ListeningReview = Omit<ReadingReview, "sentences" | "vocabulary"> & { assisted: boolean };
export interface PublicListeningLesson {
  id: string; title: string; topic: string; wordCount: number; level: ListeningLesson["level"];
  provider: string; model: string; generatedAt: string; revealedAt?: string;
  transcript: string[] | null; questions: Omit<ReadingQuestion, "answer" | "explanation" | "evidence">[];
  review: ListeningReview | null; conversation: ListeningTurn[];
  length: ListeningLength; format: ListeningFormat; interestsUsed: string[]; targetWords: string[];
  remarks: string;
}
export interface ListeningSummary { id: string; title: string; topic: string; generatedAt: string; wordCount: number; completed: boolean }
function gradingLesson(lesson: ListeningLesson): ReadingLesson {
  return { ...lesson, length: "standard", targetWords: [], sentences: [], vocabulary: [] };
}
export function validateListeningAnswers(lesson: ListeningLesson, input: unknown) { return validateQuizAnswers(lesson.questions, input); }
export function publicListening(lesson: ListeningLesson): PublicListeningLesson {
  const graded = gradeReading(gradingLesson(lesson));
  return { id: lesson.id, title: lesson.title, topic: lesson.topic, wordCount: lesson.wordCount, level: lesson.level,
    provider: lesson.provider, model: lesson.model, generatedAt: lesson.generatedAt, revealedAt: lesson.revealedAt,
    length: lesson.length ?? "medium", format: lesson.format ?? "science", interestsUsed: lesson.interestsUsed ?? [],
    targetWords: lesson.targetWords ?? [], remarks: lesson.remarks ?? "",
    transcript: lesson.attempt || lesson.revealedAt ? lesson.paragraphs : null,
    questions: lesson.questions.map(({ id, type, prompt, options }) => ({ id, type, prompt, ...(options ? { options } : {}) })),
    review: graded ? { questions: graded.questions, correct: graded.correct, total: graded.total, score: graded.score,
      submittedAt: graded.submittedAt, assisted: Boolean(lesson.attempt?.assisted) } : null,
    conversation: lesson.conversation };
}
export function validateListeningTurn(input: unknown) {
  const value = input as { id?: unknown; message?: unknown } | null;
  if (!value || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) ||
      typeof value.message !== "string" || !value.message.trim() || value.message.length > 2000) throw new Error("请填写不超过 2000 字符的回答。");
  return { id: value.id, message: value.message.trim() };
}
