import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,hash,makeProject,insertProject,materializeProjectConversation,appendConversationMessage,conversationDTO} from '../store.mjs';
import {joinStatus,hasJoinedClient} from '../relationships.mjs';
import {createNotificationOutbox} from '../notifications.mjs';

const origin='http://127.0.0.1:4321';
function seed(db){
 const studioId=randomUUID(),owner={id:randomUUID(),name:'Studio Owner',email:'owner@example.test'};
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'lead-studio','Lead Studio','#222222','[]');
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(owner.id,owner.email,owner.name,'test-password');
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(owner.id,studioId,'owner');
 // A public enquiry: a project and contact with portal access, but no login.
 const project=makeProject(studioId,{name:'Sophie Lead',email:'sophie@example.test',occasion:'Private dinner'},owner);
 insertProject(db,project);
 return {studioId,owner,project,c:materializeProjectConversation(db,project)};
}
function join(db,studioId,email,name){
 const userId=randomUUID();db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId,email,name,'test-password');
 db.prepare('UPDATE crm_contacts SET user_id=? WHERE studio_id=? AND email=?').run(userId,studioId,email);
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(userId,studioId,'client');
 return userId;
}

test('a lead from a form has not joined until they accept an invitation, and the studio is told so',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-leads-')),db=openStore(path.join(dir,'leads.sqlite'));
 try{
  const {studioId,owner,project,c}=seed(db);
  assert.equal(hasJoinedClient(db,studioId,project.id),false,'portal access alone is not joining');
  const status=joinStatus(db,studioId,{projectId:project.id});
  assert.equal(status.joined,false);
  assert.deepEqual(status.waiting.map(p=>[p.name,p.email,p.invited]),[['Sophie Lead','sophie@example.test',false]]);
  assert.deepEqual(conversationDTO(db,c,owner).waitingToJoin.map(p=>p.email),['sophie@example.test'],'the studio sees who cannot read the conversation');
  db.prepare('INSERT INTO invitations VALUES(?,?,?,?,0)').run(hash(randomBytes(32).toString('hex')),studioId,'sophie@example.test',Date.now()+86400000);
  assert.equal(joinStatus(db,studioId,{projectId:project.id}).waiting[0].invited,true,'a waiting invitation is shown as such');
  const userId=join(db,studioId,'sophie@example.test','Sophie Lead');
  assert.equal(hasJoinedClient(db,studioId,project.id),true);
  assert.deepEqual(conversationDTO(db,c,owner).waitingToJoin,[]);
  assert.equal(conversationDTO(db,c,{id:userId,name:'Sophie Lead'}).waitingToJoin,undefined,'clients never see the studio list of who has joined');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('with email switched on, a reply to a lead goes to their enquiry address with their own invitation link',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-leads-')),db=openStore(path.join(dir,'leads.sqlite'));
 try{
  const {studioId,owner,c}=seed(db),outbox=createNotificationOutbox(db,{encryptionKey:randomBytes(32),origin});
  const first=appendConversationMessage(db,c,owner,'owner','Thank you for your enquiry.');
  assert.deepEqual(outbox.enqueueMessage({studioId,conversationId:c.id,messageId:first,actorUserId:owner.id,delayMs:0}),['sophie@example.test']);
  const second=appendConversationMessage(db,c,owner,'owner','One more thing.');
  assert.deepEqual(outbox.enqueueMessage({studioId,conversationId:c.id,messageId:second,actorUserId:owner.id,delayMs:0}),[],'later messages ride on the email already waiting');
  const sent=[];assert.equal((await outbox.dispatchOne(async m=>{sent.push(m);return {id:'p1'};})).state,'sent');
  assert.equal(sent[0].to,'sophie@example.test');
  assert.match(sent[0].text,/Studio Owner wrote to you about “Private dinner · Sophie Lead”/);
  const token=sent[0].text.match(/\/join#([a-f0-9]{64})/)?.[1];assert.ok(token,'the email carries an invitation link');
  const invite=db.prepare('SELECT * FROM invitations WHERE token=?').get(hash(token));
  assert.equal(invite.email,'sophie@example.test');assert.equal(invite.used,0);assert.equal(invite.studio_id,studioId);
  assert.equal(await outbox.dispatchOne(async()=>({})),null,'one email, not one per message');
  // Once they join, a queued lead email is no longer needed.
  const third=appendConversationMessage(db,c,owner,'owner','See you soon.');
  outbox.enqueueMessage({studioId,conversationId:c.id,messageId:third,actorUserId:owner.id,delayMs:0});
  join(db,studioId,'sophie@example.test','Sophie Lead');
  assert.equal((await outbox.dispatchOne(async()=>({id:'p2'}))).state,'cancelled');
  // A project update from the studio reaches a lead the same way.
  const other=makeProject(studioId,{name:'Noah Lead',email:'noah@example.test',occasion:'Brand launch'},owner);other.activity=[{id:'event-1',text:'Shared a proposal',at:new Date().toISOString()}];insertProject(db,other);
  const queued=outbox.enqueueProjectActivity({studioId,projectId:other.id,actorUserId:owner.id,eventId:'event-1'});
  assert.equal(queued.length,1);
  const update=[];await outbox.dispatchOne(async m=>{update.push(m);return {id:'p3'};});
  assert.equal(update[0].to,'noah@example.test');assert.match(update[0].text,/Join to see it and reply: http:\/\/127\.0\.0\.1:4321\/join#[a-f0-9]{64}/);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
