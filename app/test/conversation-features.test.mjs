import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {id,passwordHash,now} from '../store.mjs';
import {createWorkspace} from '../server.mjs';

test('conversation replies, mentions and uploaded files remain scoped, private until sent and retry safe',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'conversation-features-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];const type=response.headers.get('content-type');return {status:response.status,data:type?.includes('json')?await response.json():await response.text()};}
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
  const me=(await call('/api/me')).data,studio=me.studios[0].id,q='?studio='+studio,conversations=(await call('/api/conversations'+q)).data.conversations,thread=conversations.find(c=>c.clientEmail==='amelia@example.test'),other=conversations.find(c=>c.id!==thread.id),route='/api/conversations/'+thread.id;
  const clientId=thread.participants.find(p=>p.role==='Approver').id;
  let result=await call(route+'/messages'+q,'POST',{text:'Review this @Amelia Taylor',mentionIds:[clientId],clientMessageId:'root'});assert.equal(result.status,200);const root=result.data.conversation.messages.at(-1);assert.deepEqual(root.mentionIds,[clientId]);
  result=await call(route+'/messages'+q,'POST',{text:'Reply linked to root',parentId:root.id,clientMessageId:'reply'},'client');assert.equal(result.status,200);const child=result.data.conversation.messages.at(-1);assert.equal(child.parentId,root.id);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'No nested ambiguity',parentId:child.id},'client')).status,400);
  const foreign=(await call('/api/conversations/'+other.id+'/messages'+q,'POST',{text:'Other thread root'})).data.conversation.messages.at(-1);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Wrong thread',parentId:foreign.id})).status,400);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Outsider',mentionIds:['unknown']})).status,400);
  result=await call(route+'/messages'+q,'POST',{text:'Reply linked to root',parentId:root.id,clientMessageId:'reply'},'client');assert.equal(result.data.conversation.messages.at(-1).id,child.id);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Reply linked to root',clientMessageId:'reply'},'client')).status,409);
  const pdf=Buffer.from('%PDF-1.7\nSample file for access testing\n'+'x'.repeat(90000)).toString('base64');
  result=await call(route+'/files'+q,'POST',{name:'sample.pdf',content:pdf});assert.equal(result.status,201);const file=result.data.file,fileRoute=route+'/files/'+file.fileId+q;
  assert.equal((await call(fileRoute)).status,200);assert.equal((await call(fileRoute,'GET',undefined,'client')).status,404,'unsent attachment remains private');
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Cannot steal pending upload',attachmentIds:[file.fileId]},'client')).status,400);
  result=await call(route+'/messages'+q,'POST',{text:'',attachmentIds:[file.fileId],clientMessageId:'file'});assert.equal(result.status,200);assert.equal(result.data.conversation.messages.at(-1).attachments[0].name,'sample.pdf');
  assert.equal((await call(fileRoute,'GET',undefined,'client')).status,200);assert.equal((await call('/api/conversations/'+other.id+'/files/'+file.fileId+q)).status,404);
  assert.equal((await call('/api/conversations/'+other.id+'/messages'+q,'POST',{text:'Wrong scope',attachmentIds:[file.fileId]})).status,400);
  assert.equal((await call(route+'/files'+q,'POST',{name:'bad.html',content:Buffer.from('<html>not an approved file</html>').toString('base64')})).status,400);
  result=await call('/api/conversations'+q,'POST',{clientId:thread.clientId,subject:'Direct discussion'});const direct=result.data.conversation;
  assert.ok(direct.participants.some(p=>p.id===clientId));
  result=await call('/api/conversations/'+direct.id+'/files'+q,'POST',{name:'direct.pdf',content:pdf},'client');assert.equal(result.status,201);const directFile=result.data.file.fileId;
  result=await call('/api/conversations/'+direct.id+'/messages'+q,'POST',{text:'Direct attachment',attachmentIds:[directFile]},'client');assert.equal(result.status,200);


  const staffId=id();db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(staffId,'message-staff@example.test','Message teammate',passwordHash('StudioDemo2026!'));db.prepare('INSERT INTO studio_staff VALUES(?,?,?,?)').run(staffId,studio,'viewer',now());
  assert.equal((await call('/api/login','POST',{email:'message-staff@example.test',password:'StudioDemo2026!'},'staff')).status,200);
  assert.equal((await call(route+q,'GET',undefined,'staff')).status,404);
  db.prepare('INSERT INTO studio_project_collaborators VALUES(?,?,?,?,?)').run(staffId,studio,thread.projectId,now(),me.user.id);
  let staffThread=(await call(route+q,'GET',undefined,'staff')).data.conversation;assert.ok(staffThread.participants.some(p=>p.id===staffId));
  assert.equal((await call('/api/conversations/'+direct.id+q,'GET',undefined,'staff')).status,404,'staff cannot read private CRM conversation');
  assert.equal((await call('/api/conversations/'+other.id+q,'GET',undefined,'staff')).status,404,'other projects stay inaccessible');
  result=await call(route+'/files'+q,'POST',{name:'staff.pdf',content:pdf},'staff');assert.equal(result.status,201);const staffFile=result.data.file.fileId;
  result=await call(route+'/messages'+q,'POST',{text:'Contributor reply',parentId:root.id,attachmentIds:[staffFile],mentionIds:[me.user.id]},'staff');assert.equal(result.status,200);assert.equal(result.data.conversation.messages.at(-1).by,'Message teammate');
  assert.equal((await call(route+'/status'+q,'POST',{status:'Resolved'},'staff')).status,403);
  db.prepare('DELETE FROM studio_project_collaborators WHERE user_id=?').run(staffId);
  assert.equal((await call(route+q,'GET',undefined,'staff')).status,404);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Revoked'},'staff')).status,404);
  assert.equal((await call(route+'/files/'+staffFile+q,'GET',undefined,'staff')).status,404);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Mention revoked teammate',mentionIds:[staffId]})).status,400);
  db.prepare("UPDATE crm_project_stakeholders SET role='Viewer' WHERE studio_id=? AND project_id=?").run(studio,thread.projectId);
  assert.equal((await call(route+'/files'+q,'POST',{name:'blocked.pdf',content:pdf},'client')).status,403);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Viewer cannot reply',parentId:root.id},'client')).status,403);
  assert.equal((await call(fileRoute,'GET',undefined,'client')).status,200,'viewer may read shared files');
  db.prepare('UPDATE crm_project_stakeholders SET portal_access=0 WHERE studio_id=? AND project_id=?').run(studio,thread.projectId);
  assert.equal((await call(fileRoute,'GET',undefined,'client')).status,404,'revoked participant cannot open previously shared file');
  const loaded=(await call(route+q)).data.conversation;assert.equal(loaded.messages.find(m=>m.id===child.id).parentId,root.id);assert.deepEqual(loaded.messages.find(m=>m.id===root.id).mentionIds,[clientId]);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
