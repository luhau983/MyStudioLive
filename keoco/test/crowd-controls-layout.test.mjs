import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('audio controls live on the control panel, never on the broadcast overlay', () => {
  const overlay = readFileSync(new URL('../overlay.html', import.meta.url), 'utf8');
  const control = readFileSync(new URL('../control.html', import.meta.url), 'utf8');
  assert.doesNotMatch(overlay, /crowd-controls|<button|<input/);
  for (const id of ['audio-volume', 'audio-mute', 'audio-test', 'audio-status']) assert.match(control, new RegExp(`id="${id}"`));
});
