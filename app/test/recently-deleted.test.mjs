import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64').toString('base64');
test('deleted tasks, drafts, comments and references wait in Recently deleted, and archived projects can be deleted for good',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-deleted-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():null};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q=`?studio=${studio}`;
  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.clientEmail==='amelia@example.test'),route=`/api/projects/${project.id}`;
  const bin=async()=>(await call('/api/recently-deleted'+q)).data.items;
  const restore=async item=>call(`/api/recently-deleted/${item.id}/restore${q}`,'POST',{});
  assert.equal((await call('/api/recently-deleted'+q,'GET',undefined,'client')).status,403);

  // A project task comes back where it was.
  let result=await call(route+'/tasks'+q,'POST',{title:'Order the linen',assignee:'studio'});const task=result.data.project.tasks.find(t=>t.title==='Order the linen');
  result=await call(route+'/tasks'+q,'POST',{taskId:task.id,remove:true});assert.equal(result.data.project.tasks.some(t=>t.id===task.id),false);
  let items=await bin();assert.equal(items[0].type,'Task');assert.equal(items[0].label,'Order the linen');assert.equal(items[0].projectTitle,project.title);
  assert.equal((await restore(items[0])).status,200);
  assert.ok((await call(route+q)).data.project.tasks.some(t=>t.id===task.id&&t.title==='Order the linen'));
  assert.equal((await bin()).length,0);
  assert.equal((await restore(items[0])).status,404);

  // A design comment comes back with its replies.
  const design=project.designs[0];
  result=await call(route+'/comments'+q,'POST',{designId:design.id,text:'Warmer candlelight please'},'client');const comment=result.data.project.designs[0].comments.at(-1);
  await call(route+'/comments'+q,'POST',{designId:design.id,text:'Noted, will do',parentId:comment.id});
  result=await call(route+'/comments'+q,'POST',{designId:design.id,removeCommentId:comment.id},'client');assert.equal(result.status,200);
  assert.equal(result.data.project.designs[0].comments.some(c=>c.id===comment.id||c.parentId===comment.id),false);
  items=await bin();assert.equal(items[0].type,'Design comment');assert.equal(items[0].label,'Warmer candlelight please');
  assert.equal((await restore(items[0])).status,200);
  assert.equal((await call(route+q)).data.project.designs[0].comments.filter(c=>c.id===comment.id||c.parentId===comment.id).length,2);

  // A reference keeps its file until it is restored or its 30 days are up.
  const fileId='11111111-2222-4333-8444-555555555555';
  db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fileId,project.id,'linen.png','image/png',Buffer.from(png,'base64'));
  const row=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);row.inspiration.unshift({id:'ref-linen',title:'Linen swatch',note:'Natural weave',url:'',category:'',source:'',comments:[],fileId,mime:'image/png',by:'NAY Studio',at:new Date().toISOString()});db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(row),project.id);
  result=await call(route+'/reference-update'+q,'POST',{referenceId:'ref-linen',remove:true});assert.equal(result.status,200);
  assert.ok(db.prepare('SELECT 1 FROM files WHERE id=?').get(fileId),'the file stays while the reference can be restored');
  items=await bin();assert.equal(items[0].type,'Reference');
  assert.equal((await restore(items[0])).status,200);assert.ok((await call(route+q)).data.project.inspiration.some(r=>r.id==='ref-linen'&&r.fileId===fileId));
  await call(route+'/reference-update'+q,'POST',{referenceId:'ref-linen',remove:true});
  db.prepare("UPDATE deleted_items SET deleted_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await bin()).length,0,'items older than 30 days are removed for good');
  assert.equal(db.prepare('SELECT 1 FROM files WHERE id=?').get(fileId),undefined);

  // A private draft comes back with its files.
  const asset=(await call(route+'/drafts/files'+q,'POST',{name:'scene.png',content:png})).data.asset;
  const draft=(await call(route+'/drafts'+q,'POST',{title:'Evening scene',description:'Low light',assetIds:[asset.fileId],briefRevision:project.briefRevision})).data.draft;
  assert.equal((await call(`${route}/drafts/${draft.id}${q}`,'PATCH',{remove:true})).status,200);
  assert.ok(db.prepare('SELECT 1 FROM files WHERE id=?').get(asset.fileId));
  items=await bin();assert.equal(items[0].type,'Design draft');assert.equal((await restore(items[0])).status,200);
  assert.ok((await call(route+'/drafts'+q)).data.drafts.some(d=>d.id===draft.id));

  // A private follow-up comes back too.
  const client=(await call('/api/clients'+q)).data.clients[0];
  const crm=await call('/api/crm/tasks'+q,'POST',{clientId:client.id,title:'Call about the venue'});assert.ok([200,201].includes(crm.status));const crmId=(crm.data.task||crm.data).id;
  assert.equal((await call(`/api/crm/tasks/${crmId}${q}`,'PATCH',{remove:true})).status,200);
  items=await bin();assert.equal(items[0].label,'Call about the venue');assert.equal((await restore(items[0])).status,200);
  assert.ok((await call('/api/crm/tasks'+q)).data.tasks.some(t=>t.id===crmId));

  // Projects with records the studio must keep stay archived; others can be deleted for good once archived.
  const governance='/api/data-governance'+q;
  assert.equal((await call(governance,'POST',{action:'archive',projectId:project.id,confirmTitle:project.title})).status,200);
  const issued=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);issued.proposals=[{id:'issued',title:'Agreed scope',status:'Scope accepted'}];db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(issued),project.id);
  const kept=(await call(governance)).data.projects.find(p=>p.id===project.id);assert.ok(kept.deleteBlockers.length);
  assert.equal((await call(governance,'POST',{action:'delete',projectId:project.id,confirmTitle:project.title})).status,409);
  const created=await call('/api/projects'+q,'POST',{name:'Quinn Moss',email:'quinn@example.test',occasion:'Made by mistake',vision:'Nothing yet'});assert.equal(created.status,201);const spare=created.data.project;
  await call(`/api/projects/${spare.id}/tasks${q}`,'POST',{title:'A step',assignee:'studio'});
  assert.equal((await call(governance,'POST',{action:'delete',projectId:spare.id,confirmTitle:spare.title})).status,409,'only archived projects can be deleted');
  await call(governance,'POST',{action:'archive',projectId:spare.id,confirmTitle:spare.title});
  assert.equal((await call(governance,'POST',{action:'delete',projectId:spare.id,confirmTitle:'Wrong'})).status,400);
  assert.equal((await call(governance,'POST',{action:'delete',projectId:spare.id,confirmTitle:spare.title})).status,200);
  assert.equal(db.prepare('SELECT 1 FROM projects WHERE id=?').get(spare.id),undefined);assert.equal(db.prepare('SELECT 1 FROM conversations WHERE project_id=?').get(spare.id),undefined);
  assert.equal((await call('/api/projects'+q)).data.projects.some(p=>p.id===spare.id),false);
  assert.ok(db.prepare('SELECT 1 FROM projects WHERE id=?').get(project.id),'other projects are untouched');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
