import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './build-ui.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
// Working pages for the studio, kept in the repo for local preview but never published.
const internal = new Set([
  'audience-mock.html', 'audience-mock.css', 'product-review.css', 'product-review.js',
  'design-reference.html', 'reference.css', 'reference.js',
  'pricing-research.html',
]);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && !internal.has(entry.name) && /\.(html|css|js|svg|ico|txt|xml|webmanifest)$/.test(entry.name)) {
    await cp(join(root, entry.name), join(output, entry.name));
  }
}
for (const directory of ['assets', 'partials']) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}
console.log('Built public website in dist/');

// The Radix islands share this stylesheet; keep authored JSX out of the public build.
await mkdir(join(output, 'ui'), { recursive: true });
await cp(join(root, 'ui/website-ui.css'), join(output, 'ui/website-ui.css'));
