import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['ui/website-ui.jsx'],
  outfile: resolve(root, 'assets/website-ui.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
  metafile: true,
}).then(async result => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(resolve(root, 'ui/build-manifest.json'), JSON.stringify(result.metafile, null, 2));
  console.log('Built assets/website-ui.js');
});
