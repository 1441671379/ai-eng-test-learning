import { ExperimentError, type ExperimentAssessment, type ExperimentSession } from "./types";
import { parseTimeAlignmentSettings, type TimeAlignmentSettings, type WordJudgement } from "./time-alignment-judgement";
import type { PronunciationReference } from "./time-alignment-types";

export const ARTICLE_MAX_CHARACTERS = 16_000;
export const ARTICLE_MAX_WORDS = 2_000;
export const ARTICLE_SEGMENT_WORDS = 35;
const SEGMENT_CHARACTERS = 400;

export interface ArticleAttempt {
  id: string;
  assessedAt: string;
  assessment: ExperimentAssessment;
  confirmedOmissions: number[];
}
export interface ArticleSegment {
  index: number;
  text: string;
  start: number;
  end: number;
  wordStart: number;
  wordCount: number;
  revision: number;
  attempt: ArticleAttempt | null;
  lastSubmission?: { id: string; assessedAt: string; status: "complete" | "partial" | "failed"; transcript: string; transcriptSource?: "provided" | "whisper"; error?: string };
  history: { id: string; assessedAt: string; score: number | null; scoredWords: number }[];
}
export interface ArticleReading {
  version: 1;
  title: string;
  text: string;
  sourceLessonId: string | null;
  wordCount: number;
  settings: TimeAlignmentSettings;
  segments: ArticleSegment[];
}
export interface ArticleWord extends WordJudgement {
  colour: "green" | "red" | "pending";
  expectedPhones: string[];
  heardPhones: string[];
  confirmedOmission: boolean;
  pronunciation?: PronunciationReference;
}
export function articleTokens(text: string) {
  return [...text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)].map(match => ({ word: match[0], start: match.index!, end: match.index! + match[0].length }));
}
function canonical(word: string) { return word.replaceAll("’", "'").toLowerCase(); }

