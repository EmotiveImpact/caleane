import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './build-ui.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && /\.(html|css|js|svg|ico|txt|xml|webmanifest)$/.test(entry.name)) {
    await cp(join(root, entry.name), join(output, entry.name));
  }
}
for (const directory of ['assets', 'partials']) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}
console.log('Built public website in dist/');
