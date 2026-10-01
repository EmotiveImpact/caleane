import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {openStore,conversationDTO} from '../store.mjs';

test('client conversations are independent, tenant scoped, retry safe and compatible with project messages',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-conversations-'));
 const origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;const cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const contacts=(await call('/api/clients'+q)).data.clients,client=contacts.find(c=>c.email==='amelia@example.test');
  const list=(await call('/api/conversations'+q)).data.conversations;assert.equal(list.length,3);
  const primary=list.find(c=>c.clientId===client.id),other=list.find(c=>c.clientId!==client.id);
  assert.equal(primary.messages.length,1);assert.ok(primary.projectId);assert.equal(primary.messages[0].by,'NAY Studio');
  assert.equal((await call('/api/conversations'+q,'GET',undefined,'client')).data.conversations.length,1);
  assert.equal((await call('/api/conversations/'+other.id+q,'GET',undefined,'client')).status,404);
  assert.equal((await call('/api/conversations/'+other.id+'/messages'+q,'POST',{text:'No access'},'client')).status,404);
  assert.equal((await call('/api/conversations'+q,'POST',{clientId:client.id,subject:'No access'},'client')).status,403);
  let response=await call('/api/conversations'+q,'POST',{clientId:client.id,subject:'Future occasions',text:'What would you like to plan next?'});
  assert.equal(response.status,201);const c=response.data.conversation,route='/api/conversations/'+c.id;
  assert.equal(c.projectId,null);assert.equal(c.subject,'Future occasions');assert.equal(c.messages.length,1);assert.equal(c.unreadMessages,0);
  assert.equal((await call('/api/projects'+q)).data.projects.length,3);
  response=await call(route+q,'GET',undefined,'client');assert.equal(response.data.conversation.unreadMessages,1);
  const initialId=response.data.conversation.messages[0].id;
  response=await call(route+'/seen'+q,'POST',{lastMessageId:initialId},'client');assert.equal(response.data.conversation.unreadMessages,0);
  assert.equal((await call(route+'/seen'+q,'POST',{lastMessageId:primary.messages[0].id},'client')).status,400);
  response=await call(route+'/messages'+q,'POST',{text:'An anniversary dinner.',clientMessageId:'client-retry-1'},'client');assert.equal(response.status,200);assert.equal(response.data.conversation.messages.length,2);
  const sentId=response.data.conversation.messages.at(-1).id;
  response=await call(route+'/messages'+q,'POST',{text:'An anniversary dinner.',clientMessageId:'client-retry-1'},'client');assert.equal(response.data.conversation.messages.length,2);assert.equal(response.data.conversation.messages.at(-1).id,sentId);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'Different text',clientMessageId:'client-retry-1'},'client')).status,409);
  assert.equal((await call(route+'/messages'+q,'POST',{text:'   '},'client')).status,400);
  assert.equal((await call(route+'/status'+q,'POST',{status:'Resolved'},'client')).status,403);
  assert.equal((await call(route+'/status'+q,'POST',{status:'Anything'})).status,400);
  response=await call(route+'/status'+q,'POST',{status:'Resolved'});assert.equal(response.data.conversation.status,'Resolved');
  response=await call(route+'/messages'+q,'POST',{text:'One more question.'},'client');assert.equal(response.data.conversation.status,'Open');
  response=await call(route+q);assert.equal(response.data.conversation.unreadMessages,2);
  response=await call(route+'/seen'+q,'POST',{lastMessageId:response.data.conversation.messages.at(-1).id});assert.equal(response.data.conversation.unreadMessages,0);
  await call(route+'/seen'+q,'POST',{lastMessageId:initialId});assert.equal((await call(route+q)).data.conversation.unreadMessages,0,'seen cursor cannot move backwards');
  // Private CRM information is never included in conversation DTOs.
  await call('/api/clients/'+client.id+'/notes'+q,'POST',{text:'PRIVATE STUDIO MARGIN'});
  assert.ok(!JSON.stringify((await call('/api/conversations'+q,'GET',undefined,'client')).data).includes('PRIVATE STUDIO MARGIN'));
  // No project association may cross a contact or studio boundary.
  assert.equal((await call('/api/conversations'+q,'POST',{clientId:client.id,projectId:other.projectId,subject:'Wrong client'})).status,404);
  response=await call('/api/conversations'+q,'POST',{clientId:client.id,projectId:primary.projectId,subject:'Existing project'});assert.equal(response.data.conversation.id,primary.id);assert.equal((await call('/api/conversations'+q)).data.conversations.length,4);
  // Both API surfaces reflect messages/status/read positions written through either path.
  const projectRoute='/api/projects/'+primary.projectId,primaryRoute='/api/conversations/'+primary.id;
  response=await call(projectRoute+'/messages'+q,'POST',{text:'From the existing project view'},'client');const legacyId=response.data.project.messages.at(-1).id;
  assert.equal((await call(primaryRoute+q)).data.conversation.messages.at(-1).id,legacyId);
  response=await call(primaryRoute+'/messages'+q,'POST',{text:'From the new inbox'});const inboxId=response.data.conversation.messages.at(-1).id;
  assert.equal((await call(projectRoute+q)).data.project.messages.at(-1).id,inboxId);
  await call(primaryRoute+'/status'+q,'POST',{status:'Waiting'});assert.equal((await call(projectRoute+q)).data.project.threadStatus,'Waiting');
  await call(projectRoute+'/thread-status'+q,'POST',{status:'Resolved'});assert.equal((await call(primaryRoute+q)).data.conversation.status,'Resolved');
  await call(primaryRoute+'/seen'+q,'POST',{lastMessageId:inboxId},'client');assert.equal((await call(projectRoute+q,'GET',undefined,'client')).data.project.unreadMessages,0);
  await call(projectRoute+'/seen'+q,'POST',{lastMessageId:inboxId});assert.equal((await call(primaryRoute+q)).data.conversation.unreadMessages,0);
  // A different studio cannot infer or mutate the conversation, even with known IDs.
  assert.equal((await call('/api/signup','POST',{name:'Other Owner',email:'other@example.test',studio:'Other',slug:'other',password:'OtherStudio2026!'},'other')).status,201);
  const otherStudio=(await call('/api/me','GET',undefined,'other')).data.studios[0].id,oq='?studio='+otherStudio;
  assert.equal((await call(route+q,'GET',undefined,'other')).status,403);
  assert.equal((await call(route+oq,'GET',undefined,'other')).status,404);
  assert.equal((await call(route+'/messages'+oq,'POST',{text:'No access'},'other')).status,404);
  assert.equal((await call('/api/conversations'+oq,'POST',{clientId:client.id,subject:'Wrong studio'},'other')).status,404);
  assert.equal((await call('/api/conversations'+oq,'GET',undefined,'other')).data.conversations.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});

