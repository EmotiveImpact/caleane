import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

test('proposals retain scope and price snapshots, enforce roles and reject expired or stale acceptance',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-proposals-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){
  const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};
 }
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).studios[0].id,suffix='?studio='+studio;
  let p=(await call('/api/projects'+suffix,undefined,'client')).projects[0];const route='/api/projects/'+p.id;
  const act=(action,body,who)=>call(route+'/'+action+suffix,body,who);
  p=(await act('estimates',{title:'Studio fee',currency:'GBP',items:[{title:'Creative delivery',quantity:1,unitAmount:100000}],taxRate:20})).project;
  const draft={title:'Project scope',scope:'Design and installation',documentHtml:'<h2>Creative approach</h2><p><strong>Warm lighting</strong></p><script>alert(1)</script><img src=x onerror=alert(1)>',delivery:'Install before the event',exclusions:'Venue hire',expiresOn:'2099-12-31',estimateId:p.estimates.at(-1).id,briefRevision:p.briefRevision};
  assert.equal((await act('proposals',draft,'client')).status,403);
  let result=await act('proposals',draft);assert.equal(result.status,200);const first=result.project.proposals.at(-1);
  assert.equal(first.estimate.total,120000);assert.match(first.documentHtml,/<strong>Warm lighting<\/strong>/);assert.doesNotMatch(first.documentHtml,/script|onerror|<img/);
  assert.equal((await act('proposals',draft)).status,409);
  assert.equal((await act('proposal-response',{proposalId:first.id,decision:'accept',acknowledged:true})).status,403);
  assert.equal((await act('proposal-response',{proposalId:first.id,decision:'accept'},'client')).status,400);
  assert.equal((await act('proposal-response',{proposalId:first.id,decision:'changes'},'client')).status,400);
  result=await act('proposal-response',{proposalId:first.id,decision:'changes',feedback:'Include removal'},'client');assert.equal(result.project.proposals[0].status,'Changes requested');
  result=await act('proposals',{...draft,scope:'Design, installation and removal',previousId:first.id});const second=result.project.proposals.at(-1);
  assert.equal((await act('proposal-response',{proposalId:first.id,decision:'accept',acknowledged:true},'client')).status,409);
  result=await act('proposal-response',{proposalId:second.id,decision:'accept',acknowledged:true},'client');assert.equal(result.status,200);assert.equal(result.project.proposals.at(-1).status,'Scope accepted');assert.ok(result.project.proposals.at(-1).decidedByUserId);
  assert.equal((await act('proposal-response',{proposalId:second.id,decision:'accept',acknowledged:true},'client')).status,409);
  await act('estimates',{title:'Later budget',currency:'GBP',items:[{title:'New work',quantity:1,unitAmount:500000}],taxRate:0});
  p=(await call(route+suffix)).project;assert.equal(p.proposals.at(-1).estimate.total,120000);assert.equal(p.proposals[0].feedback,'Include removal');
  result=await act('proposals',{...draft,estimateId:p.estimates.at(-1).id,previousId:second.id});let third=result.project.proposals.at(-1);
  assert.equal((await act('proposal-withdraw',{proposalId:third.id},'client')).status,403);
  result=await act('proposal-withdraw',{proposalId:third.id});assert.equal(result.project.proposals.at(-1).status,'Withdrawn');
  assert.equal((await act('proposal-response',{proposalId:third.id,decision:'accept',acknowledged:true},'client')).status,409);
  p=(await act('proposals',{...draft,estimateId:p.estimates.at(-1).id,previousId:third.id})).project;const fourth=p.proposals.at(-1);
  // Simulate time passing in the isolated database, without relying on the host clock.
  p.proposals.at(-1).expiresOn='2000-01-01';db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),p.id);
  assert.equal((await act('proposal-response',{proposalId:fourth.id,decision:'accept',acknowledged:true},'client')).status,409);
  p.proposals.at(-1).expiresOn='2099-12-31';p.briefRevision++;db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),p.id);
  assert.equal((await act('proposal-response',{proposalId:fourth.id,decision:'accept',acknowledged:true},'client')).status,409);
  assert.equal((await call('/api/signup',{name:'Other',email:'other-proposal@example.test',studio:'Other',slug:'other-proposal',password:'OtherStudio2026!'},'other')).status,201);
  const other=(await call('/api/me',undefined,'other')).studios[0].id;
  assert.equal((await call(route+'/proposal-response?studio='+other,{proposalId:fourth.id,decision:'accept',acknowledged:true},'other')).status,404);
 }finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
