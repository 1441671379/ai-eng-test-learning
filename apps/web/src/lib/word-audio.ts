import { wordKey } from "./vocabulary";

export type WordAccent = "us" | "uk";
export interface VocabularyAudioSettings { autoPlay: boolean; accent: WordAccent; download: boolean }
export function vocabularyAudioSettings(input: unknown): VocabularyAudioSettings {
  const value = input as Partial<VocabularyAudioSettings> | null;
  return { autoPlay: typeof value?.autoPlay === "boolean" ? value.autoPlay : true, accent: value?.accent === "uk" ? "uk" : "us", download: typeof value?.download === "boolean" ? value.download : false };
}
export interface WordRecording {
  id: string; word: string; file: string; relativePath: string; bytes: number; sha256: string;
  accent: "us" | "uk" | "other"; pos: string[]; label: string; ipa: string;
  author: string; license: string; licenseUrl: string; sourceUrl: string; processing: string;
  credit?: string; attribution?: string;
  url?: string; cached?: boolean;
  kind?: "recorded" | "synthesized"; engine?: string; voiceId?: string; voiceLabel?: string;
  referencePhones?: string[]; localSynthesis?: boolean;
}
export interface WordAudioChoices { recordings: WordRecording[]; preferredId: string | null; needsSelection: boolean }
const heteronyms = new Set(["record", "read", "lead", "bow", "wind", "tear", "close", "live", "minute", "present", "object", "produce", "refuse", "invalid", "desert", "content", "conduct", "permit", "project", "subject", "progress", "contract", "export", "import"]);

export function chooseWordAudio(recordings: WordRecording[], accent: WordAccent): WordAudioChoices {
  const ranked = [...recordings].sort((a, b) => Number(b.accent === accent) - Number(a.accent === accent) || Number(a.accent === "other") - Number(b.accent === "other") || a.file.localeCompare(b.file));
  const preferred = ranked[0];
  const sameAccent = preferred ? ranked.filter(item => item.accent === preferred.accent) : [];
  const needsSelection = Boolean(preferred && (preferred.kind === "synthesized" || heteronyms.has(wordKey(preferred.word))) && sameAccent.length > 1);
  return { recordings: ranked, preferredId: needsSelection ? null : preferred?.id ?? null, needsSelection };
}

