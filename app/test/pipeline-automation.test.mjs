import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,id,makeProject,insertProject,saveProject,materializeProjectConversation} from '../store.mjs';
import {syncPipeline,pipelineOverview,savePipelineSettings,budgetMinor,installPipeline,followUpAction} from '../pipeline-automation.mjs';
import {updateOpportunity} from '../crm.mjs';
import {getPlan} from '../payment-plans.mjs';
import {installForms} from '../forms.mjs';

test('budget text is read as the highest figure',()=>{
 assert.equal(budgetMinor('£5,000 to £7,500'),750000);
 assert.equal(budgetMinor('around 6k'),600000);
 assert.equal(budgetMinor('To discuss'),null);
});

test('the pipeline follows quotes, holds, follow-ups, acceptance and deposits without overruling the owner',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-pipeline-')),db=openStore(path.join(dir,'pipeline.sqlite'));
 const studioId=id(),ownerId=id(),clientId=id(),owner={id:ownerId,name:'Studio Owner'};
 const read=table=>JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(table).data);
 const opportunity=projectId=>db.prepare('SELECT * FROM crm_opportunities WHERE project_id=?').get(projectId);
 try{
  db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'wild-stem','Wild Stem','#181925','[]');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId,'owner@example.test',owner.name,'unused');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(clientId,'amara@example.test','Amara Okafor','unused');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(ownerId,studioId,'owner');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(clientId,studioId,'client');
  installPipeline(db);installForms(db);
  const project=makeProject(studioId,{name:'Amara Okafor',email:'amara@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-06-12',venue:'Hedingham Castle, Essex',budget:'£4,000'},owner);
  insertProject(db,project);
  db.prepare('UPDATE crm_contacts SET user_id=? WHERE studio_id=? AND email=?').run(clientId,studioId,'amara@example.test');
  // Another wedding is already confirmed on the same Saturday.
  const other=makeProject(studioId,{name:'Fairley',email:'fairley@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-06-12'},owner);
  other.operations={revision:1,holds:[{id:id(),startDate:'2099-06-12',endDate:'2099-06-12',holdUntil:'2099-06-01',status:'Confirmed',location:'',note:''}],milestones:[]};
  insertProject(db,other);
  assert.equal(opportunity(project.id).stage,'Discovery');

  const estimateId=id(),proposalId=id(),fresh=read(project.id);
  fresh.estimates=[{id:estimateId,version:1,briefRevision:fresh.briefRevision,title:'Flowers',note:'',currency:'GBP',items:[{title:'Bridal bouquet',quantity:1,unitAmount:28500}],taxRate:0,subtotal:385000,tax:0,total:385000,status:'Awaiting review',at:'2099-05-01T09:00:00.000Z',by:owner.name}];
  fresh.proposals=[{id:proposalId,version:1,title:'Wedding flowers',scope:'Bouquets',exclusions:'',delivery:'Set-up on the day',expiresOn:'2099-05-20',estimate:structuredClone(fresh.estimates[0]),briefRevision:fresh.briefRevision,status:'Awaiting response',by:owner.name,createdAt:'2099-05-01T09:00:00.000Z'}];
  saveProject(db,fresh);

  syncPipeline(db,studioId,{asOf:'2099-05-01'});
  let opp=opportunity(project.id);
  assert.equal(opp.stage,'Negotiation','a shared quote moves the enquiry to awaiting decision');
  assert.equal(opp.amount_minor,385000,'the value comes from the quote');
  const hold=read(project.id).operations.holds.at(-1);
  assert.equal(hold.status,'Held');assert.equal(hold.holdUntil,'2099-05-20','the date is held until the proposal closes');

  let overview=pipelineOverview(db,studioId,{asOf:'2099-05-01'});
  let signal=overview.signals[opp.id];
  assert.ok(signal.flags.some(f=>f.kind==='clash'),'a full date is flagged');
  const day=overview.dates.find(d=>d.date==='2099-06-12');
  assert.equal(day.booked.length,1);assert.equal(day.held.length,1);assert.equal(day.state,'full');

  savePipelineSettings(db,studioId,{minimumSpend:5000,serviceAreas:'London, Surrey',followUps:true});
  signal=pipelineOverview(db,studioId,{asOf:'2099-05-01'}).signals[opp.id];
  assert.ok(signal.flags.some(f=>f.kind==='budget'));assert.ok(signal.flags.some(f=>f.kind==='area'));
  assert.equal(signal.nextFollowUp,'2099-05-04');

  // An owner who moves the enquiry back by hand keeps that decision.
  updateOpportunity(db,studioId,owner,opp.id,{revision:opp.revision,stage:'Proposal'});
  syncPipeline(db,studioId,{asOf:'2099-05-02'});
  assert.equal(opportunity(project.id).stage,'Proposal');

  const messages=()=>db.prepare("SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=? ORDER BY m.created_at").all(project.id);
  syncPipeline(db,studioId,{asOf:'2099-05-03'});
  assert.equal(messages().length,0,'no follow-up before the first interval');
  syncPipeline(db,studioId,{asOf:'2099-05-04'});
  syncPipeline(db,studioId,{asOf:'2099-05-04'});
  assert.equal(messages().length,1,'one follow-up, sent once');
  assert.match(messages()[0].text,/Hi Amara/);
  // The client replies, so the sequence stops.
  db.prepare('INSERT INTO conversation_messages(id,conversation_id,user_id,author_name,role,text,created_at) VALUES(?,?,?,?,?,?,?)').run(id(),materializeProjectConversation(db,read(project.id)).id,clientId,'Amara Okafor','client','Can we talk about the arch?','2099-05-05T10:00:00.000Z');
  syncPipeline(db,studioId,{asOf:'2099-05-10'});
  assert.equal(messages().filter(m=>m.role==='owner').length,1,'follow-ups stop when the client replies');

  // The client accepts: the estimate is confirmed, a payment plan is made and a deposit task appears.
  const accepted=read(project.id);Object.assign(accepted.proposals[0],{status:'Scope accepted',decidedBy:'Amara Okafor',decidedAt:'2099-05-10T11:00:00.000Z'});saveProject(db,accepted);
  syncPipeline(db,studioId,{asOf:'2099-05-10'});
  assert.equal(read(project.id).estimates[0].status,'Budget confirmed');
  assert.ok(getPlan(db,studioId,project.id),'payment plan created');
  assert.ok(db.prepare("SELECT 1 FROM crm_tasks WHERE opportunity_id=? AND title='Issue the deposit invoice'").get(opp.id));
  assert.ok(pipelineOverview(db,studioId,{asOf:'2099-05-10'}).signals[opp.id].flags.some(f=>f.kind==='deposit'));

  // The deposit is paid: the held date is confirmed and the enquiry is won.
  const invoiceId=id();
  db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
   VALUES(?,?,?,?,?,1,'Deposit','GBP',115500,115500,0,0,'2099-05-20','','Bank transfer','{}','2099-05-10','Studio Owner')`).run(invoiceId,studioId,project.id,'INV-2099-0001',estimateId);
  db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source)
   VALUES(?,?,?,115500,'bank_transfer','BANK-1','2099-05-11','','2099-05-11T12:00:00Z','Studio Owner','owner_recorded')`).run(id(),studioId,invoiceId);
  syncPipeline(db,studioId,{asOf:'2099-05-11'});
  assert.equal(read(project.id).operations.holds.at(-1).status,'Confirmed');
  opp=opportunity(project.id);
  assert.equal(opp.stage,'Won');assert.equal(opp.probability,100);
  const titles=db.prepare('SELECT title FROM crm_activities WHERE opportunity_id=? ORDER BY created_at').all(opp.id).map(a=>a.title);
  assert.ok(titles.includes('Date confirmed'));assert.ok(titles.includes('Moved from Proposal to Won'));

  const insights=pipelineOverview(db,studioId).insights;
  assert.equal(insights.overall.won,2,'both confirmed weddings count as won');
  assert.ok(insights.stageDays.length===4);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('the owner can send a follow-up early or pause them, and optional rules add prep tasks and close silent enquiries',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-pipeline-')),db=openStore(path.join(dir,'pipeline.sqlite'));
 const studioId=id(),ownerId=id(),owner={id:ownerId,name:'Studio Owner'};
 const read=projectId=>JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(projectId).data);
 const opportunity=projectId=>db.prepare('SELECT * FROM crm_opportunities WHERE project_id=?').get(projectId);
 const messages=projectId=>db.prepare("SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=?").all(projectId);
 try{
  db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'wild-stem','Wild Stem','#181925','[]');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId,'owner@example.test',owner.name,'unused');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(ownerId,studioId,'owner');
  installPipeline(db);installForms(db);
  const project=makeProject(studioId,{name:'Bea Lowe',email:'bea@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-06-12'},owner);insertProject(db,project);
  const other=makeProject(studioId,{name:'Fairley',email:'fairley@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-06-12'},owner);
  other.operations={revision:1,holds:[{id:id(),startDate:'2099-06-12',endDate:'2099-06-12',holdUntil:'2099-06-01',status:'Confirmed',location:'',note:''}],milestones:[]};insertProject(db,other);
  const fresh=read(project.id),estimateId=id();
  fresh.estimates=[{id:estimateId,version:1,briefRevision:fresh.briefRevision,title:'Flowers',note:'',currency:'GBP',items:[{title:'Bouquet',quantity:1,unitAmount:100000}],taxRate:0,subtotal:100000,tax:0,total:100000,status:'Awaiting review',at:'2099-05-01T09:00:00.000Z',by:owner.name}];
  fresh.proposals=[{id:id(),version:1,title:'Flowers',scope:'Bouquet',exclusions:'',delivery:'On the day',expiresOn:'2099-06-01',estimate:structuredClone(fresh.estimates[0]),briefRevision:fresh.briefRevision,status:'Awaiting response',by:owner.name,createdAt:'2099-05-01T09:00:00.000Z'}];
  saveProject(db,fresh);
  syncPipeline(db,studioId,{asOf:'2099-05-01'});
  const opp=opportunity(project.id);
  const signal=pipelineOverview(db,studioId,{asOf:'2099-05-01'}).signals[opp.id];
  assert.deepEqual(signal.alternatives,['2099-05-29','2099-06-05','2099-06-19'],'a full date suggests the nearest free dates a week either side');
  followUpAction(db,studioId,{opportunityId:opp.id,action:'send'});
  assert.equal(messages(project.id).length,1,'send now posts the first follow-up straight away');
  followUpAction(db,studioId,{opportunityId:opp.id,action:'pause'});
  savePipelineSettings(db,studioId,{followUps:true});
  syncPipeline(db,studioId,{asOf:'2099-05-20'});
  assert.equal(messages(project.id).length,1,'a paused sequence sends nothing');
  assert.equal(pipelineOverview(db,studioId,{asOf:'2099-05-20'}).signals[opp.id].followUpsPaused,true);
  followUpAction(db,studioId,{opportunityId:opp.id,action:'resume'});
  syncPipeline(db,studioId,{asOf:'2099-05-20'});
  assert.equal(messages(project.id).length,2,'resuming sends the next follow-up that is due');
  db.prepare('INSERT INTO consultations VALUES(?,?,?,?,?,?,?)').run(id(),studioId,'2099-05-25T10:00:00.000Z','2099-05-25T10:30:00.000Z','Booked',JSON.stringify({clientId:opp.client_id}),'2099-05-20T09:00:00.000Z');
  savePipelineSettings(db,studioId,{prepBeforeConsultation:true,closeSilent:true,closeSilentDays:21});
  syncPipeline(db,studioId,{asOf:'2099-05-22'});
  const prep=db.prepare("SELECT * FROM crm_tasks WHERE opportunity_id=? AND title LIKE 'Prepare for the consultation%'").get(opp.id);
  assert.equal(prep.due_date,'2099-05-24','the prep task is due the day before the consultation');
  assert.equal(opportunity(project.id).stage,'Lost','no reply for 21 days closes the enquiry');
  assert.equal(opportunity(project.id).lost_reason,'No response');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
