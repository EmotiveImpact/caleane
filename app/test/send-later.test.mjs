import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Element','Node'])Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
const compiled=fileURLToPath(new URL(`.send-later-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/ProjectChat.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,outdir:'out',loader:{'.css':'empty'}});
await writeFile(compiled,output.outputFiles.find(file=>file.path.endsWith('.js')).text);
const {laterChoices}=await import(pathToFileURL(compiled));
after(async()=>{await unlink(compiled);dom.window.close();});
const offered=from=>laterChoices(from).map(choice=>`${choice.label} ${choice.at.toLocaleDateString('en-GB',{weekday:'short'})} ${choice.at.getHours()}:00`);

test('send later never offers a weekend morning',()=>{
 assert.deepEqual(offered(new Date(2026,9,7,10)),['This afternoon Wed 14:00','Tomorrow morning Thu 9:00','Monday morning Mon 9:00'],'a Wednesday');
 assert.deepEqual(offered(new Date(2026,9,9,16)),['Monday morning Mon 9:00'],'a Friday afternoon skips Saturday');
 assert.deepEqual(offered(new Date(2026,9,10,10)),['This afternoon Sat 14:00','Monday morning Mon 9:00'],'a Saturday skips Sunday');
 assert.deepEqual(offered(new Date(2026,9,11,18)),['Tomorrow morning Mon 9:00'],'a Sunday offers Monday once');
});
