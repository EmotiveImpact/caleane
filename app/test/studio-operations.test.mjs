import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,id,makeProject,insertProject,saveProject} from '../store.mjs';
import {changeProjectOperations,getProjectOperations} from '../studio-operations.mjs';

test('date release requires accepted current scope and recorded deposit; profession steps persist with owner authority',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-operations-')),file=path.join(dir,'operations.sqlite');
 let db=openStore(file);
 const studioId=id(),ownerId=id(),clientId=id(),otherStudio=id(),actor={name:'Studio Owner'};
 const edit=(projectId,action,body,userId=ownerId,tenant=studioId)=>changeProjectOperations(db,{studioId:tenant,projectId,userId,action,body,asOf:'2026-09-30'});
 const read=(projectId,userId=ownerId)=>getProjectOperations(db,{studioId,projectId,userId,asOf:'2026-09-30'});
 const rejects=(fn,status)=>assert.throws(fn,error=>error.status===status);
 try{
  db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'flora-studio','Flora Studio','#181925','[]');
  db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(otherStudio,'other-studio','Other Studio','#181925','[]');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId,'owner@example.test',actor.name,'unused');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(clientId,'client@example.test','Client','unused');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(ownerId,studioId,'owner');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(clientId,studioId,'client');
  const project=makeProject(studioId,{name:'Client',email:'client@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-02-01'},actor);
  insertProject(db,project);
  db.prepare('UPDATE crm_contacts SET user_id=? WHERE studio_id=? AND email=?').run(clientId,studioId,'client@example.test');
  const hold=edit(project.id,'place-hold',{revision:0,startDate:'2099-02-01',endDate:'2099-02-02',holdUntil:'2099-01-15',location:'London venue',note:'Private logistics note'}).operations.booking.hold;
  assert.equal(read(project.id).booking.productionStatus,'Tentative hold');
  assert.equal(read(project.id,clientId).booking.hold.note,undefined);
  rejects(()=>edit(project.id,'confirm-booking',{revision:1,holdId:hold.id,proposalId:'missing',depositPolicy:'paid'}),409);
  rejects(()=>edit(project.id,'seed-milestones',{revision:0}),409);
  rejects(()=>edit(project.id,'seed-milestones',{revision:1},clientId),403);
  rejects(()=>edit(project.id,'seed-milestones',{revision:1},ownerId,otherStudio),404);
  const estimateId=id(),proposalId=id();
  project.proposals=[{id:proposalId,version:1,status:'Scope accepted',briefRevision:project.briefRevision,estimate:{id:estimateId,version:1,total:100000}}];
  // Read the latest row so the tentative hold is retained alongside the scope.
  const withHold=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);
  withHold.proposals=project.proposals;saveProject(db,withHold);
  rejects(()=>edit(project.id,'confirm-booking',{revision:1,holdId:hold.id,proposalId,depositPolicy:'paid'}),409);
  const invoiceId=id();
  db.prepare(`INSERT INTO invoices
   (id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
   VALUES(?,?,?,?,?,?,'Deposit','GBP',10000,10000,0,0,'2099-01-15','','Bank transfer','{}','2026-09-30','Studio Owner')`).run(invoiceId,studioId,project.id,'INV-2099-0001',estimateId,1);
  rejects(()=>edit(project.id,'confirm-booking',{revision:1,holdId:hold.id,proposalId,depositPolicy:'not_required',noDepositReason:'No deposit'}),409);
  db.prepare(`INSERT INTO invoice_payments
   (id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source)
   VALUES(?,?,?,5000,'bank_transfer','BANK-1','2026-09-30','','2026-09-30T12:00:00Z','Studio Owner','owner_recorded')`).run(id(),studioId,invoiceId);
  rejects(()=>edit(project.id,'confirm-booking',{revision:1,holdId:hold.id,proposalId,depositPolicy:'paid'}),409);
  db.prepare(`INSERT INTO invoice_payments
   (id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source)
   VALUES(?,?,?,5000,'bank_transfer','BANK-2','2026-09-30','','2026-09-30T12:01:00Z','Studio Owner','owner_recorded')`).run(id(),studioId,invoiceId);
  const confirmed=edit(project.id,'confirm-booking',{revision:1,holdId:hold.id,proposalId,depositPolicy:'paid'}).operations;
  assert.equal(confirmed.booking.productionStatus,'Ready to begin');
  assert.equal(confirmed.booking.hold.productionRelease.depositInvoiceId,invoiceId);
  assert.equal(confirmed.booking.hold.productionRelease.paymentEvidence,'Owner-recorded external payment');
  assert.equal(read(project.id,clientId).booking.hold.productionRelease,undefined);
  rejects(()=>edit(project.id,'place-hold',{revision:2,startDate:'2099-03-01',holdUntil:'2099-02-01'}),409);
  const steps=edit(project.id,'seed-milestones',{revision:2}).operations;
  assert.equal(steps.milestones.length,5);
  assert.equal(steps.templateId,'floral-design');
  assert.equal(steps.milestones[2].title,'Arrangement recipe and quantities');
  const first=steps.milestones[0];
  const updated=edit(project.id,'update-milestone',{revision:3,milestoneId:first.id,title:first.title,detail:'Client agreed on whites and foliage.',dueDate:'2099-01-10',status:'Complete',visibleToClient:true}).operations;
  assert.equal(updated.milestones[0].status,'Complete');
  rejects(()=>edit(project.id,'update-milestone',{revision:4,milestoneId:first.id,title:first.title,detail:'',dueDate:'',status:'In progress',visibleToClient:true}),400);
  const privateStep=edit(project.id,'add-milestone',{revision:4,title:'Supplier margin check',detail:'Private planning',dueDate:'',visibleToClient:false}).operations.milestones.at(-1);
  assert.equal(read(project.id,clientId).milestones.some(step=>step.id===privateStep.id),false);
  rejects(()=>edit(project.id,'archive-milestone',{revision:5,milestoneId:first.id,reason:'Changed scope'},clientId),403);
  const newer=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);
  newer.proposals.push({id:id(),version:2,status:'Awaiting response',briefRevision:newer.briefRevision,estimate:{id:id(),version:2}});saveProject(db,newer);
  assert.equal(read(project.id).booking.productionStatus,'Needs review');
  assert.equal(edit(project.id,'release-booking',{revision:5,holdId:hold.id,reason:'Client requested a new date'}).operations.booking.productionStatus,'Date released');
  db.close();db=openStore(file);
  assert.equal(read(project.id).holds[0].releaseReason,'Client requested a new date');
  assert.equal(read(project.id).milestones[0].status,'Complete');
  assert.equal(read(project.id).revision,6);

  const second=makeProject(studioId,{name:'Second Client',email:'second@example.test',occasion:'Commission',workflowType:'bespoke-making',date:'2099-06-01'},actor);
  second.proposals=[{id:id(),version:1,status:'Scope accepted',briefRevision:1,estimate:{id:id(),version:1,total:20000}}];insertProject(db,second);
  const secondHold=edit(second.id,'place-hold',{revision:0,startDate:'2099-06-01',holdUntil:'2099-05-01'}).operations.booking.hold;
  rejects(()=>edit(second.id,'confirm-booking',{revision:1,holdId:secondHold.id,proposalId:second.proposals[0].id,depositPolicy:'not_required',noDepositReason:''}),400);
  const waived=edit(second.id,'confirm-booking',{revision:1,holdId:secondHold.id,proposalId:second.proposals[0].id,depositPolicy:'not_required',noDepositReason:'Payment on delivery agreed with client.'}).operations;
  assert.equal(waived.booking.productionStatus,'Ready to begin');
  assert.equal(waived.booking.deposit.status,'Not required');
  assert.equal(waived.booking.hold.productionRelease.noDepositReason,'Payment on delivery agreed with client.');
  const overlapping=makeProject(studioId,{name:'Third Client',email:'third@example.test',occasion:'Commission',workflowType:'bespoke-making',date:'2099-06-01'},actor);
  overlapping.proposals=[{id:id(),version:1,status:'Scope accepted',briefRevision:1,estimate:{id:id(),version:1,total:30000}}];insertProject(db,overlapping);
  const overlap=edit(overlapping.id,'place-hold',{revision:0,startDate:'2099-06-01',holdUntil:'2099-05-01'}).operations;
  assert.equal(overlap.booking.conflicts[0].projectId,second.id);
  rejects(()=>edit(overlapping.id,'confirm-booking',{revision:1,holdId:overlap.booking.hold.id,proposalId:overlapping.proposals[0].id,depositPolicy:'not_required',noDepositReason:'Payment on delivery.'}),400);
  const confirmedOverlap=edit(overlapping.id,'confirm-booking',{revision:1,holdId:overlap.booking.hold.id,proposalId:overlapping.proposals[0].id,depositPolicy:'not_required',noDepositReason:'Payment on delivery.',overlapNote:'Separate maker assigned to this commission.'}).operations;
  assert.deepEqual(confirmedOverlap.booking.hold.productionRelease.overlapProjectIds,[second.id]);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
