import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { getTtsVoiceOptions, setTtsVoice, ttsVoiceSnapshot } from '../../apps/web/src/lib/tts-voices.ts';
registerHooks({ resolve(specifier, context, next) { return next(specifier === 'next/headers' ? 'next/headers.js' : specifier, context); } });
const { listeningAudio } = await import('../../apps/web/src/lib/listening-audio.ts');

test('Kokoro settings, role snapshots and caches stay isolated from legacy voices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'english-kokoro-'));
  const previous = process.env.ENGLISH_TTS_CONFIG, originalFetch = globalThis.fetch;
  try {
    await mkdir(join(root, 'models'));
    for (const file of ['config.json', 'kokoro-v1_0.pth', 'af_heart.pt', 'am_puck.pt']) await writeFile(join(root, 'models', file), 'fixture');
    const voices = Object.fromEntries(['af_heart', 'am_puck'].map(id => [id, {label: id, version: '1.0', voice: {voice_file: 'models/' + id + '.pt', lang_code: 'a'}}]));
    process.env.ENGLISH_TTS_CONFIG = join(root, 'settings.json');
    await writeFile(process.env.ENGLISH_TTS_CONFIG, JSON.stringify({provider: 'kokoro', default_voice: 'af_heart', speed: 1, model_dir: 'models', selection_file: 'selection.json', voices}));
    await writeFile(join(root, 'selection.json'), JSON.stringify({voiceId: 'english-reference', roleVoices: {A: 'furina-en'}}));
    const options = await getTtsVoiceOptions();
    assert.equal(options.provider, 'kokoro');
    assert.equal(options.selectedVoiceId, 'af_heart');
    assert.equal(options.roleVoices.A, '');
    await setTtsVoice('af_heart', {A: 'af_heart', B: 'am_puck', C: ''});
    await assert.rejects(() => setTtsVoice('../voice'), TypeError);
    const before = await ttsVoiceSnapshot();
    const wav = Buffer.alloc(244); wav.write('RIFF'); wav.writeUInt32LE(236, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24);
    wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(200, 40);
    const calls = [];
    globalThis.fetch = async (_url, request) => {
      calls.push(request.body.get('voice_id'));
      if (calls.length === 1) await setTtsVoice('am_puck', {A: 'am_puck', B: 'af_heart', C: ''});
      return new Response(wav, {headers: {'x-tts-engine': 'kokoro'}});
    };
    const request = new Request('http://localhost/api/listening/test/audio');
    const paragraphs = ['A: Welcome to the interview.', 'B: Thank you for inviting me.'];
    const first = await listeningAudio(request, join(root, 'article.wav'), paragraphs, 'interview');
    assert.equal(first.headers.get('x-tts-engine'), 'kokoro');
    assert.deepEqual(calls, ['af_heart', 'am_puck']);
    assert.deepEqual(JSON.parse(first.headers.get('x-tts-roles')), {A: 'af_heart', B: 'am_puck'});
    await listeningAudio(request, join(root, 'article.wav'), paragraphs, 'interview');
    assert.equal(calls.length, 4, 'a different role assignment creates new article audio');
    await listeningAudio(request, join(root, 'article.wav'), paragraphs, 'interview');
    assert.equal(calls.length, 4, 'unchanged voices reuse cached article audio');
    await setTtsVoice('af_heart');
    await writeFile(join(root, 'models/kokoro-v1_0.pth'), 'updated-model');
    assert.notEqual((await ttsVoiceSnapshot()).cacheKey, before.cacheKey, 'model updates invalidate the cache');
    globalThis.fetch = async () => new Response(wav, {headers: {'x-tts-engine': 'gpt-sovits'}});
    await assert.rejects(() => listeningAudio(request, join(root, 'wrong-engine.wav'), paragraphs, 'interview'));
    assert.equal(JSON.parse(await readFile(join(root, 'selection.json'), 'utf8')).voiceId, 'af_heart');
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.ENGLISH_TTS_CONFIG; else process.env.ENGLISH_TTS_CONFIG = previous;
    await rm(root, {recursive: true, force: true});
  }
});
