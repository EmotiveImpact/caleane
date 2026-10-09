import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

async function workspace(run){
 const dir=await mkdtemp(path.join(os.tmpdir(),'pipeline-enquiries-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function call(route,method='GET',body){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const q='?studio='+(await call('/api/me')).data.studios[0].id;
  await run(call,q);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
}

test('a manual enquiry can bring a new client, its date and its venue in one step',()=>workspace(async(call,q)=>{
 const before=(await call('/api/clients'+q)).data.clients.length;
 let response=await call('/api/opportunities'+q,'POST',{newClient:{name:'Priya Shah',email:'Priya@Example.test'},title:'Garden anniversary',description:'Lanterns and long tables.',date:'2027-06-12',venue:'Walled garden, Bath'});
 assert.equal(response.status,201);
 const opportunity=response.data.opportunity;
 assert.equal(opportunity.clientName,'Priya Shah');
 assert.ok(opportunity.projectId,'a date or venue opens the project space straight away');
 assert.equal(opportunity.projectDate,'2027-06-12');
 assert.equal(opportunity.intake.brief.venue,'Walled garden, Bath');
 assert.equal(opportunity.intake.brief.vision,'Lanterns and long tables.');
 assert.equal(opportunity.stage,'Discovery');
 assert.equal((await call('/api/clients'+q)).data.clients.length,before+1);
 response=await call('/api/opportunities'+q,'POST',{newClient:{name:'Priya Shah',email:'priya@example.test'},title:'Second enquiry'});
 assert.equal(response.status,201,'an existing email is reused rather than refused');
 assert.equal(response.data.opportunity.clientId,opportunity.clientId);
 assert.equal(response.data.opportunity.projectId,null,'no date or venue keeps it a plain enquiry');
 assert.equal((await call('/api/clients'+q)).data.clients.length,before+1);
 const count=(await call('/api/opportunities'+q)).data.opportunities.length;
 assert.equal((await call('/api/opportunities'+q,'POST',{newClient:{name:'No Email',email:'not-an-email'},title:'Bad',date:'2027-01-01'})).status,400);
 assert.equal((await call('/api/opportunities'+q)).data.opportunities.length,count,'a failed enquiry leaves nothing half made');
 assert.equal((await call('/api/clients'+q,'POST',{name:'Priya Shah',email:'priya@example.test'})).status,409,'adding a client by hand still refuses duplicates');
}));
