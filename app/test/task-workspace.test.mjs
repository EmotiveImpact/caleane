import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

test('project task edits persist fields and preserve client completion permissions',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-proposals-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){
  const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};
 }
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).studios[0].id,suffix='?studio='+studio;
  let p=(await call('/api/projects'+suffix,undefined,'client')).projects[0];const route='/api/projects/'+p.id;
  const act=(action,body,who)=>call(route+'/'+action+suffix,body,who);
  p=(await act('tasks',{title:'Review the layout',detail:'Check the venue plan',due:'2027-10-02',assignee:'client'})).project;
  const task=p.tasks.at(-1),taskId=task.id;
  let r=await act('tasks',{taskId,title:'Revised layout',detail:'Confirm access',due:'2027-10-03',status:'In progress',assignee:'studio'});
  assert.equal(r.status,200);let saved=r.project.tasks.find(t=>t.id===taskId);assert.equal(saved.status,'In progress');assert.equal(saved.detail,'Confirm access');assert.equal(saved.due,'2027-10-03');assert.equal(saved.completed,false);
  assert.equal((await act('tasks',{taskId,completed:true},'client')).status,403);
  assert.equal((await act('tasks',{taskId,title:'Client edit',completed:false},'client')).status,403);
  r=await act('tasks',{taskId,status:'Completed'});saved=r.project.tasks.find(t=>t.id===taskId);assert.equal(saved.completed,true);assert.ok(saved.completedAt);
  r=await act('tasks',{taskId,completed:false});assert.equal(r.project.tasks.find(t=>t.id===taskId).status,'To do');
  assert.equal((await act('tasks',{taskId,status:'invalid'})).status,400);
  await act('tasks',{taskId,assignee:'client'});r=await act('tasks',{taskId,completed:true},'client');assert.equal(r.status,200);
  const persisted=(await call(route+suffix)).project.tasks.find(t=>t.id===taskId);assert.equal(persisted.title,'Revised layout');assert.equal(persisted.completed,true);
 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
