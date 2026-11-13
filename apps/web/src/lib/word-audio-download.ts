/** One bounded request at a time; a server cooldown suppresses subsequent calls. */
export class WordAudioDownloader {
  cooldownUntil = 0;
  private busy = false;
  async get(url: string, transport: typeof fetch = fetch, now: () => number = Date.now): Promise<Uint8Array | null> {
    const location = new URL(url);
    if (location.protocol !== "https:" || location.host !== "upload.wikimedia.org" || !location.pathname.startsWith("/wikipedia/commons/") || location.username || location.password) return null;
    if (this.busy || now() < this.cooldownUntil) return null;
    this.busy = true;
    try {
      const response = await transport(url, { redirect: "error", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "EnglishLearning/0.2 (word pronunciation cache; Wikimedia attribution retained)" } });
      if (response.status === 429) {
        const retry = response.headers.get("retry-after") || "60";
        const seconds = Number(retry);
        this.cooldownUntil = Number.isFinite(seconds) ? now() + Math.max(1, seconds) * 1000 : Math.max(now() + 60_000, Date.parse(retry) || 0);
        return null;
      }
      if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 2 * 1024 * 1024) return null;
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.length;
        if (length > 2 * 1024 * 1024) { await reader.cancel(); return null; }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS" ? bytes : null;
    } catch { return null; }
    finally { this.busy = false; }
  }
}
