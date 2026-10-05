import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {sendDueScheduled} from '../conversation-scheduled.mjs';

test('scheduled messages stay private to the author, post on time, can be sent early or cancelled',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'conversation-scheduled-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,disableExternalServices:true,scheduledIntervalMs:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};}
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const thread=(await call('/api/conversations'+q)).data.conversations.find(c=>c.clientEmail==='amelia@example.test'),route='/api/conversations/'+thread.id;
  const later=new Date(Date.now()+3*86400000).toISOString(),before=thread.messages.length;
  assert.equal((await call(route+'/scheduled'+q,'POST',{text:'Hello',sendAt:new Date(Date.now()-60000).toISOString()})).status,400,'past times are refused');
  assert.equal((await call(route+'/scheduled'+q,'POST',{text:'Hello',sendAt:new Date(Date.now()+400*86400000).toISOString()})).status,400,'more than a year ahead is refused');
  assert.equal((await call(route+'/scheduled'+q,'POST',{text:'  ',sendAt:later})).status,400);
  let r=await call(route+'/scheduled'+q,'POST',{text:'Monday check-in: how is the guest list looking?',sendAt:later});assert.equal(r.status,200);
  assert.equal(r.data.conversation.scheduled.length,1);assert.equal(r.data.conversation.messages.length,before,'nothing is posted yet');
  const first=r.data.conversation.scheduled[0];
  let client=(await call('/api/conversations'+q,'GET',undefined,'client')).data.conversations.find(c=>c.id===thread.id);
  assert.deepEqual(client.scheduled,[],'the client cannot see the studio’s scheduled message');assert.equal(client.messages.length,before);

  // Due: posted as the owner, once, even if the sender runs twice.
  db.prepare('UPDATE conversation_scheduled SET send_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),first.id);
  await call('/api/conversations'+q);assert.equal(sendDueScheduled(db).length,0,'reading the list posted it, once');
  client=(await call('/api/conversations'+q,'GET',undefined,'client')).data.conversations.find(c=>c.id===thread.id);
  assert.equal(client.messages.at(-1).text,'Monday check-in: how is the guest list looking?');assert.equal(client.messages.at(-1).by,'NAY Studio');assert.equal(client.unreadMessages>0,true);
  assert.ok((await call('/api/notifications'+q,'GET',undefined,'client')).data.notifications.some(n=>n.kind==='message'),'the bell hears about it like any message');

  // Send now, and cancel. The client can schedule too.
  r=await call(route+'/scheduled'+q,'POST',{text:'Send me early',sendAt:later});const early=r.data.conversation.scheduled[0];
  r=await call(route+'/scheduled/'+early.id+q,'POST',{action:'send'});assert.equal(r.data.conversation.messages.at(-1).text,'Send me early');assert.equal(r.data.conversation.scheduled.length,0);
  assert.equal((await call(route+'/scheduled/'+early.id+q,'POST',{action:'send'})).status,404,'already sent');
  r=await call(route+'/scheduled'+q,'POST',{text:'Never mind',sendAt:later},'client');assert.equal(r.status,200);const mine=r.data.conversation.scheduled[0];
  assert.equal((await call(route+'/scheduled/'+mine.id+q,'POST',{action:'cancel'})).status,404,'only the author can change it');
  r=await call(route+'/scheduled/'+mine.id+q,'POST',{action:'cancel'},'client');assert.deepEqual(r.data.conversation.scheduled,[]);
  db.prepare('UPDATE conversation_scheduled SET send_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),mine.id);assert.equal(sendDueScheduled(db).length,0,'cancelled messages never go');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
