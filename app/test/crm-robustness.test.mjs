import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createWorkspace} from '../server.mjs';
import {hash} from '../store.mjs';

test('project-free client invitations, atomic acceptance and malformed-input handling',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-crm-robustness-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  let response=await call('/api/clients'+q,'POST',{name:'Independent Client',email:'independent@example.test'});assert.equal(response.status,201);const client=response.data.client,clientRoute='/api/clients/'+client.id;
  response=await call('/api/conversations'+q,'POST',{clientId:client.id,subject:'An idea before a project',text:'Welcome to your client workspace.'});const conversation=response.data.conversation;
  response=await call(clientRoute+'/invite'+q,'POST',{});assert.equal(response.status,201);assert.equal(response.data.email,client.email);const oldToken=new URL(response.data.url).hash.slice(1);
  response=await call(clientRoute+'/invite'+q,'POST',{});const token=new URL(response.data.url).hash.slice(1);
  assert.equal((await call('/api/invite/claim','POST',{token:oldToken,name:'Independent Client',password:'ClientPassword2026!'},'newClient')).status,400,'replacement revokes previous invitation');
  // Simulate a storage failure halfway through accepting an invitation. No orphan account or consumed token may survive.
  db.exec(`CREATE TRIGGER fail_test_membership BEFORE INSERT ON memberships WHEN NEW.role='client' BEGIN SELECT RAISE(ABORT,'simulated membership failure'); END;`);
  response=await call('/api/invite/claim','POST',{token,name:'Independent Client',password:'ClientPassword2026!'},'newClient');assert.equal(response.status,500);assert.equal(response.data.error,'Something went wrong. Please try again.');
  assert.equal(db.prepare('SELECT id FROM users WHERE email=?').get(client.email),undefined);assert.equal(db.prepare('SELECT used FROM invitations WHERE token=?').get(hash(token)).used,0);
  db.exec('DROP TRIGGER fail_test_membership');
  response=await call('/api/invite/claim','POST',{token,name:'Independent Client',password:'ClientPassword2026!'},'newClient');assert.equal(response.status,200);
  assert.equal((await call('/api/projects'+q,'GET',undefined,'newClient')).data.projects.length,0);
  response=await call('/api/conversations'+q,'GET',undefined,'newClient');assert.equal(response.data.conversations.length,1);assert.equal(response.data.conversations[0].id,conversation.id);
  assert.equal((await call('/api/conversations/'+conversation.id+'/messages'+q,'POST',{text:'We are thinking of a summer event.'},'newClient')).status,200);
  assert.equal((await call('/api/clients'+q,'GET',undefined,'newClient')).status,403);
  assert.equal((await call(clientRoute+'/invite'+q,'POST',{},'newClient')).status,403);
  assert.equal((await call('/api/invite/claim','POST',{token,name:'Independent Client',password:'ClientPassword2026!'},'newClient')).status,400,'invitation is single use');
  assert.equal((await call('/api/signup','POST',{name:'Other',email:'other@example.test',studio:'Other',slug:'other',password:'OtherPassword2026!'},'other')).status,201);
  const otherStudio=(await call('/api/me','GET',undefined,'other')).data.studios[0].id;
  assert.equal((await call(clientRoute+'/invite?studio='+otherStudio,'POST',{},'other')).status,404);
  // Invalid dates/estimate entries give actionable validation, without persisting partial data.
  const project=(await call('/api/projects'+q)).data.projects[0],projectRoute='/api/projects/'+project.id;
  assert.equal((await call(clientRoute+q,'PATCH',{name:client.name,stage:'Active',tags:[],followUp:'2027-02-30'})).status,400);
  assert.equal((await call(projectRoute+'/tasks'+q,'POST',{title:'Bad date',assignee:'studio',due:'2027-02-30'})).status,400);
  assert.equal((await call(projectRoute+'/estimates'+q,'POST',{title:'Invalid estimate',currency:'GBP',items:[null]})).status,400);
  assert.equal((await call(clientRoute+q)).data.client.followUp,'');
  // A UTF-8 character split between network chunks must survive exactly.
  const text='A beautiful occasion ✨',payload=Buffer.from(JSON.stringify({text})),split=payload.indexOf(Buffer.from('✨'))+1;
  const fragmented=await new Promise((resolve,reject)=>{
   const request=http.request(base+'/api/conversations/'+conversation.id+'/messages'+q,{method:'POST',headers:{Origin:origin,Cookie:cookies.owner,'Content-Type':'application/json','Content-Length':payload.length}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(data)}));});
   request.on('error',reject);request.write(payload.subarray(0,split));setTimeout(()=>request.end(payload.subarray(split)),5);
  });assert.equal(fragmented.status,200);assert.equal(fragmented.data.conversation.messages.at(-1).text,text);
  assert.equal((await call('/api/conversations/'+conversation.id+'/messages'+q,'POST',{text:'x'.repeat(70000)})).status,413);
  assert.equal((await call('/api/me')).status,200,'server still handles requests after a rejected payload');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
