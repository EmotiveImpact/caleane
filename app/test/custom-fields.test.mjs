import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
async function workspace(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'custom-fields-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const client=()=>{let cookie='';return async function call(route,method='GET',body){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json().catch(()=>null)};};};
 return {client,db,close:async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});}};
}

test('a studio defines its own fields, fills them on clients and projects, and keeps them from the client portal',async()=>{
 const w=await workspace();
 try{
  const call=w.client();
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  assert.deepEqual((await call('/api/custom-fields'+q)).data.fields,{client:[],project:[]});

  assert.equal((await call('/api/custom-fields'+q,'PUT',{client:[{label:'Referred by',type:'text'},{label:'referred BY',type:'text'}],project:[]})).status,400);
  assert.equal((await call('/api/custom-fields'+q,'PUT',{client:[],project:[{label:'Brand stage',type:'choice',options:[]}]})).status,400);
  const saved=await call('/api/custom-fields'+q,'PUT',{client:[{label:'Referred by',type:'text'},{label:'Birthday',type:'date'}],project:[{label:'Guest count',type:'number'},{label:'Brand stage',type:'choice',options:['New brand','Refresh','Refresh']}]});
  assert.equal(saved.status,200);
  const [referred,birthday]=saved.data.fields.client,[guests,stage]=saved.data.fields.project;
  assert.deepEqual(stage.options,['New brand','Refresh']);
  // Ids survive a re-save, so values stay attached to their field.
  const again=await call('/api/custom-fields'+q,'PUT',saved.data.fields);
  assert.deepEqual(again.data.fields,saved.data.fields);

  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.demo&&p.clientId);
  const clientId=project.clientId;
  assert.equal((await call(`/api/clients/${clientId}/fields${q}`,'PATCH',{fields:{[birthday.id]:'31 March'}})).status,400);
  const updated=await call(`/api/clients/${clientId}/fields${q}`,'PATCH',{tags:[' Wedding ','wedding','Referral'],fields:{[referred.id]:'Hannah at the Grange',[birthday.id]:'1990-03-31','not-a-field':'x'}});
  assert.equal(updated.status,200);
  assert.deepEqual(updated.data.client.tags,['Wedding','Referral']);
  assert.deepEqual(updated.data.client.customFields,{[referred.id]:'Hannah at the Grange',[birthday.id]:'1990-03-31'});
  // Clearing one field leaves the others as they were.
  const cleared=await call(`/api/clients/${clientId}/fields${q}`,'PATCH',{fields:{[referred.id]:''}});
  assert.deepEqual(cleared.data.client.customFields,{[birthday.id]:'1990-03-31'});
  assert.deepEqual(cleared.data.client.tags,['Wedding','Referral']);

  assert.equal((await call(`/api/projects/${project.id}/fields${q}`,'POST',{fields:{[stage.id]:'Something else'}})).status,400);
  const before=project.activity.length;
  const p=await call(`/api/projects/${project.id}/fields${q}`,'POST',{tags:['Summer'],fields:{[guests.id]:'120',[stage.id]:'Refresh'}});
  assert.equal(p.status,200);
  assert.deepEqual(p.data.project.tags,['Summer']);
  assert.deepEqual(p.data.project.customFields,{[guests.id]:120,[stage.id]:'Refresh'});
  assert.equal(p.data.project.activity.length,before,'private details do not appear in the shared activity');
  assert.deepEqual((await call(`/api/projects/${project.id}${q}`)).data.project.tags,['Summer']);

  // The client portal never sees the studio's tags or fields.
  const invite=await call(`/api/clients/${clientId}/invite${q}`,'POST',{});
  assert.equal(invite.status,201);
  const portal=w.client(),token=new URL(invite.data.url).hash.slice(1);
  const joined=await portal('/api/invite/claim','POST',{token,name:'Portal Client',password:'PortalClient2026!'});
  if(joined.status===200||joined.status===201){
   const seen=(await portal('/api/projects'+q)).data.projects.find(x=>x.id===project.id);
   assert.ok(seen,'the invited client can open their project');
   assert.equal(seen.tags,undefined);assert.equal(seen.customFields,undefined);
   assert.equal((await portal('/api/custom-fields'+q)).status,403);
   assert.equal((await portal(`/api/projects/${project.id}/fields${q}`,'POST',{tags:['Mine']})).status,403);
  }else assert.fail('invite acceptance failed: '+JSON.stringify(joined.data));
 }finally{await w.close();}
});
