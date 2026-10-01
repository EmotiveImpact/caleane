import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto';
import {projectAccess} from './relationships.mjs';
import {transaction} from './store.mjs';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TOKEN=/^[a-f0-9]{64}$/;
const MAX_ATTEMPTS=5;
const LEASE_MS=60_000;
// Resend currently retains idempotency keys for 24 hours. Leave a margin for clock skew.
const IDEMPOTENCY_WINDOW_MS=23*60*60*1000;

function fail(status,message){throw Object.assign(new Error(message),{status});}
function digest(value){return createHash('sha256').update(value).digest('hex');}
function cleanEmail(value){const email=String(value||'').trim().toLowerCase();if(email.length>254||!EMAIL.test(email))fail(400,'Enter a valid email address.');return email;}
function keyBuffer(key){
 const result=Buffer.isBuffer(key)?key:typeof key==='string'?Buffer.from(key,'base64'):null;
 if(!result||result.length!==32)throw new Error('Notification encryption key must be 32 bytes (base64 when passed as text).');
 return result;
}
function originURL(origin){
 let url;try{url=new URL(origin);}catch{throw new Error('Set a valid notification origin.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Use an HTTPS notification origin, or HTTP on localhost.');
 return url.origin;
}
function seal(key,payload){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const value=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),value].map(part=>part.toString('base64url')).join('.');
}
function open(key,encoded){
 const [iv,tag,value]=encoded.split('.').map(part=>Buffer.from(part,'base64url'));
 if(iv.length!==12||tag.length!==16)throw new Error('Invalid notification payload.');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(value),decipher.final()]).toString('utf8'));
}

export function installNotifications(db){
 db.exec(`CREATE TABLE IF NOT EXISTS notification_outbox(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),
  kind TEXT NOT NULL CHECK(kind IN ('invitation','project_activity')),
  dedupe_key TEXT NOT NULL,recipient_email TEXT NOT NULL,recipient_user_id TEXT,
  project_id TEXT,invitation_digest TEXT,
  payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,lease_until INTEGER,first_attempt_at INTEGER,
  created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,sent_at INTEGER,
  provider_id TEXT,last_error TEXT,
  UNIQUE(studio_id,dedupe_key),
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
 CREATE INDEX IF NOT EXISTS notification_outbox_ready ON notification_outbox(state,next_attempt_at,lease_until);
 CREATE INDEX IF NOT EXISTS notification_outbox_invite ON notification_outbox(studio_id,invitation_digest);
 `);
}

/**
 * The outbox only sends when a delivery function is explicitly supplied to dispatchOne.
 * Keep the 32-byte key outside the database and retain it across restarts.
 */
