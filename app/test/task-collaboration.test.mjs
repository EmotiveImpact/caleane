import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createWorkspace} from '../server.mjs';import {id,passwordHash,now} from '../store.mjs';
test('task collaboration persists assignment, discussion and files with project and client boundaries',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-tasks-')),origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};}
 try{
  for(const [who,email]of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);
  const me=await call('/api/me'),sid=me.studios[0].id,q='?studio='+sid,p=(await call('/api/projects'+q,undefined,'client')).projects[0],task=p.tasks[0],endpoint='/api/task-workspace/project/'+task.id+q+'&project='+p.id;
  await call('/api/projects/'+p.id+'/tasks'+q,{taskId:task.id,assignee:'studio'});
  assert.equal((await call(endpoint,{action:'assign',assigneeId:'not-a-member'})).status,400);
  assert.equal((await call(endpoint,{action:'assign',assigneeId:me.user.id},'client')).status,403);
  assert.equal((await call(endpoint,{action:'assign',assigneeId:me.user.id})).assigneeName,me.user.name);
  const c=await call(endpoint,{action:'comment',text:'Confirm the installation plan'},'client');assert.equal(c.comments[0].text,'Confirm the installation plan');
  assert.equal((await call(endpoint,{action:'comment',text:'  '})).status,400);
  const content=Buffer.from('%PDF-1.4\nSample task attachment').toString('base64'),f=await call(endpoint,{action:'file',name:'plan.pdf',content});assert.equal(f.status,200);assert.equal(f.files.length,1);
  const stored=await call(endpoint);assert.equal(stored.comments.length,1);assert.equal(stored.assigneeId,me.user.id);
  const fileUrl='/api/task-workspace/project/'+task.id+'/files/'+f.files[0].id+q+'&project='+p.id;
  const download=await fetch(base+fileUrl,{headers:{Cookie:cookies.client}});assert.equal(download.status,200);assert.equal(await download.text(),Buffer.from(content,'base64').toString());
  assert.equal((await call('/api/task-workspace/project/'+task.id+q+'&project=00000000-0000-0000-0000-000000000000')).status,404);
  const privateTask=(await call('/api/crm/tasks'+q,{clientId:(await call('/api/clients'+q)).clients[0].id,title:'Private planning'})).task;
  assert.equal((await call('/api/task-workspace/crm/'+privateTask.id+q,undefined,'client')).status,403);
  assert.equal((await call('/api/task-workspace'+q)).assignments['project:'+p.id+':'+task.id],me.user.name);
  const staffId=id();db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(staffId,'task-staff@example.test','Task teammate',passwordHash('StudioDemo2026!'));db.prepare('INSERT INTO studio_staff VALUES(?,?,?,?)').run(staffId,sid,'viewer',now());
  await call('/api/login',{email:'task-staff@example.test',password:'StudioDemo2026!'},'staff');
  assert.equal((await call(endpoint,undefined,'staff')).status,404);
  assert.equal((await call(endpoint,{action:'assign',assigneeId:staffId})).status,400);
  db.prepare('INSERT INTO studio_project_collaborators VALUES(?,?,?,?,?)').run(staffId,sid,p.id,now(),me.user.id);
  assert.equal((await call(endpoint,{action:'assign',assigneeId:staffId})).assigneeName,'Task teammate');
  assert.equal((await call(endpoint,{action:'comment',text:'I can take this on'},'staff')).status,200);
  assert.equal((await call(endpoint,{action:'assign',assigneeId:me.user.id},'staff')).status,403);
  assert.equal((await call('/api/task-workspace/crm/'+privateTask.id+q,undefined,'staff')).status,403);
  db.prepare('DELETE FROM studio_project_collaborators WHERE user_id=?').run(staffId);
  assert.equal((await call(endpoint,undefined,'staff')).status,404);
  const revokedDownload=await fetch(base+fileUrl,{headers:{Cookie:cookies.staff}});assert.equal(revokedDownload.status,404);
  assert.equal((await call('/api/task-workspace'+q)).assignments['project:'+p.id+':'+task.id],undefined);

 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
