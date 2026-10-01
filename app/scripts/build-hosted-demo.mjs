import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
// Vercel's runtime disables require(ESM). Bundle the sanitizer and its ESM
// parser together, keeping the current security fixes and native PDF assets.
await build({
  absWorkingDir: root.pathname,
  entryPoints: ['hosted-demo.mjs'],
  outfile: 'hosted-demo-runtime.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(name => name !== 'sanitize-html'),
  banner: { js: "import { createRequire as runtimeCreateRequire } from 'node:module'; const require = runtimeCreateRequire(import.meta.url);" },
});
