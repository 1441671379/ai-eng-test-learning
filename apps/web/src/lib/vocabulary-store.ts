import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { State, type Grade } from "ts-fsrs";
import { resolveDataDir } from "./pairing/store";
import { sampleWords } from "./vocabulary-sample";
import { lookupDictionary, publicDictionary } from "./dictionary-store";
import { fillCardFromDictionary } from "./dictionary";
import { vocabularyAudioSettings, type VocabularyAudioSettings } from "./word-audio";
import { openVocabularyDatabase, readVocabularyDatabase, writeVocabularyDatabase, type VocabularyDatabase } from "./vocabulary-db";
import { cleanWord, contextWords, dayKey, freshSchedule, isReady, liveSchedule, previewCard, queueCards, savedSchedule, scheduler, VocabularyError, wordKey,
  type VocabularyCard, type VocabularySource, type VocabularyState, type WordInput } from "./vocabulary";
const globalStore = globalThis as typeof globalThis & { vocabularyQueues?: Map<string, Promise<unknown>> };
const queues = globalStore.vocabularyQueues ??= new Map<string, Promise<unknown>>();
function userHash(userId: string) {
  if (!userId || userId.length > 256) throw new VocabularyError("学习者无效。");
  return createHash("sha256").update(userId).digest("hex");
}
function userPath(userId: string) { return join(resolveDataDir(), "vocabulary", userHash(userId) + ".json"); }
function addRows(state: VocabularyState, deckId: string, inputs: WordInput[], source: VocabularySource, now = new Date()) {
  const indexed = new Map(state.cards.map(c => [wordKey(c.word), c]));
  let added = 0, linked = 0;
  for (const input of inputs) {
    const fields = cleanWord(input), key = wordKey(fields.word);
    const old = indexed.get(key);
    if (old) {
      if (!old.deckIds.includes(deckId)) { old.deckIds.push(deckId); linked++; }
      if (!old.meaning && fields.meaning) old.meaning = fields.meaning;
      if (!old.example && fields.example) old.example = fields.example;
      if (!old.phonetic && fields.phonetic) old.phonetic = fields.phonetic;
      if (!old.sources.some(s => s.module === source.module && s.resourceId === source.resourceId && s.context === source.context)) old.sources = [...old.sources, source].slice(-20);
      old.revision++;
    } else {
      const card: VocabularyCard = { ...fields, id: randomUUID(), deckIds: [deckId], sources: [source], createdAt: now.toISOString(),
        revision: 0, suspended: false, schedule: freshSchedule(now) };
      state.cards.push(card); indexed.set(key, card); added++;
    }
  }
  if (state.cards.length > 30_000) throw new VocabularyError("当前词库最多保存 30000 个词，请分批使用词书。");
  return { added, linked, duplicates: inputs.length - added - linked };
}
function initialState(): VocabularyState {
  const now = new Date().toISOString();
  const state: VocabularyState = { version: 1, decks: [
    { id: "personal", name: "我的生词库", description: "收纳难记词，以及听、说、读和手动收藏的生词", origin: "personal", createdAt: now },
    { id: "sample-cet6", name: "六级附近 · 示例词书", description: "40 个常用进阶词与原创例句，供体验；不是官方考试词表。", origin: "sample", createdAt: now },
  ], cards: [], reviews: [], settings: { dailyNew: 20, retention: 0.9 }, migratedReadingIds: [] };
  addRows(state, "sample-cet6", sampleWords, { module: "sample", context: "", label: "原创示例" });
  return state;
}
async function load(userId: string, db: VocabularyDatabase) {
  let state: VocabularyState, changed = false;
  const saved = readVocabularyDatabase(db);
  if (saved) state = saved;
  else {
    try { state = JSON.parse(await readFile(userPath(userId), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = initialState(); }
    changed = true;
  }
  if (state.version !== 1 || !Array.isArray(state.cards) || !Array.isArray(state.reviews) || !Array.isArray(state.decks)) throw new Error("词库文件无效，原文件已保留。");
  const personalDeck = state.decks.find(d => d.id === "personal");
  if (personalDeck && personalDeck.name !== "我的生词库") { personalDeck.name = "我的生词库"; changed = true; }
  // Import old reading captures once, retaining the original reading data and mastery choices.
  let legacy: { id: string; word: string; context: string; lessonId: string; mastered: boolean }[] = [];
  try { legacy = JSON.parse(await readFile(join(resolveDataDir(), "reading", userHash(userId), "words.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const migrated = new Set(state.migratedReadingIds);
  for (const word of legacy) if (!migrated.has(word.id)) {
    addRows(state, "personal", [{ word: word.word, example: word.context }], { module: "reading", context: word.context, resourceId: word.lessonId });
    const card = state.cards.find(c => wordKey(c.word) === wordKey(word.word))!;
    if (word.mastered) card.suspended = true;
    card.revision++;
    state.migratedReadingIds.push(word.id); changed = true;
  }
  // Existing difficult reviews also belong to the explicit personal word library.
  if (!state.personalLibraryMigrated) {
    const weakIds = new Set(state.reviews.filter(r => r.rating <= 2).map(r => r.cardId));
    for (const card of state.cards) if (weakIds.has(card.id) || (card.lastRating !== undefined && card.lastRating <= 2)) {
      if (!card.deckIds.includes("personal")) { card.deckIds.push("personal"); card.revision++; }
    }
    state.personalLibraryMigrated = true; changed = true;
  }
  // One pass per installed dictionary version. Never replace supplied meanings,
  // merge word forms, or alter schedules. Missing assets leave collection usable.
  const dictionary = publicDictionary();
  if (dictionary && state.dictionaryVersion !== dictionary.version) {
    for (const card of state.cards) if (card.deckIds.includes("personal") && (!card.meaning || !card.phonetic)) {
      if (fillCardFromDictionary(card, lookupDictionary(card.word))) changed = true;
    }
    state.dictionaryVersion = dictionary.version; changed = true;
  }
  return { state, changed };
}
async function transaction<T>(userId: string, action: (state: VocabularyState) => T | Promise<T>, mutation = true): Promise<T> {
  const path = userPath(userId);
  const task = (queues.get(path) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    const db = openVocabularyDatabase(path.replace(/\.json$/, ".sqlite"));
    try {
      db.exec("BEGIN IMMEDIATE");
      const { state, changed } = await load(userId, db);
      const result = await action(state);
      if (changed || mutation) writeVocabularyDatabase(db, state);
      db.exec("COMMIT"); return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    finally { db.close(); }
  });
  queues.set(path, task);
  try { return await task; } finally { if (queues.get(path) === task) queues.delete(path); }
}
export async function vocabularySnapshot(userId: string, deckId = "all", now = new Date()) {
  return transaction(userId, state => {
    if (deckId !== "all" && !state.decks.some(d => d.id === deckId)) throw new VocabularyError("词书不存在。", 404);
    const { due, availableNew, newToday, queue } = queueCards(state, deckId, now);
    const todayReviews = state.reviews.filter(r => dayKey(new Date(r.reviewedAt)) === dayKey(now));
    const cards = state.cards.filter(c => deckId === "all" || c.deckIds.includes(deckId));
    const nextCard = queue[0];
    return { decks: state.decks.map(d => ({ ...d, count: state.cards.filter(c => c.deckIds.includes(d.id)).length })), settings: { ...state.settings, audio: vocabularyAudioSettings(state.settings.audio) },
      stats: { total: cards.length, due: due.length, new: Math.min(availableNew.length, Math.max(0, state.settings.dailyNew - newToday)), pendingMeaning: cards.filter(c => !c.meaning && !c.suspended).length,
        reviewedToday: todayReviews.length, learnedToday: new Set(todayReviews.map(r => r.cardId)).size, newToday },
      nextCard: nextCard ? { ...nextCard, preview: previewCard(nextCard, state.settings.retention, now) } : null,
      upcomingWords: queue.slice(1, 3).map(card => card.word),
      nextDue: cards.filter(c => isReady(c) && c.schedule.state !== State.New && Date.parse(c.schedule.due) > now.getTime()).sort((a, b) => a.schedule.due.localeCompare(b.schedule.due))[0]?.schedule.due ?? null,
      personalCount: state.cards.filter(c => c.deckIds.includes("personal")).length,
      recentReviews: state.reviews.slice(-10).reverse() };
  }, false);
}
export async function vocabularyCard(userId: string, id: string) {
  return transaction(userId, state => {
    const card = state.cards.find(c => c.id === id);
    if (!card) throw new VocabularyError("单词不存在，请刷新词卡。", 404);
    return card;
  }, false);
}
export async function vocabularyCards(userId: string, options: { deckId?: string; search?: string; page?: number } = {}) {
  return transaction(userId, state => {
    const needle = (options.search ?? "").toLowerCase(), page = options.page ?? 0;
    const cards = state.cards.filter(c => (!options.deckId || options.deckId === "all" || c.deckIds.includes(options.deckId)) &&
      (!needle || [c.word, c.meaning].some(v => v.toLowerCase().includes(needle)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { cards: cards.slice(page * 30, (page + 1) * 30), total: cards.length, page };
  }, false);
}
export async function addVocabulary(userId: string, inputs: WordInput[], source: VocabularySource, deckId = "personal") {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 10_000) throw new VocabularyError("一次导入 1–10000 个词。");
  if (typeof source.context !== "string" || source.context.length > 2500) throw new VocabularyError("收藏语境过长。");
  const clean = inputs.map(cleanWord);
  return transaction(userId, state => {
    if (!state.decks.some(d => d.id === deckId)) throw new VocabularyError("词书不存在。", 404);
    const result = addRows(state, deckId, clean, source);
    const indexed = new Map(state.cards.map(card => [wordKey(card.word), card]));
    for (const input of clean) {
      const card = indexed.get(wordKey(input.word));
      if (card && (!card.meaning || !card.phonetic)) fillCardFromDictionary(card, lookupDictionary(card.word));
    }
    return { ...result, card: clean.length === 1 ? state.cards.find(c => wordKey(c.word) === wordKey(clean[0].word)) : undefined };
  });
}
export async function importVocabulary(userId: string, name: string, inputs: WordInput[], origin: "custom" | "anki" | "builtin" = "anki") {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || !Array.isArray(inputs) || !inputs.length || inputs.length > 10_000) throw new VocabularyError("请输入词书名称，并导入 1–10000 个词。");
  const clean = inputs.map(cleanWord);
  return transaction(userId, state => {
    let deck = state.decks.find(d => d.name.toLowerCase() === name.trim().toLowerCase());
    if (!deck) {
      if (state.decks.length >= 100) throw new VocabularyError("最多创建 100 本词书。");
      deck = { id: randomUUID(), name: name.trim(), description: "导入文本内容；使用本应用独立的复习进度。", origin, createdAt: new Date().toISOString() };
      state.decks.push(deck);
    }
    return { ...addRows(state, deck.id, clean, { module: origin === "anki" ? "anki" : origin === "builtin" ? "book" : "manual", context: "", label: deck.name }), deckId: deck.id };
  });
}
export async function editVocabulary(userId: string, id: string, changes: Partial<WordInput> & { suspended?: boolean }, expectedRevision?: number) {
  return transaction(userId, state => {
    const card = state.cards.find(c => c.id === id); if (!card) throw new VocabularyError("单词不存在。", 404);
    if (expectedRevision !== undefined && card.revision !== expectedRevision) throw new VocabularyError("单词内容已更新，请重新打开后再补全释义。", 409);
    const fields = cleanWord({ ...card, ...changes });
    if (state.cards.some(c => c.id !== id && wordKey(c.word) === wordKey(fields.word))) throw new VocabularyError("这个词已存在，可编辑已有单词。");
    if (changes.suspended !== undefined && typeof changes.suspended !== "boolean") throw new VocabularyError("暂停状态无效。");
    const replaced = new Set((["meaning", "phonetic"] as const).filter(field => changes[field] !== undefined && changes[field] !== card[field]));
    const renamed = fields.word !== card.word;
    Object.assign(card, fields, changes.suspended === undefined ? {} : { suspended: changes.suspended }); card.revision++;
    if (card.dictionary) {
      // Explicit edits, including an AI replacement, supersede dictionary attribution.
      card.dictionary.fields = card.dictionary.fields.filter(field => !replaced.has(field));
      if (renamed || !card.dictionary.fields.length) delete card.dictionary;
    }
    return card;
  });
}
export async function reviewVocabulary(userId: string, input: { id: string; cardId: string; rating: number; revision: number }, now = new Date()) {
  if (!/^[a-f0-9-]{36}$/.test(input.id) || !/^[a-f0-9-]{36}$/.test(input.cardId) || ![1, 2, 3, 4].includes(input.rating) || !Number.isInteger(input.revision)) throw new VocabularyError("复习请求无效。");
  return transaction(userId, state => {
    const existing = state.reviews.find(r => r.id === input.id);
    if (existing) {
      if (existing.cardId !== input.cardId || existing.rating !== input.rating || existing.previousRevision !== input.revision) throw new VocabularyError("这次复习已保存，请刷新后继续。", 409);
      return existing;
    }
    const card = state.cards.find(c => c.id === input.cardId); if (!card) throw new VocabularyError("单词不存在。", 404);
    if (card.revision !== input.revision) throw new VocabularyError("该卡片已在其他页面更新，请刷新后继续。", 409);
    const { newToday } = queueCards(state, "all", now);
    if (!isReady(card) || (card.schedule.state === State.New ? newToday >= state.settings.dailyNew : Date.parse(card.schedule.due) > now.getTime()))
      throw new VocabularyError("这张卡还未到复习时间，或今日新词额度已用完。", 409);
    const wasNew = card.schedule.state === State.New;
    const result = scheduler(state.settings.retention).next(liveSchedule(card), now, input.rating as Grade);
    if (input.rating <= 2 && !card.deckIds.includes("personal")) {
      card.deckIds.push("personal");
      card.sources.push({ module: "vocabulary", context: card.example, label: "复习时标记为忘记或困难" });
    }
    const review = { id: input.id, cardId: card.id, word: card.word, rating: input.rating, previousRevision: input.revision, wasNew, reviewedAt: now.toISOString(), due: result.card.due.toISOString(),
      log: { ...result.log, due: result.log.due.toISOString(), review: result.log.review.toISOString() } };
    card.schedule = savedSchedule(result.card); card.lastRating = input.rating; card.revision++;
    state.reviews.push(review);
    return review;
  });
}
export async function vocabularyContext(userId: string, limit = 8, now = new Date()) { return transaction(userId, state => contextWords(state, limit, now), false); }
export async function setVocabularySettings(userId: string, dailyNew: number, retention: number) {
  if (!Number.isInteger(dailyNew) || dailyNew < 0 || dailyNew > 100 || !Number.isFinite(retention) || retention < 0.8 || retention > 0.97) throw new VocabularyError("每日新词为 0–100；目标记忆率为 80%–97%。");
  return transaction(userId, state => { state.settings = { ...state.settings, dailyNew, retention }; return state.settings; });
}
export async function setVocabularyAudioSettings(userId: string, audio: VocabularyAudioSettings) {
  if (!audio || typeof audio.autoPlay !== "boolean" || !["us", "uk"].includes(audio.accent)) throw new VocabularyError("发音设置无效。");
  if (audio.download !== undefined && typeof audio.download !== "boolean") throw new VocabularyError("发音下载设置无效。");
  return transaction(userId, state => { state.settings.audio = vocabularyAudioSettings(audio); return state.settings.audio; });
}
export async function exportVocabulary(userId: string) { return transaction(userId, state => state.cards, false); }
export async function markPersonalVocabulary(userId: string, id: string, collect: boolean) {
  return transaction(userId, state => {
    const card = state.cards.find(c => c.id === id); if (!card) throw new VocabularyError("单词不存在。", 404);
    if (collect && !card.deckIds.includes("personal")) {
      card.deckIds.push("personal"); card.sources.push({ module: "vocabulary", context: card.example, label: "学习时加入生词库" });
    } else if (!collect) card.deckIds = card.deckIds.filter(d => d !== "personal");
    card.revision++; return card;
  });
}
