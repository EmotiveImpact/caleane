import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('workspace search finds owned records without crossing tenant or client boundaries',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-search-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id,q=`?studio=${studio}`;
  let response=await call('/api/search'+q+'&q=amelia','GET',undefined,'owner');
  assert.equal(response.status,200);
  assert.ok(response.data.groups.some(group=>group.label==='Projects'&&group.items.some(item=>item.title.includes('Amelia'))));
  assert.ok(response.data.groups.some(group=>group.label==='Clients'&&group.items.some(item=>item.title.includes('Amelia'))));
  const scoped=await call('/api/search'+q+'&q=amelia&scope=clients','GET',undefined,'owner');
  assert.equal(scoped.status,200);
  assert.ok(scoped.data.groups.length>0);
  assert.ok(scoped.data.groups.every(group=>group.items.every(item=>item.type==='client')));
  assert.equal(scoped.data.total,scoped.data.groups.reduce((total,group)=>total+group.items.length,0));
  assert.equal((await call('/api/search'+q+'&q=amelia&scope=unknown','GET',undefined,'owner')).status,400);
  assert.equal((await call('/api/search'+q+'&q=amelia','GET',undefined,'client')).status,403);
  const created=await call('/api/projects'+q,'POST',{name:'Quinn Moss',email:'quinn@example.test',occasion:'Ocean archive installation',vision:'Gallery work'},'owner');
  assert.equal(created.status,201);
  const savedTask=await call('/api/projects/'+created.data.project.id+'/tasks'+q,'POST',{title:'Confirm the gallery hanging plan',assignee:'studio',due:'2026-10-10'},'owner');
  assert.equal(savedTask.status,200);
  const task=savedTask.data.project.tasks.find(item=>item.title==='Confirm the gallery hanging plan');
  const taskSearch=await call('/api/search'+q+'&q=gallery%20hanging&scope=tasks','GET',undefined,'owner');
  assert.equal(taskSearch.status,200);
  assert.ok(taskSearch.data.groups.flatMap(group=>group.items).some(item=>item.id==='project:'+created.data.project.id+':'+task.id));
  assert.ok(taskSearch.data.groups.every(group=>group.items.every(item=>item.type==='task')));
  response=await call('/api/search'+q+'&q=ocean%20archive','GET',undefined,'owner');
  assert.ok(response.data.groups.find(group=>group.label==='Projects')?.items.some(item=>item.id===created.data.project.id));
  assert.equal((await call('/api/signup','POST',{name:'Other',email:'other-search@example.test',studio:'Other Studio',slug:'other-studio-search',password:'OtherSearch2026!'},'other')).status,201);
  const otherStudio=(await call('/api/me','GET',undefined,'other')).data.studios[0].id;
  response=await call('/api/search?studio='+otherStudio+'&q=ocean%20archive','GET',undefined,'other');
  assert.equal(response.status,200);assert.equal(response.data.total,0);
  assert.equal((await call('/api/search'+q+'&q=ocean%20archive','GET',undefined,'other')).status,403);
  assert.equal((await call('/api/search'+q+'&q=short','GET',undefined,'')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
