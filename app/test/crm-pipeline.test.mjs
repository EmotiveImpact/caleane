import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

test('relationship pipeline, activity and tasks are persistent, tenant scoped and revision safe',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-pipeline-')),origin='http://127.0.0.1:4320';
 const dbFile=path.join(dir,'test.sqlite'),{server,db}=await createWorkspace({dbFile,origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const projects=(await call('/api/projects'+q)).data.projects;
  const inherited=(await call('/api/opportunities'+q)).data.opportunities;
  assert.equal(inherited.length,projects.length,'existing projects are represented once in the pipeline');
  assert.ok(inherited.every(o=>o.stage==='Discovery'),'migration does not mistake design approval for a sale');
  const client=(await call('/api/clients'+q,'POST',{name:'New Prospect',email:'prospect@example.test'})).data.client;
  let response=await call('/api/opportunities'+q,'POST',{clientId:client.id,title:'Winter venue transformation',amountMinor:1250000,currency:'GBP',expectedClose:'2027-01-15',source:'Referral'});
  assert.equal(response.status,201);let opportunity=response.data.opportunity;
  assert.equal(opportunity.amountMinor,1250000);assert.equal(opportunity.activities[0].title,'Opportunity opened');
  response=await call('/api/opportunities/'+opportunity.id+q,'PATCH',{revision:opportunity.revision,stage:'Proposal',probability:65});
  assert.equal(response.status,200);opportunity=response.data.opportunity;
  assert.equal(opportunity.stage,'Proposal');assert.equal(opportunity.activities[0].title,'Moved from Discovery to Proposal');
  assert.equal((await call('/api/opportunities/'+opportunity.id+q,'PATCH',{revision:1,stage:'Won'})).status,409,'stale edits do not overwrite the pipeline');
  assert.equal((await call('/api/opportunities/'+opportunity.id+q,'PATCH',{revision:opportunity.revision,stage:'Lost'})).status,400,'loss needs an explanation');
  assert.equal((await call('/api/opportunities/'+opportunity.id+q,'PATCH',{revision:opportunity.revision,expectedClose:'2027-02-30'})).status,400);
  assert.equal((await call('/api/opportunities/'+opportunity.id+'/activities'+q,'POST',{kind:'Call',title:'Discussed guest flow',detail:'Client requested a quieter entrance.'})).status,201);
  assert.equal((await call('/api/clients/'+client.id+'/activities'+q)).data.activities[0].kind,'Call');
  response=await call('/api/crm/tasks'+q,'POST',{clientId:client.id,opportunityId:opportunity.id,title:'Send revised concept',dueDate:'2027-01-08',priority:'High'});
  assert.equal(response.status,201);const task=response.data.task;
  assert.equal((await call('/api/crm/tasks/'+task.id+q,'PATCH',{completed:true})).data.task.completed,true);
  assert.equal((await call('/api/crm/tasks'+q)).data.tasks.find(t=>t.id===task.id).completed,true);
  response=await call('/api/opportunities/'+opportunity.id+'/project'+q,'POST',{revision:opportunity.revision,occasion:'Winter venue transformation',vision:'A quiet, architectural arrival.',date:'2027-02-14'});
  assert.equal(response.status,201,'an opportunity can become a delivery project');
  assert.equal(response.data.opportunity.projectId,response.data.project.id);
  assert.equal(response.data.opportunity.stage,'Proposal','delivery work does not silently mark a sale Won');
  assert.equal(response.data.project.clientEmail,client.email);
  assert.equal((await call('/api/opportunities'+q)).data.opportunities.length,inherited.length+1,'conversion does not create a duplicate opportunity');
  assert.equal((await call('/api/opportunities/'+opportunity.id+'/project'+q,'POST',{revision:response.data.opportunity.revision,occasion:'Duplicate'})).status,409);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  assert.equal((await call('/api/opportunities'+q,'GET',undefined,'client')).status,403);
  assert.equal((await call('/api/crm/tasks'+q,'GET',undefined,'client')).status,403);
  assert.equal((await call('/api/signup','POST',{name:'Other owner',email:'other-owner@example.test',studio:'Other Studio',slug:'other-studio',password:'OtherPassword2026!'},'other')).status,201);
  const other=(await call('/api/me','GET',undefined,'other')).data.studios[0].id;
  assert.equal((await call('/api/opportunities/'+opportunity.id+'?studio='+other,'GET',undefined,'other')).status,404);
  assert.equal((await call('/api/crm/tasks/'+task.id+'?studio='+other,'PATCH',{completed:false},'other')).status,404);
  assert.equal((await call('/api/opportunities?studio='+other,'GET',undefined,'other')).data.opportunities.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});

 test('legacy automatic decision dates are corrected once, while edited forecasts and original dates survive',async()=>{
 const {openStore}=await import('../store.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-pipeline-dates-')),dbFile=path.join(dir,'test.sqlite');
 let db;
 try{
  const app=await createWorkspace({dbFile,demo:true});db=app.db;
  const rows=db.prepare('SELECT o.id,o.project_id,p.data FROM crm_opportunities o JOIN projects p ON p.id=o.project_id ORDER BY o.id').all();
  const originalDates=rows.map(row=>JSON.parse(row.data).brief.date);
  db.prepare('UPDATE crm_opportunities SET expected_close=?,revision=1 WHERE id=?').run(originalDates[0],rows[0].id);
  db.prepare('UPDATE crm_opportunities SET expected_close=?,revision=2 WHERE id=?').run(originalDates[1],rows[1].id);
  db.prepare('UPDATE crm_opportunities SET expected_close=?,revision=1,source=? WHERE id=?').run(originalDates[2], 'Referral',rows[2].id);
  db.close();db=openStore(dbFile);
  assert.equal(db.prepare('SELECT expected_close FROM crm_opportunities WHERE id=?').get(rows[0].id).expected_close,'');
  assert.equal(db.prepare('SELECT revision FROM crm_opportunities WHERE id=?').get(rows[0].id).revision,2);
  for(const index of [1,2])assert.equal(db.prepare('SELECT expected_close FROM crm_opportunities WHERE id=?').get(rows[index].id).expected_close,originalDates[index]);
  for(const [index,row] of rows.entries())assert.equal(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(row.project_id).data).brief.date,originalDates[index]);
  db.close();db=openStore(dbFile);assert.equal(db.prepare('SELECT revision FROM crm_opportunities WHERE id=?').get(rows[0].id).revision,2,'correction is not repeated');
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
 });
