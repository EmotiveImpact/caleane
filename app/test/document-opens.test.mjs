import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,id,makeProject,insertProject,saveProject,materializeProjectConversation} from '../store.mjs';
import {installDocumentOpens,recordDocumentOpen,documentOpens} from '../document-opens.mjs';
import {installNotificationFeed,listNotifications} from '../notification-feed.mjs';
import {syncPipeline,pipelineOverview,savePipelineSettings,installPipeline,handlePipeline} from '../pipeline-automation.mjs';
import {installEngagements} from '../engagements.mjs';
import {installForms} from '../forms.mjs';

async function setup(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-opens-')),db=openStore(path.join(dir,'opens.sqlite'));
 const studioId=id(),ownerId=id(),clientId=id(),viewerId=id(),owner={id:ownerId,name:'Studio Owner'},client={id:clientId,name:'Amara Okafor'},viewer={id:viewerId,name:'Tobi Okafor'};
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'wild-stem','Wild Stem','#181925','[]');
 for(const [u,mail] of [[owner,'owner@example.test'],[client,'amara@example.test'],[viewer,'tobi@example.test']])db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(u.id,mail,u.name,'unused');
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(ownerId,studioId,'owner');
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(clientId,studioId,'client');
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(viewerId,studioId,'client');
 installPipeline(db);installForms(db);installEngagements(db);installNotificationFeed(db);installDocumentOpens(db);
 const project=makeProject(studioId,{name:'Amara Okafor',email:'amara@example.test',occasion:'Wedding flowers',workflowType:'floral-design',date:'2099-06-12'},owner);
 insertProject(db,project);
 db.prepare('UPDATE crm_contacts SET user_id=? WHERE studio_id=? AND email=?').run(clientId,studioId,'amara@example.test');
 db.prepare("UPDATE crm_project_stakeholders SET portal_access=1,role='Approver' WHERE studio_id=? AND project_id=?").run(studioId,project.id);
 // A second person on the project who can see it but not its money.
 const contactId=id(),primary=db.prepare('SELECT * FROM crm_project_stakeholders WHERE studio_id=? AND project_id=? LIMIT 1').get(studioId,project.id);
 db.prepare('INSERT INTO crm_contacts(id,studio_id,name,email,user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(contactId,studioId,viewer.name,'tobi@example.test',viewerId,'2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z');
 db.prepare('INSERT INTO crm_project_stakeholders(studio_id,project_id,contact_id,role,primary_contact,portal_access) VALUES(?,?,?,?,0,1)').run(studioId,project.id,contactId,'Viewer');
 const read=()=>JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);
 const fresh=read(),estimateId=id(),proposalId=id();
 fresh.estimates=[{id:estimateId,version:1,briefRevision:fresh.briefRevision,title:'Flowers',note:'',currency:'GBP',items:[{title:'Bouquet',quantity:1,unitAmount:385000}],taxRate:0,subtotal:385000,tax:0,total:385000,status:'Awaiting review',at:'2099-05-01T09:00:00.000Z',by:owner.name}];
 fresh.proposals=[{id:proposalId,version:1,title:'Wedding flowers',scope:'Bouquets',exclusions:'',delivery:'On the day',expiresOn:'2099-05-30',estimate:structuredClone(fresh.estimates[0]),briefRevision:fresh.briefRevision,status:'Awaiting response',by:owner.name,createdAt:'2099-05-01T09:00:00.000Z'}];
 saveProject(db,fresh);
 return {dir,db,studioId,owner,client,viewer,project,proposalId,estimateId,read,primary};
}

