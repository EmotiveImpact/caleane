import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createWorkspace} from '../server.mjs';
import {installNotifications} from '../notifications.mjs';
import {installNotificationFeed} from '../notification-feed.mjs';
import {runReminders,upcomingReminders} from '../reminders.mjs';

test('older outbox and feed tables are rebuilt for the new kinds without losing rows',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE studios(id TEXT PRIMARY KEY);CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE projects(id TEXT,studio_id TEXT,PRIMARY KEY(id,studio_id));INSERT INTO studios VALUES('s');INSERT INTO users VALUES('u');
  CREATE TABLE notification_outbox(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),kind TEXT NOT NULL CHECK(kind IN ('invitation','project_activity')),dedupe_key TEXT NOT NULL,recipient_email TEXT NOT NULL,recipient_user_id TEXT,project_id TEXT,invitation_digest TEXT,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER,first_attempt_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,sent_at INTEGER,provider_id TEXT,last_error TEXT,UNIQUE(studio_id,dedupe_key));
  INSERT INTO notification_outbox(id,studio_id,kind,dedupe_key,recipient_email,payload,next_attempt_at,created_at,updated_at) VALUES('old','s','invitation','k','a@b.test','x',1,1,1);
  CREATE TABLE notification_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,studio_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('enquiry','message','project_update','task_assigned')),source_key TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',actor_name TEXT NOT NULL DEFAULT '',project_id TEXT,conversation_id TEXT,client_id TEXT,opportunity_id TEXT,task_id TEXT,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(studio_id,user_id,source_key));
  INSERT INTO notification_events(id,studio_id,user_id,kind,source_key,title,created_at) VALUES('e','s','u','message','m','Hello','2026-10-01');`);
 installNotifications(db);installNotificationFeed(db);installNotifications(db);installNotificationFeed(db);
 assert.equal(db.prepare('SELECT kind FROM notification_outbox WHERE id=?').get('old').kind,'invitation');
 assert.equal(db.prepare('SELECT title FROM notification_events WHERE id=?').get('e').title,'Hello');
 db.prepare(`INSERT INTO notification_outbox(id,studio_id,kind,dedupe_key,recipient_email,payload,next_attempt_at,created_at,updated_at,conversation_id) VALUES('new','s','message','k2','a@b.test','x',1,1,1,'c')`).run();
 db.prepare(`INSERT INTO notification_events(id,studio_id,user_id,kind,source_key,title,created_at) VALUES('f','s','u','follow_up','q','Quiet','2026-10-02')`).run();
});

test('message emails wait, collapse per conversation, respect read state and the opt-out, and quiet clients are followed up',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'message-follow-ups-')),origin='http://127.0.0.1:4320',sent=[];
 const emailDelivery=async message=>{sent.push(message);return {id:'re_'+sent.length};};
 const {server,db,sendQueuedEmail}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,disableExternalServices:true,notificationKey:randomBytes(32).toString('base64'),emailDelivery,emailIntervalMs:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};}
 const jobs=()=>db.prepare("SELECT * FROM notification_outbox WHERE kind='message' ORDER BY created_at,rowid").all();
 const due=()=>db.prepare("UPDATE notification_outbox SET next_attempt_at=0 WHERE kind='message' AND state='pending'").run();
 try{
  for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login','POST',{email,password:'StudioDemo2026!'},who)).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const thread=(await call('/api/conversations'+q)).data.conversations.find(c=>c.clientEmail==='amelia@example.test'),route='/api/conversations/'+thread.id;
  const send=async(text,who)=>(await call(route+'/messages'+q,'POST',{text},who)).data.conversation;

  // The client writes twice: the owner gets one email, held back for a few minutes.
  await send('Could the runner be sage?','client');await send('And no lilies, please.','client');
  let queued=jobs();assert.equal(queued.length,1,'one email per conversation until the owner catches up');
  assert.ok(queued[0].next_attempt_at>Date.now()+9*60*1000,'held so someone already in Caleane is not emailed');
  await sendQueuedEmail();assert.equal(sent.length,0,'nothing goes before the delay');
  due();await sendQueuedEmail();assert.equal(sent.length,1);
  assert.equal(sent[0].to,'studio@example.test');assert.equal(sent[0].subject,'Amelia Taylor sent you a message');
  assert.match(sent[0].text,/Read and reply: http:\/\/127\.0\.0\.1:4320\/\?view=projects/);assert.doesNotMatch(sent[0].text,/lilies/,'message content stays in Caleane');

  // Read before the email goes: it is dropped.
  let c=await send('Also the candles.','client');
  await call(route+'/seen'+q,'POST',{lastMessageId:c.messages.at(-1).id});due();await sendQueuedEmail();
  assert.equal(sent.length,1);assert.equal(jobs().at(-1).state,'cancelled');

  // The owner replies: the client is emailed. Turning message emails off stops the next one.
  await send('Of course, sage it is.','owner');due();await sendQueuedEmail();assert.equal(sent.at(-1).to,'amelia@example.test');
  assert.deepEqual((await call('/api/notifications/preferences'+q,'GET',undefined,'client')).data,{messageEmail:true,emailActive:true});
  assert.equal((await call('/api/notifications/preferences'+q,'POST',{messageEmail:'no'},'client')).status,400);
  assert.equal((await call('/api/notifications/preferences'+q,'POST',{messageEmail:false},'client')).data.messageEmail,false);
  await send('One more detail.','owner');assert.equal(jobs().filter(job=>job.recipient_email==='amelia@example.test'&&job.state==='pending').length,0);
  await call('/api/notifications/preferences'+q,'POST',{messageEmail:true},'client');

  // Quiet follow-ups: the studio spoke last, four days ago. The owner is nudged once, privately.
  const last=db.prepare('SELECT id FROM conversation_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT 1').get(thread.id);
  db.prepare('UPDATE conversation_messages SET created_at=? WHERE id=?').run(new Date(Date.now()-4*86400000).toISOString(),last.id);
  assert.ok(upcomingReminders(db,studio).some(item=>item.kind==='Client gone quiet'),'shown with what is coming up');
  let ran=runReminders(db,{studioId:studio});assert.deepEqual(ran.map(item=>item.kind),['Client gone quiet'],'runs while client reminders are off');
  assert.deepEqual(runReminders(db,{studioId:studio}),[],'once per quiet stretch');
  const bell=(await call('/api/notifications'+q)).data;assert.equal(bell.unreadByKind.follow_up,1);
  const nudge=bell.notifications.find(item=>item.kind==='follow_up');assert.equal(nudge.title,'No reply from Amelia yet');assert.equal(nudge.conversationId,thread.id);
  assert.equal((await call('/api/notifications'+q,'GET',undefined,'client')).data.notifications.some(item=>item.kind==='follow_up'),false,'clients never see follow-ups');

  // The client replies and the owner leaves it for a day: a reply-waiting nudge.
  c=await send('Sorry, busy week!','client');db.prepare('UPDATE conversation_messages SET created_at=? WHERE id=?').run(new Date(Date.now()-26*3600000).toISOString(),c.messages.at(-1).id);
  ran=runReminders(db,{studioId:studio});assert.deepEqual(ran.map(item=>item.kind),['Reply waiting']);
  // A long-forgotten stretch is history, not a follow-up.
  c=await send('Thanks!','owner');db.prepare('UPDATE conversation_messages SET created_at=? WHERE id=?').run(new Date(Date.now()-60*86400000).toISOString(),c.messages.at(-1).id);
  assert.deepEqual(runReminders(db,{studioId:studio}),[]);
  // Settings can switch both off.
  assert.equal((await call('/api/reminders'+q,'POST',{action:'save',settings:{quietClientDays:0,unansweredDays:0}})).data.settings.quietClientDays,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
