import type { ListeningRole } from "./tts-voices";
export type ListeningSpeechTurn = { text: string; role?: ListeningRole };
/** Preserve speaker boundaries; never send the labels themselves to TTS. */
export function listeningRoleChunks(paragraphs: string[], useRoles = true): ListeningSpeechTurn[] {
  const chunks: ListeningSpeechTurn[] = [];
  for (const paragraph of paragraphs) {
    for (const turn of paragraph.split(/\r?\n(?=\s*[ABC]\s*[:：])/)) {
      const match = turn.trim().match(/^([ABC])\s*[:：]\s*([\s\S]*)$/);
      const role = useRoles && match ? match[1] as ListeningRole : undefined;
      let remaining = (match ? match[2] : turn).trim();
      while (remaining) {
        let split = remaining.length;
        if (split > 1800) { const boundary = remaining.lastIndexOf(" ", 1800); split = boundary > 0 ? boundary : 1800; }
        const text = remaining.slice(0, split), previous = chunks.at(-1);
        if (previous && previous.role === role && previous.text.length + text.length + 2 <= 1800) previous.text += "\n\n" + text;
        else chunks.push({ text, ...(role ? { role } : {}) });
        remaining = remaining.slice(split).trim();
      }
    }
  }
  return chunks;
}
/** Compatibility for callers that explicitly need one voice. */
export function listeningSpeechChunks(paragraphs: string[]) {
  return listeningRoleChunks(paragraphs, false).map((chunk) => chunk.text);
}
