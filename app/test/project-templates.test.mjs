import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const day=value=>Math.round(Date.parse(value+'T00:00:00Z')/86400000);
const shift=(value,days)=>new Date((day(value)+days)*86400000).toISOString().slice(0,10);

test('a studio saves a project as its own template and starts new projects from it',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-project-templates-')),origin='http://127.0.0.1:4320';
 const {server}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){
  const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};
 }
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).studios[0].id,q='?studio='+studio,templates='/api/project-templates'+q;
  let source=(await call('/api/projects'+q)).projects.find(p=>p.brief.name==='Amelia Taylor');
  source=(await call(`/api/projects/${source.id}/estimates${q}`,{title:'Wedding styling',currency:'GBP',taxRate:20,items:[{title:'Floral design',quantity:1,unitAmount:320000},{title:'Styling team',quantity:2,unitAmount:48000}]})).project;
  assert.ok(source.tasks.length>=2&&source.brief.date,'the sample wedding has a date and a plan');

  assert.equal((await call(templates,undefined,'client')).status,403,'clients cannot see templates');
  assert.equal((await call(templates,{action:'create',projectId:source.id,name:'Mine'},'client')).status,403);

  const created=await call(templates,{action:'create',projectId:source.id,name:'Wedding package',description:'Our usual wedding'});
  assert.equal(created.status,201);
  const template=created.template;
  assert.equal(template.brief.workflowType,source.brief.workflowType);
  assert.equal(template.brief.occasion,source.brief.occasion);
  assert.equal(template.tasks.length,source.tasks.length);
  assert.ok(template.tasks.every(t=>!('completed' in t)&&!('id' in t)),'tasks are kept as a plan, not as records');
  assert.deepEqual(template.estimate.items,[{title:'Floral design',quantity:1,unitAmount:320000},{title:'Styling team',quantity:2,unitAmount:48000}]);
  assert.doesNotMatch(JSON.stringify(template),/Amelia|amelia@example/,'nothing about the client is kept');
  assert.equal((await call(templates,{action:'create',projectId:source.id,name:'wedding PACKAGE'})).status,409,'names are unique');

  // With a date, task dates keep their distance from the day itself.
  let p=(await call('/api/projects'+q,{name:'Grace Bello',email:'grace@example.test',workflowType:template.brief.workflowType,occasion:'Wedding',date:'2028-08-19',templateId:template.id})).project;
  assert.equal(p.tasks.length,source.tasks.length);
  source.tasks.forEach((task,index)=>{
   assert.equal(p.tasks[index].title,task.title);
   assert.equal(p.tasks[index].due,shift('2028-08-19',day(task.due)-day(source.brief.date)));
   assert.equal(p.tasks[index].completed,false);
  });
  assert.equal(p.estimateDraft.total,(320000+96000)*1.2,'the estimate arrives as a draft to review');
  assert.equal(p.estimates.length,0,'nothing is shared with the new client');
  assert.equal(p.template.name,'Wedding package');
  assert.match(p.activity[0].text,/Started from the template “Wedding package”/);

  // Without a date, they keep their distance from the day the project began.
  p=(await call('/api/projects'+q,{name:'Ola Ade',email:'ola@example.test',workflowType:template.brief.workflowType,occasion:'Wedding',templateId:template.id})).project;
  const today=new Date().toISOString().slice(0,10),started=source.createdAt.slice(0,10);
  source.tasks.forEach((task,index)=>assert.equal(p.tasks[index].due,shift(today,Math.max(0,day(task.due)-day(started)))));

  const planOnly=(await call(templates,{action:'create',projectId:source.id,name:'Plan only',include:{tasks:true,estimate:false}})).template;
  assert.equal(planOnly.estimate,null);
  p=(await call('/api/projects'+q,{name:'Ola Ade',email:'ola@example.test',workflowType:template.brief.workflowType,occasion:'Wedding',templateId:planOnly.id})).project;
  assert.equal(p.estimateDraft,undefined);

  let list=await call(templates,{action:'update',id:template.id,name:'Signature wedding',description:''});
  assert.equal(list.templates.find(t=>t.id===template.id).name,'Signature wedding');
  assert.equal(list.templates.find(t=>t.id===template.id).tasks.length,source.tasks.length,'renaming keeps the contents');
  list=await call(templates,{action:'delete',id:template.id});
  assert.deepEqual(list.templates.map(t=>t.name),['Plan only']);
  assert.equal((await call('/api/projects'+q,{name:'Ola Ade',email:'ola@example.test',workflowType:template.brief.workflowType,occasion:'Wedding',templateId:template.id})).status,404,'a deleted template cannot be used');
 }finally{server.close();await rm(dir,{recursive:true,force:true});}
});
