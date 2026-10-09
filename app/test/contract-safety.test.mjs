import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {starterContract} from '../src/lib/starter-gallery.js';
import {fillMergeFields,findPlaceholders,placeholderMessage} from '../src/lib/merge-fields.js';

async function start(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'contract-safety-')),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,showcase:true,disableExternalServices:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};}
 for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
 const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio,projects=(await call('/api/projects'+q)).data.projects;
 return {db,call,q,amelia:projects.find(p=>p.title.startsWith('Amelia')),noah:projects.find(p=>p.title.startsWith('Brand launch')),async close(){await new Promise(resolve=>server.close(resolve));db.close?.();await rm(dir,{recursive:true,force:true});}};
}

test('merge fields fill in safely and every square-bracket gap is found',()=>{
 assert.equal(fillMergeFields('<p>{client_name} at {venue}, {unknown}</p>',{client_name:'Fern & <Co>'}),'<p>Fern &amp; &lt;Co&gt; at the venue agreed in the project space, {unknown}</p>');
 assert.equal(fillMergeFields('{total}',{}),'[total fee]');
 assert.deepEqual(findPlaceholders('<p>A deposit of [deposit percentage]% and [number of days]</p>','Again [deposit percentage]'),['[deposit percentage]','[number of days]']);
 assert.deepEqual(findPlaceholders('<h2>Our approach</h2><p>Describe the creative direction, milestones and working relationship.</p>'),['[Our approach]']);
 assert.deepEqual(findPlaceholders('<p>No gaps here.</p>'),[]);
 assert.match(placeholderMessage(['[a]','[b]','[c]']),/^Fill in \[a\], \[b\] and \[c\] before sending this contract\./);
 // The starter is written with merge fields, not hard-coded gaps, apart from the notice period only the studio can choose.
 const html=starterContract('event-styling').termsHtml;
 for(const key of ['client_name','project_name','event_date','venue','total','deposit_amount','deposit_percentage','studio_name'])assert.ok(html.includes(`{${key}}`),key);
 assert.deepEqual(findPlaceholders(html),['[number of days]']);
});

test('a starter contract fills from the project and cannot be issued with gaps left',async()=>{
 const app=await start();
 try{
  const {call,q,amelia,noah}=app,base=`/api/projects/${amelia.id}/engagements`;
  const fields=(await call(base+q)).data.mergeFields;
  assert.deepEqual(fields,{client_name:'Amelia Taylor',project_name:'Amelia’s wedding',event_date:'12 June 2027',venue:'A London townhouse',total:'£6,732.00',deposit_amount:'£2,019.60',deposit_percentage:'30',studio_name:'NAY DÉCOR'});
  assert.equal((await call(base+q,'GET',null,'client')).data.mergeFields,undefined);
  let a=(await call(`${base}/create-agreement${q}`,'POST',{...starterContract('event-styling'),expiresOn:'2099-01-01'})).data.agreements[0];
  assert.match(a.terms,/between NAY DÉCOR \(“we”, “us”\) and Amelia Taylor/);
  assert.match(a.terms,/Amelia’s wedding on 12 June 2027 at A London townhouse/);
  assert.match(a.terms,/total fee is £6,732\.00.*deposit of 30% \(£2,019\.60\)/s);
  const refused=await call(`${base}/issue-agreement${q}`,'POST',{id:a.id,revision:a.revision});
  assert.equal(refused.status,400);assert.equal(refused.data.error,'Fill in [number of days] before sending this contract. Replace each part in square brackets with the real detail.');
  a=(await call(`${base}/update-agreement${q}`,'POST',{...a,termsHtml:a.termsHtml.replace('[number of days]','28')})).data.agreements[0];
  assert.equal((await call(`${base}/issue-agreement${q}`,'POST',{id:a.id,revision:a.revision})).status,200);
  // A project with no price yet leaves the money as gaps, and they block issuing too.
  const nb=`/api/projects/${noah.id}/engagements`;
  const draft=(await call(`${nb}/create-agreement${q}`,'POST',{title:'Terms',termsHtml:'<p>{client_name} pays {total}, deposit {deposit_percentage}%.</p>',expiresOn:'2099-01-01'})).data.agreements[0];
  assert.equal(draft.terms,'Noah Williams pays [total fee], deposit [deposit percentage]%.');
  assert.match((await call(`${nb}/issue-agreement${q}`,'POST',{id:draft.id,revision:draft.revision})).data.error,/^Fill in \[total fee\] and \[deposit percentage\]/);
 }finally{await app.close();}
});

