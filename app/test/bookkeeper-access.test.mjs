import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {openStore} from '../store.mjs';

const origin='http://127.0.0.1:4320';
test('a bookkeeper reads studio finances and nothing else, and cannot change anything',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-bookkeeper-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.arrayBuffer()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id,q=`?studio=${studio}`;
  const project=(await call('/api/projects'+q,'GET',undefined,'owner')).data.projects.find(p=>p.clientEmail==='amelia@example.test');
  const estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Project scope',currency:'GBP',items:[{title:'Creative direction',quantity:2,unitAmount:12550}],taxRate:20},'owner')).data.project.estimates.at(-1);
  assert.equal((await call(`/api/projects/${project.id}/estimate-decision${q}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client')).status,200);
  const today=new Date().toISOString().slice(0,10);
  const issued=await call(`/api/projects/${project.id}/invoices${q}`,'POST',{estimateId:estimate.id,kind:'Deposit',amountMinor:10000,dueDate:today,supplyDate:today,sellerAddress:'Studio Lane, London',sellerContact:'studio@example.test',customerAddress:'Client Street, London',taxRegistration:'',paymentInstructions:'Bank transfer.'},'owner');
  assert.equal(issued.status,201);
  const invoice=issued.data.invoice;

  assert.equal((await call('/api/staff'+q,'POST',{email:'books@example.test',access:'auditor'},'owner')).status,400);
  const invite=await call('/api/staff'+q,'POST',{email:'books@example.test',access:'bookkeeper'},'owner');
  assert.equal(invite.status,201);
  assert.equal(invite.data.access,'bookkeeper');
  assert.equal((await call('/api/staff'+q,'GET',undefined,'owner')).data.pending[0].access,'bookkeeper');
  assert.equal((await call('/api/staff-invitations/claim','POST',{token:new URL(invite.data.url).hash.slice(1),name:'Bea Books',password:'BeaBooks2026!Ledger'},'books')).status,200);
  const me=(await call('/api/me','GET',undefined,'books')).data;
  assert.equal(me.studios[0].role,'staff_bookkeeper');
  const member=(await call('/api/staff'+q,'GET',undefined,'owner')).data.members.find(m=>m.email==='books@example.test');
  assert.equal(member.access,'bookkeeper');

  // Finances are readable.
  const ledger=await call('/api/invoices'+q,'GET',undefined,'books');
  assert.equal(ledger.status,200);
  assert.deepEqual(ledger.data.invoices.map(i=>i.id),[invoice.id]);
  const projectInvoices=await call(`/api/projects/${project.id}/invoices${q}`,'GET',undefined,'books');
  assert.equal(projectInvoices.status,200);
  assert.equal(projectInvoices.data.invoices[0].id,invoice.id);
  assert.equal((await call(`/api/projects/${project.id}/invoices/${invoice.id}${q}`,'GET',undefined,'books')).status,200);
  assert.equal((await call(`/api/projects/${project.id}/invoices/plan${q}`,'GET',undefined,'books')).status,200);

  // Projects come back as a finance summary only: no brief detail, messages, designs, tasks or activity.
  const projects=(await call('/api/projects'+q,'GET',undefined,'books')).data.projects;
  const summary=projects.find(p=>p.id===project.id);
  assert.equal(summary.accessRole,'Bookkeeper');
  assert.equal(summary.brief.name,project.brief.name);
  for(const key of ['messages','designs','tasks','activity','references','estimates','clientEmail'])assert.equal(summary[key],undefined,key);
  assert.equal(summary.brief.vision,undefined);

  // Nothing can be changed, and nothing outside finances can be opened.
  assert.equal((await call(`/api/projects/${project.id}/invoices/${invoice.id}/payments${q}`,'POST',{amountMinor:100,method:'bank_transfer',receivedAt:today},'books')).status,403);
  assert.equal((await call(`/api/projects/${project.id}/invoices/${invoice.id}/cancel${q}`,'POST',{reason:'No'},'books')).status,403);
  assert.equal((await call(`/api/projects/${project.id}/invoices${q}`,'POST',{estimateId:estimate.id,kind:'Balance'},'books')).status,403);
  assert.equal((await call(`/api/projects/${project.id}/invoices/${invoice.id}/attempts${q}`,'GET',undefined,'books')).status,403);
  for(const route of ['/api/clients','/api/conversations','/api/opportunities','/api/crm/tasks','/api/search?q=amelia&','/api/staff','/api/forms','/api/studio-export','/api/data-governance','/api/notifications',`/api/staff/projects/${project.id}`])
   assert.equal((await call(route+(route.endsWith('&')?`studio=${studio}`:q),'GET',undefined,'books')).status,403,route);
  assert.equal((await call(`/api/projects/${project.id}/messages${q}`,'POST',{text:'Hello',clientMessageId:'books-1'},'books')).status,403);
  assert.equal((await call('/api/settings'+q,'PATCH',{name:'Taken over'},'books')).status,403);

  // A bookkeeper cannot be given projects; switching them to a team member allows it again.
  const grant=`/api/staff/${member.id}/projects/${project.id}${q}`;
  assert.equal((await call(grant,'PATCH',{enabled:true},'owner')).status,409);
  assert.equal((await call(`/api/staff/${member.id}${q}`,'PATCH',{access:'owner'},'owner')).status,400);
  assert.equal((await call(`/api/staff/${member.id}${q}`,'PATCH',{access:'viewer'},'owner')).status,200);
  assert.equal((await call('/api/me','GET',undefined,'books')).data.studios[0].role,'staff_viewer');
  assert.equal((await call(grant,'PATCH',{enabled:true},'owner')).status,200);
  assert.equal((await call('/api/invoices'+q,'GET',undefined,'books')).status,403);
  // Becoming a bookkeeper ends project contribution.
  assert.equal((await call(`/api/staff/${member.id}${q}`,'PATCH',{access:'bookkeeper'},'owner')).status,200);
  assert.deepEqual((await call('/api/staff'+q,'GET',undefined,'owner')).data.members.find(m=>m.id===member.id).projectIds,[]);
  assert.equal((await call('/api/invoices'+q,'GET',undefined,'books')).status,200);
  // Removal ends access.
  assert.equal((await call(`/api/staff/${member.id}${q}`,'PATCH',{remove:true},'owner')).status,200);
  assert.equal((await call('/api/me','GET',undefined,'books')).data.studios.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});

test('older databases keep their team members when bookkeeper access is added',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-bookkeeper-upgrade-'));
 const file=path.join(dir,'workspace.sqlite');
 try{
  const legacy=new DatabaseSync(file);
  legacy.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);
   CREATE TABLE studios(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,accent TEXT NOT NULL,origins TEXT NOT NULL);
   CREATE TABLE studio_staff(user_id TEXT NOT NULL REFERENCES users(id),studio_id TEXT NOT NULL REFERENCES studios(id),access TEXT NOT NULL CHECK(access IN ('viewer')),joined_at TEXT NOT NULL,PRIMARY KEY(user_id,studio_id));
   CREATE TABLE staff_invitations(token TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),email TEXT NOT NULL,access TEXT NOT NULL CHECK(access IN ('viewer')),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
   INSERT INTO users VALUES('u1','member@example.test','Member','x');
   INSERT INTO studios VALUES('s1','studio','Studio','#181925','[]');
   INSERT INTO studio_staff VALUES('u1','s1','viewer','2026-01-01T00:00:00.000Z');
   INSERT INTO staff_invitations VALUES('t1','s1','new@example.test','viewer',9999999999999,0,'2026-01-01T00:00:00.000Z');`);
  legacy.close();
  const db=openStore(file);
  assert.deepEqual({...db.prepare('SELECT user_id,access FROM studio_staff').get()},{user_id:'u1',access:'viewer'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff_invitations').get().n,1);
  db.prepare("INSERT INTO staff_invitations VALUES('t2','s1','books@example.test','bookkeeper',1,0,'2026-01-01T00:00:00.000Z')").run();
  db.prepare("UPDATE studio_staff SET access='bookkeeper'").run();
  assert.throws(()=>db.prepare("UPDATE studio_staff SET access='owner'").run());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='staff_invitations_studio_email'").get());
  db.close();
  openStore(file).close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
