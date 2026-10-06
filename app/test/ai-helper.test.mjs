import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {createAssistant,tidyDraft,AI_MODEL} from '../ai-helper.mjs';

async function start(options){
 const dir=await mkdtemp(path.join(os.tmpdir(),'ai-helper-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};}
 for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
 const studio=(await call('/api/me')).data.studios[0].id;
 return {db,call,q:'?studio='+studio,async close(){await new Promise(resolve=>server.close(resolve));db.close?.();await rm(dir,{recursive:true,force:true});}};
}

test('the helper is off without a key and never reachable by clients',async()=>{
 const app=await start({assistant:null});
 try{
  assert.deepEqual((await app.call('/api/assistant'+app.q)).data,{enabled:false});
  assert.equal((await app.call('/api/assistant'+app.q,'POST',{kind:'recap',projectId:'x'})).status,503);
  assert.equal(createAssistant({apiKey:''}),null);
 }finally{await app.close();}
});

test('drafts are written from studio data, returned for approval and never posted',async()=>{
 const seen=[];
 const fake={model:AI_MODEL,async write(kind,material){seen.push({kind,material});return kind==='reply'?'Hi Amelia — lovely to hear from you.':'A short recap.';}};
 const app=await start({assistant:fake});
 try{
  assert.deepEqual((await app.call('/api/assistant'+app.q)).data,{enabled:true});
  const conversations=(await app.call('/api/conversations'+app.q)).data.conversations,thread=conversations.find(c=>c.clientEmail==='amelia@example.test');
  assert.equal((await app.call('/api/conversations/'+thread.id+'/messages'+app.q,'POST',{text:'<p>Could we move the tasting to <strong>Friday</strong>?</p>',clientMessageId:'ask'},'client')).status,200);
  const before=app.db.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n;
  const result=await app.call('/api/assistant'+app.q,'POST',{kind:'reply',conversationId:thread.id});
  assert.equal(result.status,200);
  assert.equal(result.data.draft.text,'Hi Amelia, lovely to hear from you.');
  assert.match(seen[0].material,/Amelia Taylor \(client\): Could we move the tasting to Friday\?/);
  assert.match(seen[0].material,/Studio: NAY DÉCOR/);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,before,'nothing is posted');

  const projectId=thread.projectId;
  const recap=await app.call('/api/assistant'+app.q,'POST',{kind:'recap',projectId});
  assert.equal(recap.status,200);assert.match(seen[1].material,/Project: .*wedding/);assert.match(seen[1].material,/Recent messages/);

  assert.equal((await app.call('/api/assistant'+app.q,'POST',{kind:'reply',conversationId:'missing'})).status,404);
  assert.equal((await app.call('/api/assistant'+app.q,'POST',{kind:'poem'})).status,400);
  assert.equal((await app.call('/api/assistant'+app.q,'POST',{kind:'recap',projectId},'client')).status,403);
  assert.deepEqual((await app.call('/api/assistant'+app.q,'GET',undefined,'client')).data,{enabled:false});
 }finally{await app.close();}
});

test('a failed or declined draft explains itself without leaking provider errors',async()=>{
 const app=await start({assistant:{async write(){throw Object.assign(new Error('upstream secret detail'),{status:529,headers:{}});}}});
 try{
  const project=app.db.prepare('SELECT id FROM projects LIMIT 1').get().id,result=await app.call('/api/assistant'+app.q,'POST',{kind:'recap',projectId:project});
  assert.equal(result.status,502);assert.doesNotMatch(result.data.error||'',/secret/);
 }finally{await app.close();}
 const declined=createAssistant({client:{beta:{messages:{create:async request=>{assert.equal(request.model,AI_MODEL);assert.deepEqual(request.betas,['server-side-fallback-2026-07-01']);assert.equal(request.fallbacks,'default');return {stop_reason:'refusal',content:[]};}}}}});
 await assert.rejects(declined.write('recap','x'),{status:422});
 assert.equal(tidyDraft('One — two – three'),'One, two - three');
});