test('signing and declining notify the studio, and the owner countersigns a signed contract',async()=>{
 const app=await start();
 try{
  const {call,q,amelia,db}=app,base=`/api/projects/${amelia.id}/engagements`,titles=async who=>(await call('/api/notifications'+q,'GET',null,who)).data.notifications.map(n=>n.title);
  const issue=async title=>{const a=(await call(`${base}/create-agreement${q}`,'POST',{title,terms:'Agreed work.',expiresOn:'2099-01-01'})).data.agreements[0];return (await call(`${base}/issue-agreement${q}`,'POST',{id:a.id,revision:a.revision})).data.agreements[0];};
  let a=await issue('First terms');
  // The owner cannot countersign before the client has signed.
  assert.equal((await call(`${base}/countersign-agreement${q}`,'POST',{id:a.id,revision:a.revision,signerName:'NAY Studio',consent:true})).status,409);
  const declined=await call(`${base}/respond-agreement${q}`,'POST',{id:a.id,revision:a.revision,digest:a.digest,decision:'decline',note:'Not yet'},'client');
  assert.equal(declined.status,200);assert.equal(declined.data.eventId,undefined);
  assert.ok((await titles('owner')).includes('Declined the contract: First terms (version 1)'));
  a=await issue('Second terms');
  assert.equal((await call(`${base}/respond-agreement${q}`,'POST',{id:a.id,revision:a.revision,digest:a.digest,decision:'accept',signerName:'Amelia Taylor',consent:true},'client')).status,200);
  assert.ok((await titles('owner')).includes('Signed the contract: Second terms (version 2)'));
  a=(await call(base+q)).data.agreements[0];
  assert.equal((await call(`${base}/countersign-agreement${q}`,'POST',{id:a.id,revision:a.revision,signerName:'Amelia Taylor',consent:true},'client')).status,403);
  assert.equal((await call(`${base}/countersign-agreement${q}`,'POST',{id:a.id,revision:a.revision,signerName:'Someone else',consent:true})).status,400);
  assert.equal((await call(`${base}/countersign-agreement${q}`,'POST',{id:a.id,revision:a.revision,signerName:'nay studio',consent:false})).status,400);
  const signed=(await call(`${base}/countersign-agreement${q}`,'POST',{id:a.id,revision:a.revision,signerName:'nay studio',consent:true})).data.agreements[0];
  assert.equal(signed.status,'Accepted');assert.equal(signed.response.name,'Amelia Taylor');assert.equal(signed.countersignature.name,'NAY Studio');assert.equal(signed.countersignature.digest,signed.digest);assert.ok(signed.countersignature.at>=signed.response.at);
  assert.equal((await call(`${base}/countersign-agreement${q}`,'POST',{id:signed.id,revision:signed.revision,signerName:'NAY Studio',consent:true})).status,409);
  // The client sees the countersignature and is told about it; a signed copy with both signatures is archived.
  assert.equal((await call(base+q,'GET',null,'client')).data.agreements[0].countersignature.name,'NAY Studio');
  assert.ok((await titles('client')).includes('Countersigned the contract: Second terms (version 2)'));
  const docs=(await call(`/api/projects/${amelia.id}/documents${q}`)).data.documents,copy=docs.find(d=>d.title==='Second terms (signed)');
  assert.ok(copy);assert.match(copy.html,/Client: Amelia Taylor, signed by typed name on/);assert.match(copy.html,/Studio: NAY Studio, countersigned by typed name on/);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notification_events WHERE title LIKE 'Signed the contract%'").get().n>=1);
 }finally{await app.close();}
});

test('a proposal with a square-bracket gap or the old approach prompt is not shared',async()=>{
 const app=await start();
 try{
  const {call,q,amelia}=app,p=(await call(`/api/projects/${amelia.id}${q}`)).data.project;
  const share=extra=>call(`/api/projects/${amelia.id}/proposals${q}`,'POST',{title:'Proposal',scope:'Flowers.',delivery:'On the day.',expiresOn:'2099-01-01',briefRevision:p.briefRevision,estimateId:p.estimates.at(-1).id,previousId:p.proposals?.at(-1)?.id||null,...extra});
  let r=await share({documentHtml:'<h2>Our approach</h2><p>[Describe the creative direction, milestones and working relationship]</p>'});
  assert.equal(r.status,400);assert.equal(r.data.error,'Fill in [Describe the creative direction, milestones and working relationship] before sending this proposal. Replace each part in square brackets with the real detail.');
  r=await share({documentHtml:'<h2>Our approach</h2><p>Describe the creative direction, milestones and working relationship.</p>'});
  assert.equal(r.status,400);assert.match(r.data.error,/\[Our approach\]/);
  assert.equal((await share({scope:'Flowers for [room]',documentHtml:'<p>Ivory and sage.</p>'})).status,400);
  assert.equal((await share({documentHtml:'<p>Ivory and sage.</p>'})).status,200);
 }finally{await app.close();}
});
