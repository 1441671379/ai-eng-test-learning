import test from "node:test";
import assert from "node:assert/strict";
import { WordAudioDownloader } from "../src/lib/word-audio-download.ts";
const url = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.ogg";

test("remote audio honours the server's full cooldown without retrying other words", async () => {
  const downloader = new WordAudioDownloader(); let calls = 0, time = 1000;
  const transport = (async () => { calls++; return new Response(null, { status: 429, headers: { "retry-after": "600" } }); }) as typeof fetch;
  assert.equal(await downloader.get(url, transport, () => time), null);
  assert.equal(downloader.cooldownUntil, 601000);
  time += 599000; await downloader.get(url, transport, () => time); assert.equal(calls, 1);
  time += 1001; await downloader.get(url, transport, () => time); assert.equal(calls, 2);
});
test("only the known HTTPS media host is eligible, without redirects or arbitrary URLs", async () => {
  const downloader = new WordAudioDownloader(); let calls = 0;
  const transport = (async (_input, options) => { calls++; assert.equal(options?.redirect, "error"); return new Response("OggSfixture"); }) as typeof fetch;
  for (const target of ["http://upload.wikimedia.org/wikipedia/commons/x", "https://example.com/x", "https://upload.wikimedia.org:8443/wikipedia/commons/x", "https://user:pass@upload.wikimedia.org/wikipedia/commons/x"]) assert.equal(await downloader.get(target, transport), null);
  assert.equal(calls, 0); assert.ok(await downloader.get(url, transport));
});
test("oversized or invalid responses fail safely and do not prevent later requests", async () => {
  const downloader = new WordAudioDownloader();
  assert.equal(await downloader.get(url, (async () => new Response("large", { headers: { "content-length": "5000000" } })) as typeof fetch), null);
  assert.equal(await downloader.get(url, (async () => new Response("<html>no audio</html>")) as typeof fetch), null);
  assert.equal(await downloader.get(url, (async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))) as typeof fetch), null);
  assert.ok(await downloader.get(url, (async () => new Response("OggSvalid")) as typeof fetch));
});
test("concurrent different-word fetches never open multiple media requests", async () => {
  const downloader = new WordAudioDownloader(); let complete: (response: Response) => void = () => {};
  const pending = downloader.get(url, (() => new Promise<Response>(resolve => { complete = resolve; })) as typeof fetch);
  const duplicate = await downloader.get(url, (async () => { throw new Error("must not run"); }) as typeof fetch);
  assert.equal(duplicate, null); complete(new Response("OggSvalid")); assert.ok(await pending);
});
