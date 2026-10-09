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

const PNG=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,1)]).toString('base64');

test('custom fields can be yes or no, money, a web link or a file',async()=>{
 const w=await workspace();
 try{
  const saved=await w.call('/api/custom-fields'+w.q,'PUT',{client:[{label:'Signed NDA',type:'yesno'},{label:'Budget',type:'money',currency:'EUR'},{label:'Website',type:'link'},{label:'Brief',type:'file'}],project:[{label:'Fee',type:'money'}]});
  assert.equal(saved.status,200);
  const [nda,budget,site,brief]=saved.data.fields.client;
  assert.equal(budget.currency,'EUR');assert.equal(saved.data.fields.project[0].currency,'GBP');
  const client=(await w.call('/api/clients'+w.q,'POST',{name:'Field Person',email:'fields@example.test'})).data.client,route=`/api/clients/${client.id}/fields${w.q}`;
  assert.equal((await w.call(route,'PATCH',{fields:{[nda.id]:'maybe'}})).status,400);
  assert.equal((await w.call(route,'PATCH',{fields:{[budget.id]:'-5'}})).status,400);
  assert.equal((await w.call(route,'PATCH',{fields:{[site.id]:'javascript:alert(1)'}})).status,400);
  assert.equal((await w.call(route,'PATCH',{fields:{[brief.id]:{fileId:'00000000-0000-0000-0000-000000000000'}}})).status,400);
  assert.equal((await w.call('/api/custom-fields/files'+w.q,'POST',{name:'notes.txt',content:Buffer.from('just some plain text here').toString('base64')})).status,415);
  const upload=await w.call('/api/custom-fields/files'+w.q,'POST',{name:'brief.png',content:PNG});
  assert.equal(upload.status,201);assert.equal(upload.data.file.mime,'image/png');
  const updated=await w.call(route,'PATCH',{fields:{[nda.id]:false,[budget.id]:'1,250.5',[site.id]:'pigment.example/work',[brief.id]:{fileId:upload.data.file.id}}});
  assert.equal(updated.status,200);
  assert.deepEqual(updated.data.client.customFields,{[nda.id]:false,[budget.id]:1250.5,[site.id]:'https://pigment.example/work',[brief.id]:{fileId:upload.data.file.id,name:'brief.png'}});
  // The file opens for the studio, and leaves with the client on erasure.
  assert.equal(w.db.prepare('SELECT COUNT(*) AS n FROM custom_field_files').get().n,1);
  assert.equal((await w.call(`/api/clients/${client.id}/erase${w.q}`,'POST',{confirmName:'Field Person'})).status,200);
  assert.equal(w.db.prepare('SELECT COUNT(*) AS n FROM custom_field_files').get().n,0);
 }finally{await w.close();}
});

test('a file nobody attached is cleared after a day, and one still on a record is kept',async()=>{
 const {cleanupFieldFiles}=await import('../custom-fields.mjs');
 const w=await workspace();
 try{
  const field=(await w.call('/api/custom-fields'+w.q,'PUT',{client:[{label:'Brief',type:'file'}],project:[]})).data.fields.client[0];
  const kept=(await w.call('/api/custom-fields/files'+w.q,'POST',{name:'kept.png',content:PNG})).data.file;
  const stray=(await w.call('/api/custom-fields/files'+w.q,'POST',{name:'stray.png',content:PNG})).data.file;
  const client=(await w.call('/api/clients'+w.q,'POST',{name:'Keeper',email:'keeper@example.test'})).data.client;
  await w.call(`/api/clients/${client.id}/fields${w.q}`,'PATCH',{fields:{[field.id]:{fileId:kept.id}}});
  assert.equal(cleanupFieldFiles(w.db),0);
  assert.equal(cleanupFieldFiles(w.db,{clock:()=>Date.now()+2*86400000}),1);
  assert.deepEqual(w.db.prepare('SELECT id FROM custom_field_files').all().map(r=>r.id),[kept.id]);
  void stray;
 }finally{await w.close();}
});
