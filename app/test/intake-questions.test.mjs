import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('studio enquiry questions stay tenant scoped and become editable brief snapshots',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-intake-questions-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor='',headers={}){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0],q=`?studio=${studio.id}`;
  const questions=[{id:'q-access-window',label:'When can we access the venue?',type:'text',required:true,options:[]},{id:'q-style',label:'What is your preferred style?',type:'choice',required:false,options:['Modern','Romantic']}];
  const settings={name:studio.name,accent:studio.accent,origins:studio.origins,profession:studio.branding.profession,intakeQuestions:questions};
  assert.equal((await call('/api/settings'+q,'PATCH',settings,'client')).status,403);
  assert.equal((await call('/api/settings'+q,'PATCH',{...settings,intakeQuestions:[questions[0],questions[0]]},'owner')).status,400);
  assert.equal((await call('/api/settings'+q,'PATCH',settings,'owner')).status,200);
  const publicForm=(await call('/api/public/nay-decor')).data.studio.branding.intakeQuestions;
  assert.equal(publicForm.length,2);
  const intake={name:'Jordan Smith',email:'jordan@example.test',occasion:'Studio dinner',vision:'A warm evening'};
  const headers={'Idempotency-Key':'intake-questions-1'};
  assert.equal((await call('/api/public/nay-decor/enquiries','POST',{...intake},'',headers)).status,400);
  assert.equal((await call('/api/public/nay-decor/enquiries','POST',{...intake,intakeAnswers:{'q-access-window':'After 10am','q-style':'Unknown'}},'',headers)).status,400);
  const submitted=await call('/api/public/nay-decor/enquiries','POST',{...intake,intakeAnswers:{'q-access-window':'After 10am','q-style':'Modern'}},'',headers);
  assert.equal(submitted.status,201);
  const project=(await call('/api/projects'+q,'GET',undefined,'owner')).data.projects.find(p=>p.clientEmail===intake.email);
  assert.equal(project.brief.intakeAnswers[0].value,'After 10am');
  assert.equal(project.brief.intakeAnswers[1].label,'What is your preferred style?');
  assert.equal((await call('/api/settings'+q,'PATCH',{...settings,intakeQuestions:[]},'owner')).status,200);
  const edited=await call(`/api/projects/${project.id}/brief${q}`,'POST',{revision:project.briefRevision,brief:{...project.brief,intakeAnswers:[{id:'q-access-window',value:'After 11am'},{id:'q-style',value:'Romantic'}]}},'owner');
  assert.equal(edited.status,200);
  assert.equal(edited.data.project.brief.intakeAnswers[0].value,'After 11am');
  assert.equal(edited.data.project.brief.intakeAnswers[1].label,'What is your preferred style?');
  assert.equal(edited.data.project.briefHistory[0].brief.intakeAnswers[0].value,'After 10am');
  assert.equal((await call(`/api/projects/${project.id}/brief${q}`,'POST',{revision:edited.data.project.briefRevision,brief:{...edited.data.project.brief,intakeAnswers:[{id:'q-style',value:'Different'}]}},'owner')).status,400);
  const conditional=[{id:'q-event-kind',label:'What kind of event?',type:'choice',required:true,options:['Wedding','Dinner']},{id:'q-weather',label:'Do you need a weather plan?',type:'text',required:true,options:[],showWhen:{questionId:'q-event-kind',equals:'Wedding'}}];
  assert.equal((await call('/api/settings'+q,'PATCH',{...settings,intakeQuestions:[conditional[1],conditional[0]]},'owner')).status,400);
  assert.equal((await call('/api/settings'+q,'PATCH',{...settings,intakeQuestions:conditional},'owner')).status,200);
  const conditionalIntake={...intake,name:'Taylor Lee',email:'taylor@example.test'};
  assert.equal((await call('/api/public/nay-decor/enquiries','POST',{...conditionalIntake,intakeAnswers:{'q-event-kind':'Wedding'}},'',{'Idempotency-Key':'conditional-wedding-missing'})).status,400);
  const dinner=await call('/api/public/nay-decor/enquiries','POST',{...conditionalIntake,intakeAnswers:{'q-event-kind':'Dinner','q-weather':'Stale answer should be ignored'}},'',{'Idempotency-Key':'conditional-dinner'});
  assert.equal(dinner.status,201);
  const dinnerProject=(await call('/api/projects'+q,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail===conditionalIntake.email);
  assert.equal(dinnerProject.brief.intakeAnswers[1].applicable,false);
  assert.equal(dinnerProject.brief.intakeAnswers[1].value,'');
  assert.equal((await call(`/api/projects/${dinnerProject.id}/brief${q}`,'POST',{revision:dinnerProject.briefRevision,brief:{...dinnerProject.brief,intakeAnswers:[{id:'q-event-kind',value:'Wedding'},{id:'q-weather',value:''}]}},'owner')).status,400);
  const wedding=await call(`/api/projects/${dinnerProject.id}/brief${q}`,'POST',{revision:dinnerProject.briefRevision,brief:{...dinnerProject.brief,intakeAnswers:[{id:'q-event-kind',value:'Wedding'},{id:'q-weather',value:'Tent on standby'}]}},'owner');
  assert.equal(wedding.status,200);
  assert.equal(wedding.data.project.brief.intakeAnswers[1].applicable,true);
  const backToDinner=await call(`/api/projects/${dinnerProject.id}/brief${q}`,'POST',{revision:wedding.data.project.briefRevision,brief:{...wedding.data.project.brief,intakeAnswers:[{id:'q-event-kind',value:'Dinner'},{id:'q-weather',value:'Tent on standby'}]}},'owner');
  assert.equal(backToDinner.status,200);
  assert.equal(backToDinner.data.project.brief.intakeAnswers[1].value,'');
  assert.equal(backToDinner.data.project.brief.intakeAnswers[1].applicable,false);

 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
