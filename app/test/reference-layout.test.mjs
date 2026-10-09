import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {phaseSummary} from '../src/lib/phase-summary.js';

test('phase summary uses active saved milestones, ordered phases and recorded completion',()=>{
 const result=phaseSummary([{id:'later',order:20,status:'In progress'},{id:'first',order:10,status:'Complete'},{id:'hidden',order:0,status:'Complete',archivedAt:'2026-01-01'},{id:'last',order:30,status:'Not started'}]);
 assert.deepEqual(result.steps.map(step=>step.id),['first','later','last']);assert.equal(result.completed,1);assert.equal(result.total,3);assert.equal(result.current.id,'later');assert.equal(phaseSummary([]).current,null);
});

test('reference arrangements persist, reject stale and foreign positions, and preserve reference discussion',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-board-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[actor]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
  const studio=(await call('/api/me')).data.studios[0].id,q=`?studio=${studio}`,project=(await call('/api/projects'+q,'GET',undefined,'client')).data.projects[0],route=`/api/projects/${project.id}`;
  const added=await call(route+'/inspiration'+q,'POST',{title:'Material note',note:'Linen and warm stone',source:'Studio sample'}),ref=added.data.project.inspiration[0];
  const placement={id:ref.id,x:120,y:80,width:300,height:360};
  assert.equal((await call(route+'/reference-layout'+q,'POST',{revision:0,positions:[placement]},'client')).status,403);
  let result=await call(route+'/reference-layout'+q,'POST',{revision:0,positions:[placement]});assert.equal(result.status,200);assert.equal(result.data.project.referenceLayout.revision,1);
  await call(route+'/reference-comments'+q,'POST',{referenceId:ref.id,text:'Love the texture',point:{x:40,y:60}},'client');
  assert.equal((await call(route+'/reference-layout'+q,'POST',{revision:0,positions:[placement]})).status,409);
  for(const change of [{x:-1},{width:0},{height:701},{y:11900},{id:'foreign-id'},{x:'120'},{rotation:361},{rotation:'20'}])assert.equal((await call(route+'/reference-layout'+q,'POST',{revision:1,positions:[{...placement,...change}]})).status,400);
  assert.equal((await call(route+'/reference-layout'+q,'POST',{revision:1,positions:[placement,placement]})).status,400);
  result=await call(route+'/reference-layout'+q,'POST',{revision:1,positions:[{...placement,x:400,rotation:12}]});assert.equal(result.status,200);
  const saved=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);assert.equal(saved.referenceLayout.positions[ref.id].x,400);assert.equal(saved.referenceLayout.positions[ref.id].rotation,12);assert.equal(saved.inspiration[0].source,'Studio sample');assert.equal(saved.inspiration[0].comments[0].text,'Love the texture');assert.deepEqual(saved.designs,project.designs);
  const client=(await call(route+q,'GET',undefined,'client')).data.project;assert.equal(client.referenceLayout.positions[ref.id].x,400);
  // Private production notes must never be copied into the general client project DTO.
  await call(route+'/operations/add-milestone'+q,'POST',{revision:0,title:'Private supplier work',detail:'Private cost review',dueDate:'',visibleToClient:false});
  assert.equal((await call(route+q,'GET',undefined,'client')).data.project.operations,undefined);
  const operations=(await call(route+'/operations'+q,'GET',undefined,'client')).data.operations;assert.equal(operations.milestones.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
