import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const web = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = web('typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../../apps/web/src/components/vocabulary/WordAudio.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText + '\nexports.TestPlayer=WordAudioPlayer;';
const settle = () => new Promise(resolve => setImmediate(resolve));
const voice = { id: 'a', word: 'example', audioUrl: '/api/vocabulary/audio/a?word=example', accent: 'us', pos: ['noun'], file: 'example.ogg', author: 'Test author', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.ogg', processing: 'Original recording; no audio modification' };
const response = value => ({ ok: true, headers: new Headers({ 'content-type': 'audio/ogg', 'x-tts-engine': 'kokoro' }), json: async () => value, blob: async () => new Blob(['fixture']) });
let nextId = 0;
function harness({ choices = { recordings: [voice], preferredId: 'a', needsSelection: false }, mode = 'word', autoPlay = true, download = true, reply, window = new EventTarget() } = {}) {
  const slots = [], effects = [], calls = [], revoked = [];
  let cursor = 0, active = true, count = 0;
  const owner = 'player-' + nextId++;
  const audio = { src: '', readyState: 2, currentTime: 0, paused: true, plays: 0, failPlay: false, pause() { this.paused = true; }, play() { this.plays++; if (this.failPlay) return Promise.reject(new Error('Gesture required')); this.paused = false; return Promise.resolve(); } };
  const hooks = {
    useId: () => owner,
    useRef(initial) { const k = cursor++; return slots[k] ??= { current: initial }; },
    useState(initial) { const k = cursor++; slots[k] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[k].value, value => { if (active) slots[k].value = typeof value === 'function' ? value(slots[k].value) : value; }]; },
    useCallback(action, deps) { const k = cursor++, old = slots[k]; if (!old || deps.some((value, i) => value !== old.deps[i])) slots[k] = { action, deps }; return slots[k].action; },
    useEffect(action, deps) { const k = cursor++, old = slots[k]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); slots[k] = { deps }; effects.push(() => { slots[k].cleanup = action(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props, key }), exports = {};
  runInNewContext(compiled, { exports, Event, CustomEvent, AbortController, window, URL: { createObjectURL: () => 'blob:test-' + ++count, revokeObjectURL: value => revoked.push(value) },
    fetch(url, options) { calls.push({ url, ...options }); return reply ? reply(url, options) : Promise.resolve(response(url.startsWith('/api/vocabulary/audio?') ? choices : null)); },
    require(name) { if (name === 'react') return hooks; if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }; if (name.includes('UiLocale')) return { useUiLocale: () => ({ locale: 'en', t: value => value }) }; if (name.includes('useTtsVoiceRevision')) return { useTtsVoiceRevision: () => '' }; throw Error(name); },
  });
  return { calls, audio, revoked, window,
    render() { cursor = 0; const tree = exports.TestPlayer({ text: 'example', label: 'Listen', mode, autoPlay, accent: 'us', download }); const tag = find(tree, value => value.type === 'audio'); if (tag) { audio.src = tag.props.src; tag.props.ref(audio); } effects.splice(0).forEach(effect => effect()); return tree; },
    loaded(tree) { find(tree, value => value.type === 'audio')?.props.onLoadedData(); },
    unmount() { active = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function find(tree, predicate) { if (!tree || typeof tree !== 'object') return null; if (predicate(tree)) return tree; for (const child of [tree.props?.children].flat(Infinity)) { const value = find(child, predicate); if (value) return value; } return null; }

test('entering a word plays a recording once; replay reuses the same blob', async () => {
  const h = harness(); h.render(); await settle(); let tree = h.render(); h.loaded(tree); await settle();
  assert.equal(h.audio.plays, 1); assert.equal(h.calls.length, 2); h.render(); assert.equal(h.audio.plays, 1);
  find(tree, value => value.type === 'button').props.onClick(); await settle(); h.render();
  assert.equal(h.audio.plays, 2); assert.equal(h.calls.length, 2);
  h.unmount(); assert.equal(h.audio.paused, true); assert.equal(h.revoked.length, 1);
});
test('auto-play off prepares metadata but never downloads or plays audio until requested', async () => {
  const h = harness({ autoPlay: false }); h.render(); await settle(); const tree = h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.audio.plays, 0);
  find(tree, value => value.type === 'button').props.onClick(); await settle(); const next = h.render(); h.loaded(next);
  assert.equal(h.audio.plays, 1); h.unmount();
});

test('pre-generated audio plays locally and is labelled as synthesized rather than a human recording', async () => {
  const synthetic = { ...voice, kind: 'synthesized', voiceLabel: 'Original English reference', cached: true };
  const h = harness({ choices: { recordings: [synthetic], preferredId: 'a', needsSelection: false } });
  h.render(); await settle(); const tree = h.render(); h.loaded(tree);
  assert.equal(h.audio.plays, 1);
  assert.equal(h.calls.length, 2);
  assert.ok(JSON.stringify(tree).includes('Kokoro · pre-generated'));
  assert.ok(!JSON.stringify(tree).includes('Wikimedia Commons'));
  assert.ok(!JSON.stringify(tree).includes('Recorded voice'));
  h.unmount();
});
test('a missing recording uses Kokoro, while sentence audio bypasses the word catalog', async () => {
  const h = harness({ choices: { recordings: [], preferredId: null, needsSelection: false } }); h.render(); await settle(); const tree = h.render(); h.loaded(tree);
  assert.equal(h.calls[1].url, '/api/reference-audio/generate'); assert.equal(h.audio.plays, 1); h.unmount();
  const sentence = harness({ mode: 'tts', autoPlay: false }); const initial = sentence.render(); assert.equal(sentence.calls.length, 0);
  find(initial, value => value.type === 'button').props.onClick(); await settle();
  assert.equal(sentence.calls.length, 1); assert.equal(sentence.calls[0].url, '/api/reference-audio/generate'); sentence.unmount();
});
test('heteronyms wait for a user pronunciation choice instead of auto-playing an arbitrary variant', async () => {
  const h = harness({ choices: { recordings: [voice, { ...voice, id: 'b' }], preferredId: null, needsSelection: true } }); h.render(); await settle(); let tree = h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.audio.plays, 0);
  find(tree, value => value.type === 'select').props.onChange({ target: { value: 'a' } }); await settle(); tree = h.render(); h.loaded(tree);
  assert.equal(h.audio.plays, 1); h.unmount();
});

test('Kokoro lexical variants work with downloads disabled and preserve the selected reading', async () => {
  const synthetic = {...voice, kind: 'synthesized', engine: 'kokoro', voiceLabel: 'Heart', cached: false, localSynthesis: true};
  const h = harness({download: false, choices: {recordings: [synthetic, {...synthetic, id: 'b', audioUrl: '/api/vocabulary/audio/b?word=example'}], preferredId: null, needsSelection: true}});
  h.render(); await settle(); let tree = h.render();
  assert.equal(h.calls.length, 1);
  find(tree, value => value.type === 'select').props.onChange({target: {value: 'b'}});
  await settle(); tree = h.render(); h.loaded(tree);
  assert.equal(h.calls[1].url, '/api/vocabulary/audio/b?word=example&download=0');
  assert.equal(h.audio.plays, 1);
  assert.ok(JSON.stringify(tree).includes('Kokoro · synthesized'));
  assert.ok(!h.calls.some(call => call.url === '/api/reference-audio/generate'), 'must not replace the selected lexical reading with a default pronunciation');
  h.unmount();
});
test('stopping for recording cancels delayed auto-play even if metadata arrives later', async () => {
  let resolve; const h = harness({ reply: () => new Promise(done => { resolve = done; }) }); h.render();
  h.window.dispatchEvent(new Event('english-stop-word-audio')); resolve(response({ recordings: [voice], preferredId: 'a', needsSelection: false })); await settle(); h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.audio.plays, 0); h.unmount();
});
test('unmounting aborts pending requests and a blocked autoplay offers manual retry', async () => {
  const pending = harness({ reply: () => new Promise(() => {}) }); pending.render(); pending.unmount(); assert.equal(pending.calls[0].signal.aborted, true);
  const h = harness(); h.audio.failPlay = true; h.render(); await settle(); let tree = h.render(); h.loaded(tree); await settle(); tree = h.render();
  assert.ok(JSON.stringify(tree).includes('Select Replay')); h.audio.failPlay = false;
  find(tree, value => value.type === 'button').props.onClick(); await settle(); h.render(); assert.equal(h.audio.plays, 2); assert.equal(h.calls.length, 2); h.unmount();
});
