import { createEmptyCard, fsrs, State, type Card, type Grade, type ReviewLog } from "ts-fsrs";
import { normalizeVocabularyText } from "./vocabulary-text";
import type { VocabularyAudioSettings } from "./word-audio";

export type VocabularyOrigin = "manual" | "reading" | "listening" | "speaking" | "writing" | "anki" | "sample" | "vocabulary" | "book";
export interface VocabularySource { module: VocabularyOrigin; context: string; resourceId?: string; label?: string }
export type SavedSchedule = Omit<Card, "due" | "last_review"> & { due: string; last_review?: string };
export interface VocabularyCard {
  id: string; word: string; meaning: string; phonetic: string; example: string; deckIds: string[];
  sources: VocabularySource[]; createdAt: string; revision: number; suspended: boolean;
  schedule: SavedSchedule; lastRating?: number;
  dictionary?: { source: "ECDICT"; version: string; headword: string; match: "exact" | "lemma"; fields: ("meaning" | "phonetic")[] };
}
export interface VocabularyDeck { id: string; name: string; description: string; origin: "sample" | "personal" | "custom" | "anki" | "builtin"; createdAt: string }
export interface VocabularyReview {
  id: string; cardId: string; word: string; rating: number; wasNew: boolean; reviewedAt: string; due: string;
  previousRevision: number; log: Omit<ReviewLog, "due" | "review"> & { due: string; review: string };
}
export interface VocabularyState {
  version: 1; decks: VocabularyDeck[]; cards: VocabularyCard[]; reviews: VocabularyReview[];
  settings: { dailyNew: number; retention: number; audio?: VocabularyAudioSettings }; migratedReadingIds: string[]; personalLibraryMigrated?: boolean; dictionaryVersion?: string;
}
export interface WordInput { word: string; meaning?: string; phonetic?: string; example?: string }
export const ratingLabels = { 1: "忘记", 2: "困难", 3: "记住", 4: "简单" } as const;
export const originLabels: Record<VocabularyOrigin, string> = { manual: "手动添加", reading: "读", listening: "听", speaking: "说", writing: "写", anki: "Anki 导入", sample: "示例词书", vocabulary: "单词学习", book: "本地词书" };
export class VocabularyError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
export function wordKey(word: string) { return normalizeVocabularyText(word).trim().replace(/\s+/g, " ").toLowerCase(); }
export function cleanWord(input: WordInput): Required<WordInput> {
  if (!input || typeof input.word !== "string") throw new VocabularyError("请输入英文单词或短语。");
  const word = normalizeVocabularyText(input.word).trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z][A-Za-z' -]{0,79}$/.test(word) || word.split(" ").length > 8) throw new VocabularyError("单词或短语限 80 字符、8 个英文词。");
  function field(value: unknown, max: number) {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new VocabularyError("释义或例句过长，或包含无效字符。");
    return value.trim();
  }
  return { word, meaning: field(input.meaning, 4000), example: field(input.example, 2500), phonetic: field(input.phonetic, 200) };
}
export function savedSchedule(card: Card): SavedSchedule {
  return { ...card, due: card.due.toISOString(), ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}) } as SavedSchedule;
}
export function freshSchedule(now: Date) { return savedSchedule(createEmptyCard(now)); }
export function scheduler(retention: number) { return fsrs({ request_retention: retention, enable_fuzz: false, learning_steps: ["1m", "10m"], relearning_steps: ["10m"] }); }
export function liveSchedule(card: VocabularyCard): Card {
  return { ...card.schedule, due: new Date(card.schedule.due), last_review: card.schedule.last_review ? new Date(card.schedule.last_review) : undefined };
}
export function isReady(card: VocabularyCard) { return Boolean(card.meaning.trim()) && !card.suspended; }
export function queueCards(state: VocabularyState, deckId = "all", now = new Date()) {
  const newToday = state.reviews.filter(r => r.wasNew && dayKey(new Date(r.reviewedAt)) === dayKey(now)).length;
  const cards = state.cards.filter(c => isReady(c) && (deckId === "all" || c.deckIds.includes(deckId)));
  const due = cards.filter(c => c.schedule.state !== State.New && Date.parse(c.schedule.due) <= now.getTime())
    .sort((a, b) => (a.schedule.state === State.Review ? 1 : 0) - (b.schedule.state === State.Review ? 1 : 0) || a.schedule.due.localeCompare(b.schedule.due));
  // Card IDs are random UUIDs persisted on creation: this shuffles each learner's
  // new cards once, without reshuffling on refresh or changing due-card priority.
  const availableNew = cards.filter(c => c.schedule.state === State.New).sort((a, b) => a.id.localeCompare(b.id));
  return { due, availableNew, newToday, queue: [...due, ...availableNew.slice(0, Math.max(0, state.settings.dailyNew - newToday))] };
}
export function previewCard(card: VocabularyCard, retention: number, now = new Date()) {
  const result = scheduler(retention).repeat(liveSchedule(card), now);
  return [1, 2, 3, 4].map(rating => ({ rating, due: result[rating as Grade].card.due.toISOString(),
    intervalMinutes: Math.max(1, Math.ceil((result[rating as Grade].card.due.getTime() - now.getTime()) / 60000)) }));
}
/** Stable integration contract for listening, speaking and later reading generation. */
export function contextWords(state: VocabularyState, limit = 8, now = new Date()) {
  const today = dayKey(now);
  const reviewedToday = new Set(state.reviews.filter(r => dayKey(new Date(r.reviewedAt)) === today).map(r => r.cardId));
  return state.cards.filter(c => !c.suspended && (reviewedToday.has(c.id) || (c.lastRating !== undefined && (c.lastRating <= 2 || Date.parse(c.schedule.due) <= now.getTime())) ||
      (c.schedule.state === State.New && c.deckIds.includes("personal"))))
    .sort((a, b) => Number((b.lastRating ?? 4) <= 2) - Number((a.lastRating ?? 4) <= 2) || Number(reviewedToday.has(b.id)) - Number(reviewedToday.has(a.id)) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit).map(c => ({ id: c.id, word: c.word, meaning: c.meaning, reason: (c.lastRating ?? 4) <= 2 ? "待巩固" : reviewedToday.has(c.id) ? "今日学习" : "历史生词" }));
}
