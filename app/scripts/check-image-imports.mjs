#!/usr/bin/env node
// Static check for the Docker runtime image: every module reachable from the
// image's entry points must be copied by the runtime stage of the Dockerfile,
// and every package it imports must be a production dependency.
// Usage: node scripts/check-image-imports.mjs
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {builtinModules} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
// Bare packages loaded only behind a development flag (server.mjs --dev).
const DEV_ONLY=new Set(['vite']);

function walk(dir){return readdirSync(dir).flatMap(name=>{const full=path.join(dir,name);return statSync(full).isDirectory()?walk(full):[full];});}

/** Files (relative to /app) that the runtime stage copies from the build stage. */
export function imageFiles(dockerfile=readFileSync(path.join(root,'Dockerfile'),'utf8')){
 const stages=dockerfile.split(/^FROM\s/m),runtime=stages.at(-1),files=new Set();
 for(const line of runtime.split('\n')){
  const m=line.match(/^COPY\s+--from=build\s+(.+)$/);if(!m)continue;
  const parts=m[1].trim().split(/\s+/),dest=parts.pop();
  for(const source of parts){
   const rel=source.replace(/^\/app\/?/,'');
   if(rel==='dist'||rel==='node_modules'){files.add(rel+'/');continue;}
   if(rel.includes('*')){const dir=path.dirname(rel),pattern=new RegExp('^'+path.basename(rel).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'[^/]*')+'$');for(const name of readdirSync(path.join(root,dir)))if(pattern.test(name)&&statSync(path.join(root,dir,name)).isFile())files.add(path.posix.join(dir==='.'?'':dir,name));continue;}
   const full=path.join(root,rel);if(!existsSync(full))continue;
   if(statSync(full).isDirectory())for(const file of walk(full))files.add(path.relative(root,file).split(path.sep).join('/'));
   else files.add(dest.endsWith('/')&&dest!=='./'?path.posix.join(dest.replace(/^\.\//,''),path.basename(rel)):rel);
  }
 }
 return files;
}

function importsOf(source){
 const found=[],pattern=/\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
 for(const m of source.matchAll(pattern))found.push({specifier:m[1]||m[2]||m[3],dynamic:!!m[2]});
 return found;
}

export function checkImage({dockerfile,entries=['server.mjs','scripts/mail-worker.mjs','scripts/backup.mjs'],runtimeFiles=['public/embed.js','dist/index.html']}={}){
 const files=imageFiles(dockerfile),pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')),deps=new Set(Object.keys(pkg.dependencies||{})),problems=[],seen=new Set();
 const inImage=rel=>files.has(rel)||[...files].some(f=>f.endsWith('/')&&rel.startsWith(f));
 const queue=[...entries];
 while(queue.length){
  const rel=queue.shift();if(seen.has(rel))continue;seen.add(rel);
  if(!inImage(rel)){problems.push(`${rel} is imported but not copied into the image`);continue;}
  for(const {specifier,dynamic} of importsOf(readFileSync(path.join(root,rel),'utf8'))){
   if(specifier.startsWith('.')){queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel),specifier)));continue;}
   const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];
   if(specifier.startsWith('node:')||builtinModules.includes(name))continue;
   if(deps.has(name))continue;
   if(dynamic&&DEV_ONLY.has(name))continue;
   problems.push(`${rel} imports ${specifier}, which is not a production dependency`);
  }
 }
 for(const rel of runtimeFiles)if(!inImage(rel))problems.push(`${rel} is read at runtime but not copied into the image`);
 return {modules:[...seen],problems};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {modules,problems}=checkImage();
 if(problems.length){for(const problem of problems)console.error(problem);process.exitCode=1;}
 else console.log(`All ${modules.length} modules reachable from the image entry points are copied.`);
}
