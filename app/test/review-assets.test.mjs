import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
test('review feedback stays with its version and asset; replies keep their parent and client cannot resolve',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-review-')),origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};}
 try{for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);const studio=(await call('/api/me')).studios[0].id,suffix='?studio='+studio;let p=(await call('/api/projects'+suffix,undefined,'client')).projects[0];let d=p.designs.at(-1);assert.ok(d);const route='/api/projects/'+p.id+'/comments'+suffix;
 let r=await call(route,{designId:d.id,text:'Check this detail',assetId:'primary',point:{x:20,y:30}},'client');assert.equal(r.status,200);const root=r.project.designs.at(-1).comments.at(-1);assert.equal(root.assetId,d.fileId||'primary');
 r=await call(route,{designId:d.id,text:'We will adjust this',assetId:'primary',parentId:root.id});assert.equal(r.status,200);const reply=r.project.designs.at(-1).comments.at(-1);assert.equal(reply.parentId,root.id);assert.equal(reply.assetId,root.assetId);
 assert.equal((await call(route,{designId:d.id,text:'Wrong asset',assetId:'unknown-file'})).status,400);
 assert.equal((await call(route,{designId:d.id,text:'Wrong parent',parentId:'unknown-comment'})).status,400);
 assert.equal((await call(route,{designId:d.id,text:'Nested reply',parentId:reply.id})).status,400);
 assert.equal((await call(route,{designId:d.id,text:'Reply pin',parentId:root.id,point:{x:50,y:50}})).status,400);
 assert.equal((await call(route,{designId:d.id,resolve:true,commentId:root.id},'client')).status,403);
 r=await call(route,{designId:d.id,resolve:true,commentId:root.id});assert.equal(r.status,200);assert.equal(r.project.designs.at(-1).comments.find(c=>c.id===root.id).resolved,true);assert.equal(r.project.designs.at(-1).status,d.status);
 const saved=(await call('/api/projects/'+p.id+suffix)).project.designs.at(-1).comments;assert.equal(saved.find(c=>c.id===reply.id).parentId,root.id);
 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});

test('multi-file review isolates roots and replies across assets and versions and persists canonical primary IDs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-review-assets-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function call(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};}
 try{
  assert.equal((await call('/api/login',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).studios[0].id,suffix='?studio='+studio;
  const listed=(await call('/api/projects'+suffix)).projects.find(p=>p.designs.length);
  const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(listed.id).data),d=p.designs.at(-1);
  const primary='00000000-0000-4000-8000-000000000101',secondary='00000000-0000-4000-8000-000000000102',document='00000000-0000-4000-8000-000000000103';
  // Metadata fixtures isolate review associations without creating unrelated uploads.
  d.fileId=primary;d.assets=[{fileId:primary,name:'Primary.jpg',mime:'image/jpeg'},{fileId:secondary,name:'Detail.jpg',mime:'image/jpeg'},{fileId:document,name:'Direction.pdf',mime:'application/pdf'}];
  const next={...structuredClone(d),id:'00000000-0000-4000-8000-000000000104',version:d.version+1,comments:[],assets:[d.assets[0]]};p.designs.push(next);
  db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),p.id);
  const route='/api/projects/'+p.id+'/comments'+suffix,read=()=>call('/api/projects/'+p.id+suffix);
  const comments=r=>r.project.designs.find(v=>v.id===d.id).comments;
  let r=await call(route,{designId:d.id,text:'Primary alias root',assetId:'primary',point:{x:15,y:25}});assert.equal(r.status,200);
  const first=comments(r).at(-1);assert.equal(first.assetId,primary);assert.deepEqual(first.point,{x:15,y:25});
  r=await call(route,{designId:d.id,text:'Explicit primary reply',assetId:primary,parentId:first.id});assert.equal(r.status,200);
  const firstReply=comments(r).at(-1);assert.equal(firstReply.assetId,primary);assert.equal(firstReply.parentId,first.id);
  r=await call(route,{designId:d.id,text:'Second image root',assetId:secondary,point:{x:75,y:45}});assert.equal(r.status,200);
  const second=comments(r).at(-1);assert.equal(second.assetId,secondary);
  r=await call(route,{designId:d.id,text:'Second image reply',assetId:secondary,parentId:second.id});assert.equal(r.status,200);
  const secondReply=comments(r).at(-1);assert.equal(secondReply.parentId,second.id);assert.equal(secondReply.assetId,secondary);
  const before=(await read()).project.designs;
  for(const body of [
   {designId:d.id,text:'Wrong asset reply',assetId:primary,parentId:second.id},
   {designId:d.id,text:'Reverse wrong asset reply',assetId:secondary,parentId:first.id},
   {designId:next.id,text:'Cross-version parent',assetId:primary,parentId:first.id},
   {designId:next.id,text:'Asset from previous version',assetId:secondary},
   {designId:d.id,text:'PDF pin',assetId:document,point:{x:20,y:20}},
  ])assert.equal((await call(route,body)).status,400,body.text);
  assert.equal((await call(route,{designId:next.id,resolve:true,commentId:first.id})).status,404,'resolution cannot reach a comment in another version');
  assert.deepEqual((await read()).project.designs,before,'rejected writes leave both version records unchanged');
  r=await call(route,{designId:next.id,text:'New version own root',assetId:'primary'});assert.equal(r.status,200);
  const latestRoot=r.project.designs.find(v=>v.id===next.id).comments.at(-1);assert.equal(latestRoot.assetId,primary);
  const saved=(await read()).project.designs,previous=saved.find(v=>v.id===d.id).comments,current=saved.find(v=>v.id===next.id).comments;
  assert.equal(previous.find(c=>c.id===firstReply.id).parentId,first.id);assert.equal(previous.find(c=>c.id===secondReply.id).parentId,second.id);
  assert.deepEqual(previous.filter(c=>c.assetId===secondary).map(c=>c.id),[second.id,secondReply.id]);
  assert.deepEqual(current.map(c=>c.id),[latestRoot.id]);assert.equal(previous.some(c=>c.id===latestRoot.id),false);
 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
