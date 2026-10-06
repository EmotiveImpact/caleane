import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { entryScript } from '../src/lib/app-version.js';

test('reads the entry script from the built page so open tabs can spot a new deploy', async () => {
  const built = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(entryScript(built), /^\/assets\/index-[\w-]+\.js$/);
  assert.equal(entryScript('<script type="module" crossorigin src="/assets/index-AbC123.js"></script>'), '/assets/index-AbC123.js');
  assert.equal(entryScript('<script type="module" src="/src/entry.jsx"></script>'), '');
  assert.equal(entryScript('<p>Not found.</p>'), '');
});
