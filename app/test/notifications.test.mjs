import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,hash,makeProject,insertProject} from '../store.mjs';
import {bindInvitedContact} from '../relationships.mjs';
import {createNotificationOutbox,createResendDelivery} from '../notifications.mjs';

const origin='http://127.0.0.1:4321';
const key=randomBytes(32);
function seed(db){
 const studioId=randomUUID(),owner={id:randomUUID(),name:'Studio Owner',email:'owner@example.test'},client={id:randomUUID(),name:'Client One',email:'client@example.test'};
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'test-studio','Test Studio','#222222','[]');
 for(const [person,role] of [[owner,'owner'],[client,'client']]){
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(person.id,person.email,person.name,'test-password');
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(person.id,studioId,role);
 }
 const project=makeProject(studioId,{name:client.name,email:client.email,occasion:'Studio project'},client);
 insertProject(db,project);bindInvitedContact(db,studioId,client.email,client.id);
 return {studioId,owner,client,project};
}
function invitation(db,studioId,email,token=randomBytes(32).toString('hex'),expires=Date.now()+7*86400000){
 db.prepare('INSERT INTO invitations VALUES(?,?,?,?,0)').run(hash(token),studioId,email,expires);
 return {token,url:`${origin}/join#${token}`};
}

test('invitation outbox survives restart, hides the link at rest and sends only a current invitation once',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-notifications-')),file=path.join(dir,'mail.sqlite');
 let db=openStore(file);
 try{
  const {studioId,client}=seed(db),first=invitation(db,studioId,client.email);
  let outbox=createNotificationOutbox(db,{encryptionKey:key,origin});
  const queued=outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:first.url});
  assert.deepEqual(outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:first.url}),queued);
  const saved=db.prepare('SELECT * FROM notification_outbox WHERE id=?').get(queued.id);
  assert.equal(saved.state,'pending');assert.ok(!JSON.stringify(saved).includes(first.token));
  db.close();db=openStore(file);outbox=createNotificationOutbox(db,{encryptionKey:key,origin});
  const deliveries=[];let result=await outbox.dispatchOne(async message=>{deliveries.push(message);return {id:'provider-1'};});
  assert.deepEqual(result,{id:queued.id,state:'sent'});
  assert.equal(deliveries.length,1);assert.equal(deliveries[0].to,client.email);
  assert.ok(deliveries[0].text.includes(first.url));
  assert.equal(deliveries[0].idempotencyKey,queued.id);
  assert.equal((await outbox.dispatchOne(async()=>{throw Error('should not send twice');})),null);
  assert.equal(db.prepare('SELECT payload FROM notification_outbox WHERE id=?').get(queued.id).payload,'');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('reissued or claimed invitation is never delivered from an old queued notification',async()=>{
 const db=openStore(':memory:');
 try{
  const {studioId,client}=seed(db),outbox=createNotificationOutbox(db,{encryptionKey:key,origin});
  const old=invitation(db,studioId,client.email),oldJob=outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:old.url});
  db.prepare('UPDATE invitations SET used=1 WHERE token=?').run(hash(old.token));
  const current=invitation(db,studioId,client.email),newJob=outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:current.url});
  assert.notEqual(oldJob.id,newJob.id);
  assert.equal(db.prepare('SELECT state FROM notification_outbox WHERE id=?').get(oldJob.id).state,'cancelled');
  db.prepare('UPDATE invitations SET used=1 WHERE token=?').run(hash(current.token));
  let deliveries=0;
  assert.deepEqual(await outbox.dispatchOne(async()=>{deliveries++;}),{id:newJob.id,state:'cancelled'});
  assert.equal(deliveries,0);
  assert.throws(()=>outbox.enqueueInvitation({studioId,email:'other@example.test',inviteUrl:current.url}),{status:409});
  assert.throws(()=>outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:'https://other.test/join#'+current.token}),{status:400});
 }finally{db.close();}
});