test('legacy project messages and read positions migrate once without duplicates or lost history',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-conversation-migration-')),file=path.join(dir,'test.sqlite');
 let db;
 try{
  ({db}=await createWorkspace({dbFile:file,demo:true}));
  const client=db.prepare("SELECT * FROM users WHERE email='amelia@example.test'").get();
  const row=db.prepare('SELECT * FROM projects WHERE client_email=?').get(client.email),p=JSON.parse(row.data),message=p.messages[0];
  db.prepare('INSERT INTO project_reads VALUES(?,?,?)').run(client.id,p.id,message.at);
  // Model an existing pre-conversation database, retaining every legacy record.
  db.exec('DROP TABLE conversation_reads; DROP TABLE conversation_messages; DROP TABLE conversations;');db.close();
  db=openStore(file);let c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id),dto=conversationDTO(db,c,client);
  assert.equal(dto.messages[0].id,message.id);assert.equal(dto.messages[0].text,message.text);assert.equal(dto.unreadMessages,0);
  const cid=c.id;db.close();db=openStore(file);c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id);dto=conversationDTO(db,c,client);
  assert.equal(c.id,cid);assert.equal(dto.messages.length,1);assert.equal(dto.unreadMessages,0);
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data),p,'migration leaves historical project JSON unchanged');
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});
