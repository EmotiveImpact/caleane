import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('owners get a self-ticking setup checklist and clients see a one-time welcome',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-onboarding-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 const done=setup=>setup.steps.filter(step=>step.done).map(step=>step.id);
 try{
  assert.equal((await call('/api/signup','POST',{name:'New Owner',email:'new-owner@example.test',studio:'Fresh Studio',slug:'fresh-studio',password:'FreshStudio2026!'},'fresh')).status,201);
  const fresh=(await call('/api/me','GET',undefined,'fresh')).data.studios[0].id,q=`?studio=${fresh}`;
  let state=(await call('/api/onboarding'+q,'GET',undefined,'fresh')).data;
  assert.equal(state.role,'owner');assert.deepEqual(done(state.studioSetup),[],'a new studio starts with nothing done');
  assert.deepEqual(state.studioSetup.steps.map(step=>step.id),['brand','form','project','invite','team','calendar']);
  assert.equal(state.studioSetup.complete,false);assert.equal(state.studioSetup.dismissed,false);

  // Real records tick steps; nothing is marked by hand.
  const client=(await call('/api/clients'+q,'POST',{name:'First Client',email:'first-client@example.test'},'fresh')).data.client;
  assert.ok(client?.id);
  const project=await call('/api/projects'+q,'POST',{name:'First Client',email:'first-client@example.test',occasion:'Wedding',vision:'Soft, candlelit.',clientId:client.id},'fresh');
  assert.ok([200,201].includes(project.status),JSON.stringify(project.data));
  assert.equal((await call(`/api/clients/${client.id}/invite${q}`,'POST',{},'fresh')).status,201);
  state=(await call('/api/onboarding'+q,'GET',undefined,'fresh')).data;
  assert.deepEqual(done(state.studioSetup),['project','invite']);

  assert.equal((await call('/api/onboarding'+q,'POST',{action:'welcome-seen'},'fresh')).status,403,'owners have no client welcome');
  assert.equal((await call('/api/onboarding'+q,'POST',{action:'nonsense'},'fresh')).status,400);
  state=(await call('/api/onboarding'+q,'POST',{action:'dismiss-setup'},'fresh')).data;
  assert.equal(state.studioSetup.dismissed,true);
  state=(await call('/api/onboarding'+q,'POST',{action:'restore-setup'},'fresh')).data;
  assert.equal(state.studioSetup.dismissed,false);

  // Clients see the studio's welcome once, with only their own projects.
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const nay=(await call('/api/me','GET',undefined,'client')).data.studios[0].id,cq=`?studio=${nay}`;
  state=(await call('/api/onboarding'+cq,'GET',undefined,'client')).data;
  assert.equal(state.clientWelcome.show,true);assert.equal(state.clientWelcome.studioName,'NAY DÉCOR');
  assert.deepEqual(state.clientWelcome.projects.map(p=>p.title),['Amelia’s wedding']);
  assert.equal(state.studioSetup,undefined,'clients never see studio setup');
  assert.equal((await call('/api/onboarding'+cq,'POST',{action:'dismiss-setup'},'client')).status,403);
  state=(await call('/api/onboarding'+cq,'POST',{action:'welcome-seen'},'client')).data;
  assert.equal(state.clientWelcome.show,false);
  assert.equal((await call('/api/onboarding'+q,'GET',undefined,'client')).status,403,'another studio stays private');
 }finally{
  await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});
 }
});
