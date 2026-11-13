import { vocabularyUser, vocabularyError } from "@/lib/vocabulary-api";
import { cleanWord } from "@/lib/vocabulary";
import { wordAudioFile } from "@/lib/word-audio-store";
import { lexicalPronunciations } from '@/lib/word-pronunciations';
import { ttsVoiceSnapshot } from '@/lib/tts-voices';
import { referenceSpeech } from '@/lib/speech/reference';
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await vocabularyUser(request); if (typeof userId !== "string") return userId;
  try {
    const { id } = await context.params;
    const word = cleanWord({ word: new URL(request.url).searchParams.get("word") ?? "" }).word;
    const voice = await ttsVoiceSnapshot();
    const lexical = lexicalPronunciations(word).find(item => item.id === id);
    if (lexical) return await referenceSpeech(request, word, voice.voiceId, undefined, lexical.referencePhones?.join(' '));
    const audio = await wordAudioFile(word, id, new URL(request.url).searchParams.get("download") !== "0");
    if (!audio) return Response.json({ error: "本地单词音频暂不可用。" }, { status: 404 });
    return new Response(new Uint8Array(audio.bytes), { headers: { "Content-Type": "audio/ogg", "Content-Length": String(audio.bytes.length), "Cache-Control": "private, max-age=86400", "ETag": `"${audio.hash}"`, "X-Audio-Source": "wikimedia-commons" } });
  } catch (error) { return vocabularyError(error); }
}
