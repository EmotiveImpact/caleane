import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {id,passwordHash,now} from '../store.mjs';
import {createWorkspace} from '../server.mjs';

test('conversations show who needs a reply, keep pins and open asks, and can be marked unread',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'conversation-organiser-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];const type=response.headers.get('content-type');return {status:response.status,data:type?.includes('json')?await response.json():await response.text()};}
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio,list=async(who='owner')=>(await call('/api/conversations'+q,'GET',undefined,who)).data.conversations;
  const thread=(await list()).find(c=>c.clientEmail==='amelia@example.test'),route='/api/conversations/'+thread.id,send=async(text,who,extra={})=>(await call(route+'/messages'+q,'POST',{text,...extra},who)).data.conversation;
  const ownerId=thread.participants.find(p=>p.role==='Studio owner').id;
  let c=await send('Can we avoid lilies?','client');assert.equal(c.lastSide,'client');assert.equal((await list()).find(t=>t.id===thread.id).needsReply,true);
  const ask=c.messages.at(-1);
  c=await send('Of course.','owner');let mine=(await list()).find(t=>t.id===thread.id);assert.equal(mine.needsReply,false);assert.ok(mine.waitingSince,'studio spoke last so the client is waiting');
  await call(route+'/seen'+q,'POST',{lastMessageId:c.messages.at(-1).id});c=await send('@NAY Studio one more thing','client',{mentionIds:[ownerId]});mine=(await list()).find(t=>t.id===thread.id);assert.equal(mine.mentionsMe,1);assert.equal(mine.firstUnreadId,c.messages.at(-1).id);
  assert.equal((await call(route+'/status'+q,'POST',{status:'Resolved'})).status,200);assert.equal((await list()).find(t=>t.id===thread.id).needsReply,false,'resolved conversations never need a reply');

  // Pins: participants who can write may pin, at most ten per conversation.
  let r=await call(route+'/pins'+q,'POST',{messageId:ask.id,pinned:true},'client');assert.equal(r.status,200);assert.deepEqual(r.data.conversation.pins.map(p=>p.messageId),[ask.id]);
  assert.equal((await call(route+'/pins'+q,'POST',{messageId:'nope',pinned:true})).status,400);
  r=await call(route+'/pins'+q,'POST',{messageId:ask.id,pinned:false});assert.equal(r.data.conversation.pins.length,0);

  // Open asks become project tasks and stay owner-only.
  assert.equal((await call(route+'/asks'+q,'POST',{messageId:ask.id},'client')).status,403);
  r=await call(route+'/asks'+q,'POST',{messageId:ask.id});assert.equal(r.status,200);const created=r.data.conversation.asks[0];assert.equal(created.title,'Can we avoid lilies?');assert.equal(created.kind,'project');assert.equal(created.completed,false);
  assert.equal((await call(route+'/asks'+q,'POST',{messageId:ask.id})).status,409);
  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.id===thread.projectId);assert.ok(project.tasks.some(t=>t.id===created.taskId&&t.assignee==='studio'));
  r=await call(route+'/asks'+q,'POST',{messageId:ask.id,completed:true});assert.equal(r.data.conversation.asks[0].completed,true);
  assert.deepEqual((await list('client')).find(t=>t.id===thread.id).asks,[],'clients do not see the studio’s open asks');

  // A direct conversation turns asks into CRM tasks.
  const direct=(await call('/api/conversations'+q,'POST',{clientId:thread.clientId,subject:'Direct',text:'Hello'})).data.conversation;
  r=await call('/api/conversations/'+direct.id+'/asks'+q,'POST',{messageId:direct.messages[0].id,title:'Send the price list'});assert.equal(r.data.conversation.asks[0].kind,'crm');
  assert.ok((await call('/api/crm/tasks'+q)).data.tasks.some(t=>t.title==='Send the price list'));

  // Mark unread rewinds only this person's read marker.
  const last=(await call(route+q)).data.conversation.messages.at(-1);
  assert.equal((await call(route+'/seen'+q,'POST',{lastMessageId:last.id})).status,200);
  r=await call(route+'/unseen'+q,'POST',{messageId:ask.id});assert.equal(r.status,200);assert.equal(r.data.conversation.firstUnreadId,ask.id);assert.ok(r.data.conversation.unreadMessages>=2);
  assert.equal((await list('client')).find(t=>t.id===thread.id).firstUnreadId===ask.id,false);
  const seenBy=(await call(route+q,'GET',undefined,'client')).data.conversation.seenBy;assert.ok(seenBy.some(p=>p.userId===ownerId));
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
