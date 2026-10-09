import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

async function workspace(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'client-record-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function call(route,method='GET',body){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json()};
 }
 assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
 const studio=(await call('/api/me')).data.studios[0].id;
 return {db,call,q:'?studio='+studio,studio,async close(){await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}};
}

test('a company typed on a client becomes their organisation, and the same name is reused',async()=>{
 const w=await workspace();
 try{
  const first=await w.call('/api/clients'+w.q,'POST',{name:'Test Person',email:'test@example.test',company:'Pigment Ltd'});
  assert.equal(first.status,201);assert.equal(first.data.client.organizationName,'Pigment Ltd');
  const linked=(await w.call(`/api/clients/${first.data.client.id}/organization${w.q}`)).data.organization;
  assert.equal(linked.name,'Pigment Ltd');
  const primary=(await w.call(`/api/clients/${first.data.client.id}/contacts${w.q}`)).data.contacts.find(c=>c.isPrimary);
  assert.equal(primary.organizationName,'Pigment Ltd');
  const second=await w.call('/api/clients'+w.q,'POST',{name:'Colleague',email:'colleague@example.test',company:'pigment ltd'});
  assert.equal((await w.call(`/api/clients/${second.data.client.id}/organization${w.q}`)).data.organization.id,linked.id);
  assert.equal((await w.call('/api/organizations'+w.q)).data.organizations.filter(o=>o.name.toLowerCase()==='pigment ltd').length,1);
  // No company, no organisation; adding one later in Edit profile links it.
  const solo=(await w.call('/api/clients'+w.q,'POST',{name:'Solo Client',email:'solo@example.test'})).data.client;
  assert.equal((await w.call(`/api/clients/${solo.id}/organization${w.q}`)).data.organization,null);
  const edited=await w.call(`/api/clients/${solo.id}${w.q}`,'PATCH',{name:'Solo Client',stage:'Lead',tags:[],company:'Northlight Studio'});
  assert.equal(edited.data.client.organizationName,'Northlight Studio');
  // A client already linked keeps their organisation when the company text changes.
  const renamed=await w.call(`/api/clients/${solo.id}${w.q}`,'PATCH',{name:'Solo Client',stage:'Lead',tags:[],company:'Something else'});
  assert.equal(renamed.data.client.organizationName,'Northlight Studio');
 }finally{await w.close();}
});

test('a follow-up can be ticked off, and saving the profile without one leaves it alone',async()=>{
 const w=await workspace();
 try{
  const client=(await w.call('/api/clients'+w.q,'POST',{name:'Follow Person',email:'follow@example.test'})).data.client,route=`/api/clients/${client.id}${w.q}`;
  await w.call(route,'PATCH',{name:'Follow Person',stage:'Lead',tags:[],followUp:'2027-01-10',followUpNote:'Send the moodboard'});
  // The profile form no longer carries the follow-up; saving it must not clear one.
  let saved=await w.call(route,'PATCH',{name:'Follow Person',stage:'Active',tags:[],company:'',phone:'',source:''});
  assert.equal(saved.data.client.followUp,'2027-01-10');assert.equal(saved.data.client.followUpNote,'Send the moodboard');
  saved=await w.call(route,'PATCH',{followUpDone:true});
  assert.equal(saved.status,200);assert.equal(saved.data.client.followUp,'');assert.equal(saved.data.client.followUpNote,'');
  const history=(await w.call(`/api/clients/${client.id}/activities${w.q}`)).data.activities;
  assert.equal(history[0].title,'Follow-up done: Send the moodboard');
  assert.equal((await w.call(route,'PATCH',{followUpDone:true})).status,409);
 }finally{await w.close();}
});
