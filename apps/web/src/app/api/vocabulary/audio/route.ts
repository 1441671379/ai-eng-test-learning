import { vocabularyUser, vocabularyJson, vocabularyError } from "@/lib/vocabulary-api";
import { cleanWord, VocabularyError } from "@/lib/vocabulary";
import { chooseWordAudio } from "@/lib/word-audio";
import { wordAudioChoices } from "@/lib/word-audio-store";
import { getTtsVoiceOptions } from "@/lib/tts-voices";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const params = new URL(request.url).searchParams, word = cleanWord({ word: params.get("word") ?? "" }).word;
    const accent = params.get("accent") || "us";
    if (accent !== "us" && accent !== "uk") throw new VocabularyError("请选择优先美音或优先英音。");
    let choices = wordAudioChoices(word, accent, params.get("download") !== "0");
    const voice = await getTtsVoiceOptions();
    // Old generated packs remain on disk for the control environment. New playback
    // follows the active engine and voice instead of silently replaying old TTS.
    choices = chooseWordAudio(choices.recordings.map(item => item.kind === 'synthesized' && voice.provider === 'kokoro'
      ? {...item, engine: 'kokoro', voiceId: voice.selectedVoiceId, voiceLabel: voice.voiceLabel, cached: false, localSynthesis: true}
      : item), accent);
    return vocabularyJson({ ...choices, recordings: choices.recordings.map(item => ({ id: item.id, word: item.word, file: item.file, accent: item.accent, pos: item.pos, label: item.label, ipa: item.ipa, author: item.author, license: item.license, licenseUrl: item.licenseUrl, sourceUrl: item.sourceUrl, processing: item.processing, credit: item.credit, attribution: item.attribution, kind: item.kind, engine: item.engine, voiceId: item.voiceId, voiceLabel: item.voiceLabel, cached: item.cached, localSynthesis: item.localSynthesis, audioUrl: `/api/vocabulary/audio/${item.id}?word=${encodeURIComponent(word)}` })) });
  } catch (error) { return vocabularyError(error); }
}
