// Run from the repository root with --import ./deployment/framework/register.mjs.
// This test uses synthetic media in an isolated directory; it never downloads
// or writes into the installed application's word-audio cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const parent = path.join(root, '.impeccable/review/word-audio-20261024');
await fs.mkdir(parent, { recursive: true });
const isolated = await fs.mkdtemp(path.join(parent, 'cache-proof-'));
process.env.ENGLISH_DATA_DIR = isolated;
process.env.ENGLISH_WORD_AUDIO_DIR = path.join(root, 'deployment/word-audio');
process.env.ENGLISH_WORD_TTS_DIR = path.join(isolated, 'no-generated-pack');
const { wordAudioChoices, wordAudioFile } = await import(pathToFileURL(path.join(root, 'apps/web/src/lib/word-audio-store.ts')));

test('a downloaded recording is cached with credits, then remains usable without network access', async () => {
  const choices = wordAudioChoices('abandon', 'us');
  const selected = choices.recordings.find(recording => recording.id === choices.preferredId);
  assert.ok(selected && !selected.cached);
  const original = globalThis.fetch;
  let calls = 0;
  // Synthetic OGG signature for storage/integrity checks, not a playable sample.
  globalThis.fetch = async url => {
    assert.equal(url, selected.url); calls++;
    return new Response(Buffer.from('OggS synthetic cache fixture'), { headers: { 'content-type': 'audio/ogg' } });
  };
  try {
    const downloaded = await wordAudioFile('abandon', selected.id);
    assert.ok(downloaded?.bytes.length);
    const sidecar = JSON.parse(await fs.readFile(path.join(isolated, 'word-audio-cache', selected.id + '.json'), 'utf8'));
    assert.equal(sidecar.author, selected.author);
    assert.equal(sidecar.licenseUrl, selected.licenseUrl);
    assert.equal(sidecar.sourceUrl, selected.sourceUrl);
    assert.equal(sidecar.sha256, downloaded.hash);
    globalThis.fetch = async () => { throw new Error('network must not be needed'); };
    const offline = await wordAudioFile('abandon', selected.id, false);
    assert.deepEqual(Buffer.from(offline.bytes), Buffer.from(downloaded.bytes));
    assert.equal(calls, 1);
    assert.equal(wordAudioChoices('abandon', 'us', false).preferredId, selected.id);
    assert.equal(await wordAudioFile('bond', selected.id, false), null);
  } finally { globalThis.fetch = original; }
});

test('a changed cached recording is rejected instead of being played under its previous checksum', async () => {
  const selected = wordAudioChoices('abandon', 'us', false).preferredId;
  assert.ok(selected);
  await fs.writeFile(path.join(isolated, 'word-audio-cache', selected + '.ogg'), Buffer.from('OggS changed fixture'));
  assert.equal(await wordAudioFile('abandon', selected, false), null);
});
