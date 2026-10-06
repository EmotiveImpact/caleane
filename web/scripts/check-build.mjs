import { access, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
if (!pages.length) throw new Error('No HTML pages were built.');
const missing = [];
for (const page of pages) {
  const html = await readFile(join(root, page), 'utf8');
  for (const [, reference] of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(reference, 'https://build.invalid/');
    if (url.origin !== 'https://build.invalid' || !url.pathname || reference.startsWith('#')) continue;
    const target = resolve(root, '.' + decodeURIComponent(url.pathname));
    try { await access(target); } catch { missing.push(`${page}: ${reference}`); }
  }
}
if (missing.length) throw new Error('Missing built page resources:\n' + missing.join('\n'));
console.log(`Checked built resources for ${pages.length} pages.`);
