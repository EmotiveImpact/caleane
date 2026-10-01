import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCENT_PRESETS,DEFAULT_ACCENT,accentContrast,usableAccent} from '../src/lib/accent-theme.js';

test('every studio accent preset remains readable on white', () => {
  assert.equal(ACCENT_PRESETS.length, 8);
  assert.equal(new Set(ACCENT_PRESETS.map(preset => preset.value)).size, ACCENT_PRESETS.length);
  for (const preset of ACCENT_PRESETS) assert.ok(accentContrast(preset.value) >= 4.5, preset.name);
});

test('custom accent validation preserves dark colours and rejects unreadable colours', () => {
  assert.equal(usableAccent('#604852'), '#604852');
  assert.equal(usableAccent('#FFFFFF'), DEFAULT_ACCENT);
  assert.equal(usableAccent('invalid'), DEFAULT_ACCENT);
});