test('a client opening a proposal is recorded once, counted by visit, and the owner is told',async()=>{
 const {dir,db,studioId,owner,client,viewer,project,proposalId}=await setup();
 try{
  const open=(user,at,extra={})=>recordDocumentOpen(db,{studioId,projectId:project.id,user,kind:'proposal',itemId:proposalId,at,...extra});
  assert.deepEqual(open(owner,'2099-05-02T09:00:00.000Z',{owner:true}),{recorded:false},'the studio looking at its own proposal does not count');
  assert.deepEqual(documentOpens(db,studioId,project.id),{});
  assert.equal(open(client,'2099-05-02T10:00:00.000Z').first,true);
  open(client,'2099-05-02T10:05:00.000Z');
  open(client,'2099-05-03T18:00:00.000Z');
  const seen=documentOpens(db,studioId,project.id)['proposal:'+proposalId];
  assert.equal(seen.firstOpenedAt,'2099-05-02T10:00:00.000Z');
  assert.equal(seen.lastOpenedAt,'2099-05-03T18:00:00.000Z');
  assert.equal(seen.opens,2,'a reload within half an hour is the same visit');
  assert.deepEqual(seen.people,['Amara Okafor']);

  const notes=listNotifications(db,{studioId,userId:owner.id,owner:true}).notifications;
  assert.equal(notes.filter(n=>/opened the proposal/.test(n.title)).length,1,'one notification for the first open');
  assert.equal(listNotifications(db,{studioId,userId:client.id,owner:false}).notifications.length,0,'the client is not told about their own open');
  const activity=db.prepare("SELECT * FROM crm_activities WHERE studio_id=? AND kind='Opened'").all(studioId);
  assert.equal(activity.length,1);assert.equal(activity[0].title,'Amara Okafor opened the proposal version 1');

  assert.throws(()=>open(viewer,'2099-05-02T11:00:00.000Z'),/Document not found/,'someone who cannot see prices cannot record a proposal open');
  assert.throws(()=>recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'proposal',itemId:id()}),/Document not found/);
  assert.throws(()=>recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'letter',itemId:proposalId}),/Choose a document/);
  assert.equal(recordDocumentOpen(db,{studioId,projectId:project.id,user:viewer,staffViewer:true,kind:'proposal',itemId:proposalId}).recorded,false);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('contracts can be opened by any invited client once issued, never as a draft',async()=>{
 const {dir,db,studioId,client,viewer,project}=await setup();
 try{
  const draftId=id(),issuedId=id(),p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data);
  db.prepare('INSERT INTO project_agreements VALUES(?,?,?,?,?)').run(draftId,studioId,project.id,1,JSON.stringify({id:draftId,version:1,title:'Draft terms',status:'Draft',briefRevision:p.briefRevision}));
  db.prepare('INSERT INTO project_agreements VALUES(?,?,?,?,?)').run(issuedId,studioId,project.id,2,JSON.stringify({id:issuedId,version:2,title:'Flower agreement',status:'Issued',issuedAt:'2099-05-01T09:00:00.000Z',expiresOn:'2099-05-30',briefRevision:p.briefRevision}));
  assert.throws(()=>recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'contract',itemId:draftId}),/Document not found/);
  recordDocumentOpen(db,{studioId,projectId:project.id,user:viewer,kind:'contract',itemId:issuedId,at:'2099-05-02T10:00:00.000Z'});
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'contract',itemId:issuedId,at:'2099-05-02T12:00:00.000Z'});
  const seen=documentOpens(db,studioId,project.id)['contract:'+issuedId];
  assert.deepEqual(seen.people,['Tobi Okafor','Amara Okafor']);assert.equal(seen.opens,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE studio_id=? AND kind='Opened'").get(studioId).n,1,'only the first person to open it is logged');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('the pipeline shows opens and adds one check-in task when an opened proposal goes unanswered',async()=>{
 const {dir,db,studioId,client,project,proposalId}=await setup();
 try{
  const oppId=db.prepare('SELECT id FROM crm_opportunities WHERE project_id=?').get(project.id).id;
  let signal=pipelineOverview(db,studioId,{asOf:'2099-05-03'}).signals[oppId];
  assert.ok(signal.flags.some(f=>f.kind==='unopened'),'a proposal out two days without an open is flagged');
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'proposal',itemId:proposalId,at:'2099-05-03T10:00:00.000Z'});
  signal=pipelineOverview(db,studioId,{asOf:'2099-05-03'}).signals[oppId];
  assert.equal(signal.proposal.openedAt,'2099-05-03T10:00:00.000Z');
  assert.ok(signal.flags.some(f=>f.kind==='opened'&&f.label==='Opened 3 May'));
  assert.ok(!signal.flags.some(f=>f.kind==='unopened'));

  const tasks=()=>db.prepare("SELECT * FROM crm_tasks WHERE studio_id=? AND title LIKE 'Check in with%'").all(studioId);
  syncPipeline(db,studioId,{asOf:'2099-05-06'});
  assert.equal(tasks().length,0,'off until the owner switches it on');
  savePipelineSettings(db,studioId,{nudgeOpened:true,nudgeOpenedDays:4});
  syncPipeline(db,studioId,{asOf:'2099-05-06'});
  assert.equal(tasks().length,0,'waits the chosen number of days');
  syncPipeline(db,studioId,{asOf:'2099-05-07'});
  syncPipeline(db,studioId,{asOf:'2099-05-08'});
  assert.equal(tasks().length,1,'one task, added once');
  assert.match(tasks()[0].title,/Check in with Amara Okafor about the proposal/);
  assert.match(tasks()[0].detail,/opened “Wedding flowers” on 3 May 2099/);
  assert.throws(()=>savePipelineSettings(db,studioId,{nudgeOpenedDays:0}),/between 1 and 30/);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('no check-in task when the client has written since opening',async()=>{
 const {dir,db,studioId,client,project,proposalId,read}=await setup();
 try{
  savePipelineSettings(db,studioId,{nudgeOpened:true,nudgeOpenedDays:2});
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'proposal',itemId:proposalId,at:'2099-05-03T10:00:00.000Z'});
  db.prepare('INSERT INTO conversation_messages(id,conversation_id,user_id,author_name,role,text,created_at) VALUES(?,?,?,?,?,?,?)').run(id(),materializeProjectConversation(db,read()).id,client.id,client.name,'client','Could we add a garland?','2099-05-04T09:00:00.000Z');
  syncPipeline(db,studioId,{asOf:'2099-05-08'});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crm_tasks WHERE studio_id=? AND title LIKE 'Check in with%'").get(studioId).n,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('each pipeline enquiry says whether the client opened its latest proposal or estimate, for the owner only',async()=>{
 const {dir,db,studioId,client,project,proposalId,estimateId}=await setup();
 try{
  const oppId=db.prepare('SELECT id FROM crm_opportunities WHERE project_id=?').get(project.id).id;
  const opened=()=>pipelineOverview(db,studioId,{asOf:'2099-05-03'}).signals[oppId].opened;
  assert.equal(opened(),null,'nothing opened yet');
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'estimate',itemId:estimateId,at:'2099-05-02T08:00:00.000Z'});
  assert.equal(opened(),null,'the estimate is not the latest document once a proposal is shared');
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'proposal',itemId:proposalId,at:'2099-05-02T23:52:00.000Z'});
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'proposal',itemId:proposalId,at:'2099-05-03T09:00:00.000Z'});
  assert.deepEqual(opened(),{kind:'proposal',people:['Amara Okafor'],firstOpenedAt:'2099-05-02T23:52:00.000Z',lastOpenedAt:'2099-05-03T09:00:00.000Z',opens:2});
  const req={method:'GET'};
  await assert.rejects(handlePipeline({db,req,route:'/api/pipeline',body:{},studio:{id:studioId},owner:false,reply:()=>assert.fail('a non-owner must not read the pipeline'),outbox:[]}),/Only the studio owner/);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('an estimate shared after the proposal is the latest document',async()=>{
 const {dir,db,studioId,client,project,read}=await setup();
 try{
  const p=read(),estimateId=id();
  p.estimates.push({...structuredClone(p.estimates[0]),id:estimateId,version:2,at:'2099-05-04T09:00:00.000Z'});
  p.estimates[0].status='Superseded';
  saveProject(db,p);
  recordDocumentOpen(db,{studioId,projectId:project.id,user:client,kind:'estimate',itemId:estimateId,at:'2099-05-04T10:00:00.000Z'});
  const oppId=db.prepare('SELECT id FROM crm_opportunities WHERE project_id=?').get(project.id).id;
  const seen=pipelineOverview(db,studioId,{asOf:'2099-05-04'}).signals[oppId].opened;
  assert.equal(seen.kind,'estimate');assert.deepEqual(seen.people,['Amara Okafor']);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
