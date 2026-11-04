import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('player heads have hair but no team headband geometry or material', async () => {
  const stage = await readFile(new URL('../stage3d.js', import.meta.url), 'utf8');
  assert.match(stage, /addCharacterHair\(headGroup,/);
  assert.doesNotMatch(stage, /\bbandGeo\b|\blook\.band\b|\bband\s*:\s*mat\(/);
});
