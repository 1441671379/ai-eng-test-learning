import test from 'node:test';
import assert from 'node:assert/strict';
import { lexicalPronunciations } from '../../apps/web/src/lib/word-pronunciations.ts';
import { chooseWordAudio } from '../../apps/web/src/lib/word-audio.ts';

test('lexical alternatives remain available without any old recordings or model assets', () => {
  const entries = lexicalPronunciations('read');
  assert.ok(entries.length >= 2);
  assert.equal(new Set(entries.map(item => item.referencePhones.join(' '))).size, entries.length);
  assert.ok(entries.every(item => item.localSynthesis && !item.cached && item.engine === 'kokoro'));
  assert.ok(entries.every(item => /^[a-f0-9]{64}$/.test(item.id)));
  assert.equal(chooseWordAudio(entries, 'us').needsSelection, true);
  assert.equal(chooseWordAudio(entries, 'us').preferredId, null);
});

test('ordinary words without lexical overrides use the normal synthesis path', () => {
  assert.deepEqual(lexicalPronunciations('newlyinventedtestword'), []);
});
