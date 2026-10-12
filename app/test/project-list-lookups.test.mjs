import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

test('the project list reads its lookups for the whole studio and matches each project view',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'project-list-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,showcase:true,disableExternalServices:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,who='owner',method='GET',body){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};}
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',who,'POST',{email,password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const prepare=db.prepare.bind(db);
  async function listWithCount(){let statements=0;db.prepare=sql=>{statements++;return prepare(sql);};try{return {statements,projects:(await call('/api/projects'+q)).data.projects,get count(){return statements;}};}finally{db.prepare=prepare;}}
  const before=await listWithCount();
  for(let i=0;i<10;i++)assert.equal((await call('/api/projects'+q,'owner','POST',{name:'Guest '+i,email:`guest${i}@example.test`,occasion:'Dinner',date:'2027-05-01',venue:'',vision:''})).status,201);
  const after=await listWithCount(),listed=after.projects,perProject=(after.count-before.count)/10;
  assert.ok(perProject<=4,`each extra project should add only a few statements, not ${perProject} (${before.count} for ${before.projects.length} projects, ${after.count} for ${listed.length})`);
  assert.ok(listed.some(p=>p.latestInvoice)&&listed.some(p=>p.unreadMessages>0||p.messages.length),'the sample exercises invoices and messages');
  for(const who of ['owner','client']){
   const list=who==='owner'?listed:(await call('/api/projects'+q,who)).data.projects;
   for(const item of list){
    const detail=(await call(`/api/projects/${item.id}${q}`,who)).data.project;
    assert.deepEqual(item.messages,detail.messages.slice(-1),'the list carries only the latest message');
    assert.deepEqual({...item,messages:null},{...detail,messages:null},`${who} sees the same ${item.title} in the list and the project`);
   }
  }
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
