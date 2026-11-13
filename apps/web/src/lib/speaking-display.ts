export const SPEAKING_DISPLAY_COOKIE = "english_speaking_display";

export interface SpeakingDisplayPreferences {
  showPhonemeDetails: boolean;
  showTranscriptCorrection: boolean;
  showParagraphHistory: boolean;
}

export const DEFAULT_SPEAKING_DISPLAY: SpeakingDisplayPreferences = {
  showPhonemeDetails: false,
  showTranscriptCorrection: false,
  showParagraphHistory: false,
};

export function isSpeakingDisplayPreferences(value: unknown): value is SpeakingDisplayPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return Object.keys(DEFAULT_SPEAKING_DISPLAY).every(key => typeof settings[key] === "boolean");
}

export function parseSpeakingDisplay(value: string | undefined): SpeakingDisplayPreferences {
  try {
    const parsed: unknown = JSON.parse(value || "null");
    if (isSpeakingDisplayPreferences(parsed)) return {
      showPhonemeDetails: parsed.showPhonemeDetails,
      showTranscriptCorrection: parsed.showTranscriptCorrection,
      showParagraphHistory: parsed.showParagraphHistory,
    };
  } catch { /* Invalid or older preferences use the quiet defaults. */ }
  return { ...DEFAULT_SPEAKING_DISPLAY };
}
