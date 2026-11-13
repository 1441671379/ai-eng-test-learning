import { messages } from "./catalog";
export type UiLocale = "zh-CN" | "en";
export const LOCALE_COOKIE = "english_ui_locale";
export function parseLocale(value: unknown): UiLocale { return value === "en" ? "en" : "zh-CN"; }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(messages).filter(([source]) => source.includes("{{")).map(([source, value]) => ({
  value, specificity: source.replace(/\{\{\d+\}\}/g, "").length,
  regex: new RegExp("^" + source.split(/\{\{\d+\}\}/).map(escape).join("([\\s\\S]*?)") + "$"),
// A full status sentence must win over a shorter pattern with the same prefix.
})).sort((a, b) => b.specificity - a.specificity);
export function translate(text: string, locale: UiLocale): string {
  const source = text.trim();
  const entry = messages[source];
  let output = entry?.[locale];
  if (output === undefined) for (const pattern of patterns) {
    const match = source.match(pattern.regex);
    if (match) { output = pattern.value[locale].replace(/\{\{(\d+)\}\}/g, (_, index: string) => match[Number(index) + 1] ?? ""); break; }
  }
  return output === undefined ? text : text.slice(0, text.length - text.trimStart().length) + output + text.slice(text.trimEnd().length);
}
