import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDay, dayDate, todayISO, daysFromToday } from '../src/lib/dates.js';

test('calendar dates read at local midday so they never show a day early', () => {
  assert.equal(formatDay('2026-11-02'), '2 Nov 2026');
  assert.equal(dayDate('2026-11-02').getDate(), 2);
  assert.equal(formatDay('', 'To be decided'), 'To be decided');
  assert.equal(formatDay('not a date', '—'), '—');
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date(); d.setDate(d.getDate() + 14);
  assert.equal(daysFromToday(14), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
});
