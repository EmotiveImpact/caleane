#!/usr/bin/env node
// Builds the client once when dist/index.html is missing, so a fresh `npm test` can serve the app.
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
if(existsSync(new URL('../dist/index.html',import.meta.url)))process.exit(0);
console.log('dist/index.html is missing, building the client first.');
const windows=process.platform==='win32';
const result=spawnSync(windows?'npm.cmd':'npm',['run','build'],{cwd:root,stdio:'inherit',shell:windows});
process.exit(result.status??1);
