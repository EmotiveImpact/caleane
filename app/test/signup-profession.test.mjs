import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {DEFAULT_WORKFLOW,projectTypesFor} from '../src/lib/workflows.js';

const origin='http://127.0.0.1:4320';

test('signup validates and persists the chosen studio practice for first projects',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-signup-practice-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let cookie='';
 async function call(route,method='GET',body){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  const signup={name:'Alex Florist',email:'alex@example.test',studio:'Alex Flowers',slug:'alex-flowers',password:'StudioPassword2026!'};
  assert.equal((await call('/api/signup','POST',{...signup,profession:'unknown'})).status,400);
  assert.equal((await call('/api/signup','POST',{...signup,profession:'floral-design'})).status,201);
  let response=await call('/api/me');
  assert.equal(response.status,200);
  const studio=response.data.studios[0];
  assert.equal(studio.branding.profession,'floral-design');
  assert.deepEqual(studio.branding.projectTypes,projectTypesFor('floral-design'));
  response=await call(`/api/projects?studio=${studio.id}`,'POST',{name:'Client One',email:'client@example.test',occasion:'Event flowers'});
  assert.equal(response.status,201);
  assert.equal(response.data.project.brief.workflowType,'floral-design');
  cookie='';
  assert.equal((await call('/api/signup','POST',{...signup,email:'default@example.test',slug:'default-studio',studio:'Default Studio'})).status,201);
  response=await call('/api/me');
  assert.equal(response.data.studios[0].branding.profession,DEFAULT_WORKFLOW);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});
 }
});