export function createArticleReading(input: unknown, title: unknown, settings: TimeAlignmentSettings, sourceLessonId: string | null = null): ArticleReading {
  if (typeof input !== "string" || !input.trim() || input.length > ARTICLE_MAX_CHARACTERS) throw new ExperimentError(`请输入不超过 ${ARTICLE_MAX_CHARACTERS.toLocaleString()} 个字符的英文文章。`);
  const text = input.replace(/\r\n?/g, "\n").trim(), tokens = articleTokens(text);
  if (!tokens.length || tokens.length > ARTICLE_MAX_WORDS) throw new ExperimentError(`文章需要包含 1–${ARTICLE_MAX_WORDS.toLocaleString()} 个英文单词。`);
  if (tokens.some(token => token.word.length > 120)) throw new ExperimentError("文章中存在过长的单词，请检查空格和拼写。");
  const name = typeof title === "string" ? title.trim() : "";
  if (name.length > 150) throw new ExperimentError("文章标题不能超过 150 个字符。");
  const segments: ArticleSegment[] = [];
  for (let first = 0, start = 0; first < tokens.length;) {
    let last = first + 1;
    while (last < tokens.length && last - first < ARTICLE_SEGMENT_WORDS && tokens[last].end - start <= SEGMENT_CHARACTERS) last++;
    // Prefer a sentence or paragraph ending without creating many tiny clips.
    for (let next = last; last < tokens.length && next > first + 7; next--) {
      if (next < tokens.length && /[.!?]["')\]]*\s|\n/.test(text.slice(tokens[next - 1].end, tokens[next].start))) { last = next; break; }
    }
    const end = last < tokens.length ? tokens[last].start : text.length;
    const part = text.slice(start, end);
    if (part.length > 600) throw new ExperimentError("某一段包含过多符号或空白，请整理文章后重试。");
    segments.push({ index: segments.length, text: part, start, end, wordStart: first, wordCount: last - first, revision: 0, attempt: null, history: [] });
    first = last; start = end;
  }
  return { version: 1, title: name || tokens.slice(0, 8).map(token => token.word).join(" "), text, sourceLessonId, wordCount: tokens.length,
    settings: parseTimeAlignmentSettings(settings), segments };
}
export function requireArticle(session: ExperimentSession): ArticleReading {
  if (session.kind !== "article-reading" || !session.articleReading) throw new ExperimentError("请选择文章朗读记录。", 404);
  return session.articleReading;
}
export function articleSegment(article: ArticleReading, index: unknown, revision?: unknown): ArticleSegment {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= article.segments.length) throw new ExperimentError("文章分段编号无效。");
  const segment = article.segments[index];
  if (revision !== undefined && (typeof revision !== "number" || !Number.isInteger(revision) || revision !== segment.revision)) throw new ExperimentError("这一段已在其他页面更新，请重新打开文章后继续。", 409);
  return segment;
}
export function articleSegmentWords(segment: ArticleSegment): ArticleWord[] {
  const attempt = segment.attempt, evaluation = attempt?.assessment.evaluation, method = evaluation?.alignment.methods.soft;
  return articleTokens(segment.text).map((token, index) => {
    const judged = evaluation?.words[index], raw = method?.available ? method.words[index] : undefined;
    const base: WordJudgement = judged || { wordIndex: index, word: token.word, verdict: "unscored", matchPercent: null,
      matchedCount: 0, operationCount: 0, meanConfidence: null, lowConfidenceCount: 0, assignment: "unknown", reason: "这一段还没有录音评分。" };
    const omitted = attempt?.confirmedOmissions.includes(index) ?? false;
    return { ...base, word: token.word, expectedPhones: raw?.expectedPhones ?? [], heardPhones: raw?.heardPhones ?? [], pronunciation: raw?.pronunciation, confirmedOmission: omitted,
      ...(omitted ? { matchPercent: 0, matchedCount: 0, operationCount: Math.max(1, raw?.expectedPhones.length || 0), reason: "你已确认漏读，这个词按 0 分计入。" } : {}),
      colour: omitted || base.verdict === "orange" ? "red" : base.verdict === "green" ? "green" : "pending" };
  });
}
export function summarizeArticleSegment(segment: ArticleSegment) {
  const scored = articleSegmentWords(segment).filter(word => word.colour !== "pending");
  const operations = scored.reduce((sum, word) => sum + word.operationCount, 0);
  const matched = scored.reduce((sum, word) => sum + word.matchedCount, 0);
  return { score: operations ? Math.round(matched / operations * 1000) / 10 : null,
    scoredWords: scored.length, wordCount: segment.wordCount, complete: scored.length === segment.wordCount };
}

export function summarizeArticle(article: ArticleReading) {
  const words = article.segments.flatMap(articleSegmentWords), scored = words.filter(word => word.colour !== "pending");
  const matched = scored.reduce((sum, word) => sum + word.matchedCount, 0), operations = scored.reduce((sum, word) => sum + word.operationCount, 0);
  return { score: operations ? Math.round(matched / operations * 1000) / 10 : null, complete: scored.length === article.wordCount,
    scoredWords: scored.length, wordCount: article.wordCount, green: scored.filter(word => word.colour === "green").length,
    red: scored.filter(word => word.colour === "red").length, pending: words.length - scored.length,
    recordedSegments: article.segments.filter(segment => segment.attempt).length, segmentCount: article.segments.length };
}
export function saveArticleAttempt(article: ArticleReading, index: number, revision: number, attempt: ArticleAttempt) {
  const segment = articleSegment(article, index, revision), evaluation = attempt.assessment.evaluation;
  const tokens = articleTokens(segment.text);
  if (!evaluation || canonical(evaluation.alignment.targetText.trim()) !== canonical(segment.text.trim()) || evaluation.words.length !== tokens.length ||
      evaluation.words.some((word, i) => word.wordIndex !== i || canonical(word.word) !== canonical(tokens[i].word)) ||
      JSON.stringify(evaluation.settings) !== JSON.stringify(article.settings)) throw new ExperimentError("评分结果与当前文章分段不一致，请重试。", 502);
  segment.attempt = { ...attempt, confirmedOmissions: [] };
  segment.lastSubmission = { id: attempt.id, assessedAt: attempt.assessedAt, status: evaluation.words.some(word => word.verdict === "unscored") ? "partial" : "complete",
    transcript: attempt.assessment.transcript, transcriptSource: evaluation.alignment.transcriptSource };
  segment.revision++;
  const words = articleSegmentWords(segment), scored = words.filter(word => word.colour !== "pending");
  const operations = scored.reduce((sum, word) => sum + word.operationCount, 0), matched = scored.reduce((sum, word) => sum + word.matchedCount, 0);
  segment.history.push({ id: attempt.id, assessedAt: attempt.assessedAt, score: operations ? Math.round(matched / operations * 1000) / 10 : null, scoredWords: scored.length });
  segment.history = segment.history.slice(-10);
}
export function saveArticleFailure(article: ArticleReading, index: number, revision: number, submission: NonNullable<ArticleSegment["lastSubmission"]>) {
  const segment = articleSegment(article, index, revision);
  segment.lastSubmission = { ...submission, status: "failed" };
  segment.revision++;
}
export function confirmArticleOmission(article: ArticleReading, index: number, revision: number, wordIndex: unknown, confirmed: unknown) {
  const segment = articleSegment(article, index, revision);
  if (!segment.attempt || typeof confirmed !== "boolean" || typeof wordIndex !== "number" || !Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex >= segment.wordCount) throw new ExperimentError("请先完成这一段的评分。");
  const word = segment.attempt.assessment.evaluation?.words[wordIndex];
  if (word?.verdict !== "unscored") throw new ExperimentError("已有可靠评估的单词无需手动标记漏读。");
  segment.attempt.confirmedOmissions = confirmed ? [...new Set([...segment.attempt.confirmedOmissions, wordIndex])] : segment.attempt.confirmedOmissions.filter(index => index !== wordIndex);
  const scored = articleSegmentWords(segment).filter(word => word.colour !== "pending"), operations = scored.reduce((sum, word) => sum + word.operationCount, 0);
  const currentHistory = segment.history.find(item => item.id === segment.attempt!.id);
  if (currentHistory) {
    currentHistory.score = operations ? Math.round(scored.reduce((sum, word) => sum + word.matchedCount, 0) / operations * 1000) / 10 : null;
    currentHistory.scoredWords = scored.length;
  }
  segment.revision++;
}