test('a failed delivery retries with its original provider key and an expired lease can be recovered',async()=>{
 const db=openStore(':memory:');
 try{
  const {studioId,client}=seed(db),item=invitation(db,studioId,client.email);
  let time=Date.now();const outbox=createNotificationOutbox(db,{encryptionKey:key,origin,clock:()=>time});
  const queued=outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:item.url}),attempts=[];
  let result=await outbox.dispatchOne(async message=>{attempts.push(message.idempotencyKey);throw Error('provider response containing private data');});
  assert.deepEqual(result,{id:queued.id,state:'pending'});
  assert.equal(db.prepare('SELECT last_error FROM notification_outbox WHERE id=?').get(queued.id).last_error,'Email delivery failed');
  assert.equal(await outbox.dispatchOne(async()=>{throw Error('too early');}),null);
  time+=30_000;
  result=await outbox.dispatchOne(async message=>{attempts.push(message.idempotencyKey);return {id:'delivered'};});
  assert.deepEqual(result,{id:queued.id,state:'sent'});assert.deepEqual(attempts,[queued.id,queued.id]);
  const other=invitation(db,studioId,client.email),stuck=outbox.enqueueInvitation({studioId,email:client.email,inviteUrl:other.url});
  db.prepare("UPDATE notification_outbox SET state='sending',attempts=1,first_attempt_at=?,lease_token='crashed',lease_until=? WHERE id=?")
   .run(time,time-1,stuck.id);
  result=await outbox.dispatchOne(async()=>({id:'recovered'}));
  assert.deepEqual(result,{id:stuck.id,state:'sent'});
 }finally{db.close();}
});

test('project activity targets current authorized recipients and never includes client or project content',async()=>{
 const db=openStore(':memory:');
 try{
  const {studioId,owner,client,project}=seed(db),outbox=createNotificationOutbox(db,{encryptionKey:key,origin});
  const [queued]=outbox.enqueueProjectActivity({studioId,projectId:project.id,actorUserId:owner.id,eventId:project.activity[0].id});
  assert.ok(queued);assert.equal(outbox.enqueueProjectActivity({studioId,projectId:project.id,actorUserId:owner.id,eventId:project.activity[0].id})[0].id,queued.id);
  const stored=db.prepare('SELECT * FROM notification_outbox WHERE id=?').get(queued.id);
  assert.equal(stored.recipient_email,client.email);assert.ok(!stored.payload.includes(project.title));
  const contact=db.prepare('SELECT id FROM crm_contacts WHERE studio_id=? AND user_id=?').get(studioId,client.id);
  db.prepare('UPDATE crm_project_stakeholders SET portal_access=0 WHERE project_id=? AND contact_id=?').run(project.id,contact.id);
  let count=0;assert.deepEqual(await outbox.dispatchOne(async()=>{count++;}),{id:queued.id,state:'cancelled'});assert.equal(count,0);
  db.prepare('UPDATE crm_project_stakeholders SET portal_access=1 WHERE project_id=? AND contact_id=?').run(project.id,contact.id);
  const ownerJobs=outbox.enqueueProjectActivity({studioId,projectId:project.id,actorUserId:client.id,eventId:project.activity[0].id});
  assert.equal(ownerJobs.length,1);
  const delivered=[];assert.equal((await outbox.dispatchOne(async message=>{delivered.push(message);return {id:'provider-2'};})).state,'sent');
  assert.equal(delivered[0].to,owner.email);assert.ok(!delivered[0].text.includes(client.name));assert.ok(!delivered[0].text.includes(project.title));
  const otherId=randomUUID();db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(otherId,'other-studio','Other Studio','#222222','[]');
  assert.throws(()=>outbox.enqueueProjectActivity({studioId:otherId,projectId:project.id,actorUserId:owner.id,eventId:project.activity[0].id}),{status:404});
  assert.throws(()=>outbox.enqueueProjectActivity({studioId,projectId:project.id,actorUserId:owner.id,eventId:'not-saved'}),{status:409});
 }finally{db.close();}
});

test('Resend adapter uses the stable idempotency key and surfaces no provider response body',async()=>{
 const calls=[];const adapter=createResendDelivery({apiKey:'test-key',from:'Caleane <hello@example.test>',fetchImpl:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>({id:'resend-1'})};
 }});
 const id=randomUUID(),result=await adapter({to:'client@example.test',subject:'Hello',text:'A project update',idempotencyKey:id});
 assert.equal(result.id,'resend-1');assert.equal(calls[0].url,'https://api.resend.com/emails');
 assert.equal(calls[0].options.headers['Idempotency-Key'],id);
 assert.deepEqual(JSON.parse(calls[0].options.body),{from:'Caleane <hello@example.test>',to:['client@example.test'],subject:'Hello',text:'A project update'});
 const broken=createResendDelivery({apiKey:'test-key',from:'hello@example.test',fetchImpl:async()=>({ok:false,status:422,json:async()=>({secret:'Never expose this'})})});
 await assert.rejects(broken({to:'client@example.test',subject:'Hello',text:'Body',idempotencyKey:id}),error=>error.message==='Email provider returned 422.'&&!error.message.includes('Never expose'));
});
