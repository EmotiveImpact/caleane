import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {openStore,id,makeProject,insertProject,saveProject} from '../store.mjs';
import {syncPipeline,installPipeline} from '../pipeline-automation.mjs';
import {dueDateFor,stepDueDate} from '../payment-plans.mjs';
import {getProjectOperations} from '../studio-operations.mjs';

const origin='http://127.0.0.1:4320';
const later=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);

async function workspace(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-deposits-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0],suffix=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 await call('/api/billing-defaults'+suffix,'POST',{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:30,due:{type:'on_issue',days:0}},{label:'Balance',percent:70,due:{type:'days_before_event',days:14}}]},'owner');
 return {ws,call,suffix,project};
}
function setDate(ws,projectId,date){const row=ws.db.prepare('SELECT data FROM projects WHERE id=?').get(projectId),p=JSON.parse(row.data);p.brief.date=date;ws.db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),projectId);}
async function confirmEstimate(call,suffix,project,total){
 const estimate=(await call(`/api/projects/${project.id}/estimates${suffix}`,'POST',{title:'Scope',currency:'GBP',items:[{title:'Styling',quantity:1,unitAmount:total}],taxRate:0},'owner')).data.project.estimates.at(-1);
 assert.equal((await call(`/api/projects/${project.id}/estimate-decision${suffix}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client')).status,200);
 return estimate;
}

test('a payment tied to the event date waits for the date instead of falling due today',()=>{
 const due={type:'days_before_event',days:14};
 assert.equal(dueDateFor(due,{today:'2026-10-09',eventDate:''}),'');
 assert.equal(dueDateFor(due,{today:'2026-10-09',eventDate:'2027-06-12'}),'2027-05-29');
 assert.equal(stepDueDate({dueDate:'',due},{brief:{date:''}}),'');
 assert.equal(stepDueDate({dueDate:'',due},{brief:{date:'2027-06-12'}}),'2027-05-29','the date follows once the project has one');
});

test('a plan on a project with no date asks for the service date and due date it needs',async t=>{
 const {ws,call,suffix,project}=await workspace(t);
 setDate(ws,project.id,'');
 await confirmEstimate(call,suffix,project,100000);
 const route=`/api/projects/${project.id}/invoices/plan${suffix}`;
 let plan=(await call(route,'POST',{action:'create'},'owner')).data.plan;
 assert.equal(plan.steps[1].dueDate,'','the balance waits for the event date');
 let response=await call(route,'POST',{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.status,400);assert.equal(response.data.error,'Add the service date.','the studio is told exactly what is missing');
 response=await call(route,'POST',{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London',supplyDate:later(60)},'owner');
 assert.equal(response.status,201);assert.equal(response.data.invoice.snapshot.supplyDate,later(60));
 plan=response.data.plan;
 response=await call(route,'POST',{action:'issue',stepId:plan.steps[1].id,customerAddress:'Client Street, London',supplyDate:later(60)},'owner');
 assert.equal(response.status,400);assert.equal(response.data.error,'Add the due date.');
 // Once the project has a date, the balance is dated from it and issues without asking.
 setDate(ws,project.id,later(100));
 assert.equal((await call(route,'GET',undefined,'owner')).data.plan.steps[1].dueDate,later(86));
 response=await call(route,'POST',{action:'issue',stepId:plan.steps[1].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.status,201);assert.equal(response.data.invoice.dueDate,later(86));
});

test('a deposit issued from the invoice form takes its place in the payment plan',async t=>{
 const {call,suffix,project}=await workspace(t);
 await confirmEstimate(call,suffix,project,100000);
 const plan=(await call(`/api/projects/${project.id}/invoices/plan${suffix}`,'POST',{action:'create'},'owner')).data.plan;
 const estimateId=(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(item=>item.id===project.id).estimates.at(-1).id;
 const issued=await call(`/api/projects/${project.id}/invoices${suffix}`,'POST',{estimateId,kind:'Deposit',amountMinor:25000,dueDate:later(7),customerAddress:'Client Street, London'},'owner');
 assert.equal(issued.status,201);
 const after=(await call(`/api/projects/${project.id}/invoices/plan${suffix}`,'GET',undefined,'owner')).data.plan;
 assert.equal(after.steps[0].invoice?.id,issued.data.invoice.id,'the plan does not offer the deposit again');
 assert.equal(after.steps[0].amountMinor,25000);assert.equal(after.steps[1].amountMinor,75000,'the balance absorbs the difference');
 assert.equal(after.steps[0].id,plan.steps[0].id);
});

test('a paid deposit tidies up the enquiry even without a proposal or an event date',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-deposit-tidy-')),db=openStore(path.join(dir,'tidy.sqlite'));
 const studioId=id(),ownerId=id(),owner={id:ownerId,name:'Studio Owner'};
 try{
  db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'tidy','Tidy Studio','#181925','[]');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId,'owner@tidy.test',owner.name,'unused');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(ownerId,studioId,'owner');
  installPipeline(db);
  const project=makeProject(studioId,{name:'Zara Audit',email:'zara@example.test',occasion:'Private dinner',workflowType:'event-styling',date:''},owner);
  insertProject(db,project);
  const opp=db.prepare('SELECT * FROM crm_opportunities WHERE project_id=?').get(project.id);
  const estimateId=id(),p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);
  p.estimates=[{id:estimateId,version:1,briefRevision:p.briefRevision,title:'Dinner',note:'',currency:'GBP',items:[],taxRate:0,subtotal:255000,tax:0,total:255000,status:'Budget confirmed',at:'2026-10-01T09:00:00.000Z',by:owner.name}];
  saveProject(db,p);
  db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,'Issue the deposit invoice','',?,'High',0,?,'',?)`).run(id(),studioId,opp.client_id,opp.id,'2026-10-01','2026-10-01T09:00:00.000Z','Caleane automation');
  const invoiceId=id();
  db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
   VALUES(?,?,?,'INV-2026-0001',?,1,'Deposit','GBP',76500,76500,0,0,'2026-10-20','','Bank transfer','{}','2026-10-02','Studio Owner')`).run(invoiceId,studioId,project.id,estimateId);
  syncPipeline(db,studioId,{asOf:'2026-10-02'});
  assert.equal(db.prepare("SELECT completed FROM crm_tasks WHERE opportunity_id=?").get(opp.id).completed,1,'issuing the deposit completes the task');
  assert.notEqual(db.prepare('SELECT stage FROM crm_opportunities WHERE id=?').get(opp.id).stage,'Won','an unpaid deposit keeps the enquiry open');
  assert.equal(getProjectOperations(db,{studioId,projectId:project.id,userId:ownerId,asOf:'2026-10-02'}).booking.deposit.status,'Unpaid');
  db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source)
   VALUES(?,?,?,76500,'bank_transfer','BANK-1','2026-10-03','','2026-10-03T12:00:00Z','Studio Owner','owner_recorded')`).run(id(),studioId,invoiceId);
  assert.equal(getProjectOperations(db,{studioId,projectId:project.id,userId:ownerId,asOf:'2026-10-03'}).booking.deposit.status,'Paid','Delivery sees the paid deposit without a proposal');
  syncPipeline(db,studioId,{asOf:'2026-10-03'});
  assert.equal(db.prepare('SELECT stage FROM crm_opportunities WHERE id=?').get(opp.id).stage,'Won');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM clients WHERE id=?').get(opp.client_id).data).stage,'Active');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data).status,'Planning');
  // An owner who moves the client back by hand is not overruled.
  const client=JSON.parse(db.prepare('SELECT data FROM clients WHERE id=?').get(opp.client_id).data);client.stage='Lead';db.prepare('UPDATE clients SET data=? WHERE id=?').run(JSON.stringify(client),opp.client_id);
  syncPipeline(db,studioId,{asOf:'2026-10-04'});
  assert.equal(JSON.parse(db.prepare('SELECT data FROM clients WHERE id=?').get(opp.client_id).data).stage,'Lead');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
