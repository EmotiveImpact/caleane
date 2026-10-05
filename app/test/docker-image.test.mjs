import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkImage} from '../scripts/check-image-imports.mjs';

test('the runtime image copies every module the server and its scripts import',()=>{
 const {modules,problems}=checkImage();
 assert.deepEqual(problems,[]);
 assert.ok(modules.includes('server.mjs')&&modules.includes('store.mjs')&&modules.includes('src/lib/workflows.js'));
});

test('the image check catches a runtime stage that leaves server modules behind',()=>{
 const partial='FROM node:22 AS build\nFROM node:22\nCOPY --from=build /app/dist ./dist\nCOPY --from=build /app/server.mjs /app/store.mjs ./\n';
 const {problems}=checkImage({dockerfile:partial,entries:['server.mjs']});
 assert.ok(problems.some(p=>p.startsWith('forms.mjs')));
 assert.ok(problems.some(p=>p.startsWith('public/embed.js')));
});

test('the runtime image runs unprivileged with a data volume and a public bind',async()=>{
 const dockerfile=await readFile(new URL('../Dockerfile',import.meta.url),'utf8'),runtime=dockerfile.split(/^FROM\s/m).at(-1);
 assert.match(runtime,/^VOLUME \/app\/data$/m);
 assert.match(runtime,/^USER node$/m);
 assert.match(runtime,/chown node:node \/app\/data/);
 assert.match(runtime,/HOST=0\.0\.0\.0/);
 assert.match(runtime,/APP_ORIGIN/);
});
