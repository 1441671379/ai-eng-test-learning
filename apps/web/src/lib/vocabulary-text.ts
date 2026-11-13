/** Text shared by selection capture and server-side source verification. */
export function normalizeVocabularyText(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[‐‑]/g, "-");
}

export function selectedVocabularyWord(text: string): string {
  const word = normalizeVocabularyText(text).trim().replace(/\s+/g, " ").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  return /^[A-Za-z][A-Za-z' -]{0,79}$/.test(word) && word.split(" ").length <= 8 ? word : "";
}

function wordMatch(text: string, word: string) {
  const normalized = normalizeVocabularyText(word).trim();
  if (!normalized) return null;
  const escaped = normalized.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  return new RegExp(`(^|[^A-Za-z])(${escaped})($|[^A-Za-z])`, "i").exec(normalizeVocabularyText(text));
}

export function containsVocabularyWord(text: string, word: string): boolean {
  return wordMatch(text, word) !== null;
}

/** Keep the selected occurrence in view without exceeding the card/source limit. */
export function vocabularyExcerpt(text: string, word: string): string {
  const match = wordMatch(text, word);
  if (!match) return "";
  const index = match.index + match[1].length;
  const start = Math.max(0, Math.min(index - 1000, text.length - 2500));
  return text.slice(start, start + 2500);
}