export function createNotificationOutbox(db,{encryptionKey,origin,clock=Date.now}={}){
 const key=keyBuffer(encryptionKey),site=originURL(origin);
 installNotifications(db);
 const stamp=()=>Number(clock());
 function insert({studioId,kind,dedupeKey,to,recipientUserId=null,projectId=null,invitationDigest=null,payload}){
  const time=stamp(),identifier=randomUUID();
  db.prepare(`INSERT INTO notification_outbox
   (id,studio_id,kind,dedupe_key,recipient_email,recipient_user_id,project_id,invitation_digest,payload,next_attempt_at,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(studio_id,dedupe_key) DO NOTHING`)
   .run(identifier,studioId,kind,dedupeKey,to,recipientUserId,projectId,invitationDigest,seal(key,payload),time,time,time);
  return db.prepare('SELECT id,state FROM notification_outbox WHERE studio_id=? AND dedupe_key=?').get(studioId,dedupeKey);
 }

 function enqueueInvitation({studioId,email,inviteUrl}){
  const to=cleanEmail(email),studio=db.prepare('SELECT id,name FROM studios WHERE id=?').get(studioId);
  if(!studio)fail(404,'Studio not found.');
  let link;try{link=new URL(inviteUrl);}catch{fail(400,'Invitation link is invalid.');}
  const token=link.hash.slice(1);
  if(link.origin!==site||link.pathname!=='/join'||link.search||!INVITE_TOKEN.test(token))fail(400,'Invitation link is invalid.');
  const invitationDigest=digest(token),invite=db.prepare('SELECT email,expires,used FROM invitations WHERE token=? AND studio_id=?').get(invitationDigest,studioId);
  if(!invite||invite.email!==to||invite.used||invite.expires<=stamp())fail(409,'Invitation is no longer available.');
  // Reissued invitations invalidate older links. Do not deliver queued superseded links.
  const displayName=studio.name.replace(/\s+/g,' ').trim();
  return transaction(db,()=>{
   db.prepare(`UPDATE notification_outbox SET state='cancelled',payload='',updated_at=?,last_error='Invitation replaced'
    WHERE studio_id=? AND kind='invitation' AND recipient_email=? AND invitation_digest<>? AND state='pending'`)
    .run(stamp(),studioId,to,invitationDigest);
   return insert({studioId,kind:'invitation',dedupeKey:'invitation:'+invitationDigest,to,invitationDigest,
    payload:{subject:`Your invitation to ${displayName}`,text:`${displayName} has invited you to their Caleane workspace.\n\nOpen your invitation: ${link.href}\n\nThis link expires in seven days and can be used once.`}});
  });
 }

 function enqueueProjectActivity({studioId,projectId,actorUserId,eventId}){
  if(typeof eventId!=='string'||!eventId||eventId.length>120)fail(400,'Use a saved project event.');
  const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);
  if(!row)fail(404,'Project not found.');
  const project=JSON.parse(row.data),saved=(project.activity||[]).some(item=>item.id===eventId)
   ||!!db.prepare(`SELECT 1 FROM conversation_messages cm JOIN conversations c ON c.id=cm.conversation_id
    WHERE c.project_id=? AND c.studio_id=? AND cm.id=?`).get(projectId,studioId,eventId);
  if(!saved)fail(409,'Save the project update before notifying people.');
  const actor=db.prepare('SELECT u.id,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.studio_id=?').get(actorUserId,studioId);
  if(!actor||!['owner','client'].includes(actor.role))fail(403,'Project access is required.');
  if(actor.role==='client'&&!projectAccess(db,studioId,projectId,actorUserId))fail(403,'Project access is required.');
  const recipients=actor.role==='owner'
   ?db.prepare(`SELECT DISTINCT u.id,u.email FROM crm_project_stakeholders ps
     JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id
     JOIN users u ON u.id=ct.user_id AND u.email=ct.email
     JOIN memberships m ON m.user_id=u.id AND m.studio_id=ps.studio_id AND m.role='client'
     WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1`).all(studioId,projectId)
   :db.prepare(`SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id
     WHERE m.studio_id=? AND m.role='owner'`).all(studioId);
  const link=new URL('/',site);link.searchParams.set('view','projects');link.searchParams.set('project',projectId);link.searchParams.set('tab','Activity');
  return transaction(db,()=>recipients.filter(recipient=>recipient.id!==actorUserId).map(recipient=>insert({studioId,kind:'project_activity',
   dedupeKey:`project:${projectId}:event:${eventId}:user:${recipient.id}`,to:cleanEmail(recipient.email),recipientUserId:recipient.id,projectId,
   payload:{subject:'A project update in Caleane',text:`There is a new update in your Caleane project.\n\nView the project: ${link.href}\n\nSign in to see the details.`}})));
 }

 function stillAuthorized(job){
  const user=db.prepare('SELECT email FROM users WHERE id=?').get(job.recipient_user_id);
  if(job.kind==='invitation'){
   const invite=db.prepare('SELECT email,expires,used FROM invitations WHERE token=? AND studio_id=?').get(job.invitation_digest,job.studio_id);
   return !!invite&&invite.email===job.recipient_email&&!invite.used&&invite.expires>stamp();
  }
  if(!user||user.email!==job.recipient_email)return false;
  if(!db.prepare('SELECT 1 FROM projects WHERE id=? AND studio_id=?').get(job.project_id,job.studio_id))return false;
  const role=db.prepare('SELECT role FROM memberships WHERE user_id=? AND studio_id=?').get(job.recipient_user_id,job.studio_id)?.role;
  return role==='owner'||(role==='client'&&!!projectAccess(db,job.studio_id,job.project_id,job.recipient_user_id));
 }

 function claim(){
  const time=stamp();
  for(const candidate of db.prepare(`SELECT * FROM notification_outbox
   WHERE (state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?)
   ORDER BY created_at,id LIMIT 20`).all(time,time)){
   if(candidate.first_attempt_at!=null&&time-candidate.first_attempt_at>IDEMPOTENCY_WINDOW_MS){
    db.prepare(`UPDATE notification_outbox SET state='failed',payload='',lease_token=NULL,lease_until=NULL,
      last_error='Delivery state uncertain after provider idempotency window',updated_at=? WHERE id=?`).run(time,candidate.id);
    continue;
   }
   const lease=randomUUID();
   const result=db.prepare(`UPDATE notification_outbox SET state='sending',attempts=attempts+1,
    first_attempt_at=COALESCE(first_attempt_at,?),lease_token=?,lease_until=?,updated_at=?
    WHERE id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))`)
    .run(time,lease,time+LEASE_MS,time,candidate.id,time,time);
   if(result.changes)return db.prepare('SELECT * FROM notification_outbox WHERE id=?').get(candidate.id);
  }
  return null;
 }

 async function dispatchOne(deliver){
  if(typeof deliver!=='function')throw new Error('Configure an email delivery adapter before dispatching notifications.');
  const job=claim();if(!job)return null;
  const time=stamp();
  if(!stillAuthorized(job)){
   db.prepare(`UPDATE notification_outbox SET state='cancelled',payload='',lease_token=NULL,lease_until=NULL,
    last_error='Recipient or invitation no longer eligible',updated_at=? WHERE id=? AND lease_token=?`).run(time,job.id,job.lease_token);
   return {id:job.id,state:'cancelled'};
  }
  let payload;
  try{payload=open(key,job.payload);}catch{
   db.prepare(`UPDATE notification_outbox SET state='failed',payload='',lease_token=NULL,lease_until=NULL,
    last_error='Unable to open encrypted notification',updated_at=? WHERE id=? AND lease_token=?`).run(time,job.id,job.lease_token);
   return {id:job.id,state:'failed'};
  }
  try{
   const response=await deliver({to:job.recipient_email,subject:payload.subject,text:payload.text,idempotencyKey:job.id});
   db.prepare(`UPDATE notification_outbox SET state='sent',payload='',lease_token=NULL,lease_until=NULL,
    provider_id=?,sent_at=?,updated_at=?,last_error=NULL WHERE id=? AND lease_token=?`)
    .run(typeof response?.id==='string'?response.id:null,stamp(),stamp(),job.id,job.lease_token);
   return {id:job.id,state:'sent'};
  }catch{
   const state=job.attempts>=MAX_ATTEMPTS?'failed':'pending';
   const delay=Math.min(30_000*2**(job.attempts-1),60*60*1000);
   db.prepare(`UPDATE notification_outbox SET state=?,payload=CASE WHEN ?='failed' THEN '' ELSE payload END,
    next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error='Email delivery failed',updated_at=?
    WHERE id=? AND lease_token=?`).run(state,state,stamp()+delay,stamp(),job.id,job.lease_token);
   return {id:job.id,state};
  }
 }

 return {enqueueInvitation,enqueueProjectActivity,dispatchOne};
}

/** Opt-in Resend transport. Creating this function never sends a message. */
export function createResendDelivery({apiKey,from,fetchImpl=fetch}={}){
 if(typeof apiKey!=='string'||!apiKey.trim())throw new Error('Set an email provider API key.');
 if(typeof from!=='string'||!from.trim()||from.length>254||/[\r\n]/.test(from))throw new Error('Set a valid sender address.');
 return async({to,subject,text,idempotencyKey})=>{
  if(!/^[a-f0-9-]{36}$/.test(idempotencyKey))throw new Error('Invalid email delivery reference.');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{
   Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
   body:JSON.stringify({from,to:[cleanEmail(to)],subject,text}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error(`Email provider returned ${response.status}.`);
  const data=await response.json();
  if(typeof data?.id!=='string'||!data.id)throw new Error('Email provider response was incomplete.');
  return {id:data.id};
 };
}
