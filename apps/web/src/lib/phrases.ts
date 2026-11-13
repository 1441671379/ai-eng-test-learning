export type PhraseBook = "oxford" | "pte";
export interface PhraseSource { book: PhraseBook; page: number; number: number; components?: string[] }
export interface PhraseContent {
  version: 1; meaningZh: string; usage: string; example: string; exampleZh: string;
  recallAnswers: string[]; sentencePatterns: string[]; cloze: { prompt: string; answers: string[] };
  origin: "authored" | "ai" | "manual"; provider?: string; model?: string;
  teachingPhrase?: string; sourceNote?: string;
}
export interface PhraseEntry { id: string; phrase: string; level: string | null; pattern: string; variants: string[]; sources: PhraseSource[]; legacyPhrases?: string[]; unit?: string; content?: PhraseContent }
export interface PhraseUnit { id: string; title: string; titleEn: string; description: string; passage: string; translation: string; origin?: "authored" | "ai"; model?: string; entryIds: string[]; expressions?: {id:string;phrase:string}[] }
export interface PhraseCourse { id: string; category: string; categoryTitle: string; categoryTitleEn: string; title: string; titleEn: string; unitIds: string[] }
export function isPhraseCourseComplete(course: Pick<PhraseCourse,"unitIds"> & {readUnits:number}) {
  return course.unitIds.length > 0 && course.readUnits >= course.unitIds.length;
}
export interface PhraseCatalog { version: 1; books: { id: PhraseBook; title: string; count: number; advertisedCount?: number; missingSourceNumbers?: number[]; pages: number }[]; entries: PhraseEntry[]; units: PhraseUnit[]; courses: PhraseCourse[] }
export interface PhraseProgress { id: string; revision: number; saved: boolean }
export interface PhraseSentenceFeedback { targetUsed: boolean; natural: boolean; corrected: string; explanation: string; provider?: string; model?: string }
export interface PhraseAttempt { id: string; entryId: string; kind: "recall" | "cloze" | "sentence"; text: string; createdAt: string; correct: boolean | null; feedback?: PhraseSentenceFeedback }
export interface PhraseSnapshot { entries: (PhraseEntry & { progress?: PhraseProgress })[]; total: number; units: (PhraseUnit & { read: boolean })[]; courses: (PhraseCourse & { readUnits: number })[]; books: PhraseCatalog["books"]; readUnits: number }
export class PhraseError extends Error { status:number; constructor(message: string, status = 400) { super(message);this.status=status; } }
export function phraseText(value: unknown, limit: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new PhraseError(`${label}为空、过长或包含无效字符。`);
  return value.trim();
}
export function normalizePhrase(text: string) { return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim(); }
const irregular: Record<string, string[]> = { take: ["take", "takes", "taking", "took", "taken"], make: ["make", "makes", "making", "made"], get: ["get", "gets", "getting", "got", "gotten"], draw: ["draw", "draws", "drawing", "drew", "drawn"], lead: ["lead", "leads", "leading", "led"], keep: ["keep", "keeps", "keeping", "kept"], deal: ["deal", "deals", "dealing", "dealt"], find: ["find", "finds", "finding", "found"], bring:["bring","brings","bringing","brought"], come:["come","comes","coming","came"], put:["put","puts","putting"], stick:["stick","sticks","sticking","stuck"], undertake:["undertake","undertakes","undertaking","undertook","undertaken"] };
const verbs = new Set(["conduct", "collect", "point", "present", "decide", "focus", "carry", "cope", "depend", "result", "look", "pay", "take", "make", "get", "draw", "lead", "keep", "deal", "find", "account", "contribute", "interpret", "work", "bring", "come", "put", "stick", "undertake"]);
function forms(word: string) { if (irregular[word]) return irregular[word]; if (word === "pay") return ["pay", "pays", "paying", "paid"]; return word.endsWith("y") ? [word, word.slice(0,-1)+"ies", word.slice(0,-1)+"ied", word+"ing"] : [word, word+"s", word.endsWith("e") ? word+"d" : word+"ed", word.replace(/e$/, "")+"ing"]; }
/** A lexical presence check, never a grammar or naturalness grade. */
export function containsPhrase(text: string, patterns: string[]) {
  const normalized = normalizePhrase(text);
  return patterns.some(pattern => {
    const tokens = normalizePhrase(pattern.replace(/sb\/sth/g,"something")).split(" ");
    const source = tokens.map((token, index) => ["sth", "sb", "something", "somebody"].includes(token) ? "(?:[a-z0-9']+ ){0,7}[a-z0-9']+" : index === 0 && verbs.has(token) ? "(?:"+forms(token).join("|")+")" : token).join(" ");
    return new RegExp("(?:^| )"+source+"(?: |$)").test(normalized);
  });
}
export function checkPhraseAnswer(content: PhraseContent, kind: "recall" | "cloze", answer: string) {
  const text = normalizePhrase(answer), accepted = kind === "recall" ? content.recallAnswers : content.cloze.answers;
  // Open output may have other good answers; this checker reports the target only.
  return accepted.some(value => normalizePhrase(value) === text);
}
export function validatePhraseContent(value: unknown, origin: PhraseContent["origin"]): PhraseContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PhraseError("学习内容格式无效。");
  const v = value as Record<string, unknown>;
  function list(raw: unknown) { if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new PhraseError("学习内容需要明确的参考表达。"); return raw.map(item=>phraseText(item,180,"参考表达")); }
  const cloze = v.cloze as Record<string,unknown> | undefined;
  if (!cloze || typeof cloze !== "object") throw new PhraseError("缺少语境填空。");
  const content: PhraseContent = { version: 1, meaningZh: phraseText(v.meaningZh,600,"中文释义"), usage: phraseText(v.usage,1600,"用法讲解"), example: phraseText(v.example,800,"例句"), exampleZh: phraseText(v.exampleZh,800,"例句翻译"), recallAnswers:list(v.recallAnswers), sentencePatterns:list(v.sentencePatterns), cloze:{prompt:phraseText(cloze.prompt,800,"填空句"),answers:list(cloze.answers)}, origin };
  if(v.teachingPhrase!==undefined)content.teachingPhrase=phraseText(v.teachingPhrase,180,"学习表达");
  if(v.sourceNote!==undefined)content.sourceNote=phraseText(v.sourceNote,400,"来源说明");
  if (!/[\u3400-\u9fff]/.test(content.meaningZh) || (content.cloze.prompt.match(/___/g)||[]).length!==1 || !content.cloze.answers.some(a=>normalizePhrase(content.cloze.prompt.replace("___",a))===normalizePhrase(content.example))) throw new PhraseError("填空需要与例句一致，且只能包含一个空格。");
  if (!containsPhrase(content.example, content.sentencePatterns)) throw new PhraseError("例句缺少提供的目标表达结构。");
  return content;
}
