import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {hash,passwordHash,transaction} from './store.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
// previousKeys still decrypt queued mail sealed before a key change (for example the shared notification key).
export function createAccountSecurity(db,{origin,encryptionKey='',previousKeys=[],clock=Date.now}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS account_verifications(user_id TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,verified_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_tokens(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),email TEXT NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_mail(id TEXT PRIMARY KEY,token_digest TEXT NOT NULL REFERENCES account_tokens(digest),payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,lease TEXT);
 CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(user_id,purpose,created);
 CREATE TABLE IF NOT EXISTS account_email_changes(digest TEXT PRIMARY KEY REFERENCES account_tokens(digest),new_email TEXT NOT NULL);`);
 const key=encryptionKey?Buffer.from(encryptionKey,'base64'):null;
 if(key&&key.length!==32)throw new Error('Account mail requires a 32-byte notification encryption key.');
 const keys=key?[key,...previousKeys.filter(Boolean).map(k=>Buffer.from(k,'base64')).filter(k=>k.length===32&&!k.equals(key))]:[];
 const site=new URL(origin);if(site.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(site.hostname)&&site.protocol==='http:'))throw new Error('Use HTTPS for account links.');
 function seal(data){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const content=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);return [iv,cipher.getAuthTag(),content].map(b=>b.toString('base64url')).join('.');}
 function open(data){const [iv,tag,content]=data.split('.').map(s=>Buffer.from(s,'base64url'));let error;for(const candidate of keys){try{const decipher=createDecipheriv('aes-256-gcm',candidate,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(content),decipher.final()]).toString());}catch(e){error=e;}}throw error;}
 function status(user){return {email:user.email,verified:!!db.prepare('SELECT 1 FROM account_verifications WHERE user_id=? AND email=?').get(user.id,user.email),queueConfigured:!!key,deliveryConfigured:!!(key&&process.env.RESEND_API_KEY&&process.env.RESEND_FROM&&process.env.CALEANE_EMAIL_ENABLED==='1')};}
 function enqueue(user,purpose){
  if(!key)fail(503,'Account email is not configured yet. Contact your studio administrator.');
  if(!user)return;
  const time=clock(),recent=db.prepare('SELECT created FROM account_tokens WHERE user_id=? AND purpose=? ORDER BY created DESC LIMIT 1').get(user.id,purpose);if(recent&&time-recent.created<60000)return;
  const token=randomBytes(32).toString('hex'),digest=hash(token),route=purpose==='reset'?'/reset-password':'/verify-email',expires=time+(purpose==='reset'?30*60000:24*3600000);
  transaction(db,()=>{db.prepare('UPDATE account_tokens SET used=1 WHERE user_id=? AND purpose=?').run(user.id,purpose);db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?,?,0,?)').run(digest,user.id,user.email,purpose,expires,time);db.prepare('INSERT INTO account_mail(id,token_digest,payload,next_attempt) VALUES(?,?,?,?)').run(randomUUID(),digest,seal({to:user.email,subject:purpose==='reset'?'Reset your Caleane password':'Verify your Caleane email',text:`${purpose==='reset'?'Choose a new password':'Verify your email address'} using this private link:\n${site.origin}${route}#${token}\n\nThis link expires ${purpose==='reset'?'in 30 minutes':'in 24 hours'} and can only be used once. If you did not request this, ignore this email.`}),time);});
 }
 // The new address must confirm before it replaces the old one. The old address is told, so a
 // stolen session cannot quietly move the account. A token dies if the email changes meanwhile.
 function enqueueEmailChange(user,newEmail){
  if(!key)fail(503,'Account email is not configured yet. Contact your studio administrator.');
  const time=clock(),recent=db.prepare("SELECT created FROM account_tokens WHERE user_id=? AND purpose='email' ORDER BY created DESC LIMIT 1").get(user.id);if(recent&&time-recent.created<60000)return;
  // An address another account uses gets the same reply and no email, so this cannot be used to probe accounts.
  if(db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(newEmail,user.id))return;
  const token=randomBytes(32).toString('hex'),digest=hash(token),expires=time+24*3600000;
  transaction(db,()=>{db.prepare("UPDATE account_tokens SET used=1 WHERE user_id=? AND purpose='email'").run(user.id);db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?,?,0,?)').run(digest,user.id,user.email,'email',expires,time);db.prepare('INSERT INTO account_email_changes VALUES(?,?)').run(digest,newEmail);
   db.prepare('INSERT INTO account_mail(id,token_digest,payload,next_attempt) VALUES(?,?,?,?)').run(randomUUID(),digest,seal({to:newEmail,subject:'Confirm your new Caleane email',text:`Confirm this address as your Caleane sign-in using this private link:\n${site.origin}/confirm-email#${token}\n\nThis link expires in 24 hours and can only be used once. If you did not ask for this, ignore this email.`}),time);
   db.prepare('INSERT INTO account_mail(id,token_digest,payload,next_attempt) VALUES(?,?,?,?)').run(randomUUID(),digest,seal({to:user.email,subject:'Your Caleane sign-in email is changing',text:`Someone signed in to your Caleane account asked to change its sign-in email to ${newEmail}. Nothing changes until that address confirms.\n\nIf this was not you, reset your password straight away at ${site.origin}/recover.`}),time);});
 }
 function consume(token,purpose,pass){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(400,'This link is invalid or has expired. Request a new one.');
  if(purpose==='reset'&&(typeof pass!=='string'||pass.length<12||pass.length>200))fail(400,'Use a password with 12–200 characters.');
  transaction(db,()=>{const row=db.prepare('SELECT t.* FROM account_tokens t JOIN users u ON u.id=t.user_id AND u.email=t.email WHERE digest=? AND purpose=? AND used=0 AND expires>?').get(hash(token),purpose,clock());if(!row)fail(400,'This link is invalid or has expired. Request a new one.');
   if(purpose==='email'){const change=db.prepare('SELECT new_email FROM account_email_changes WHERE digest=?').get(row.digest);if(!change||db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(change.new_email,row.user_id))fail(400,'This link is invalid or has expired. Request a new one.');db.prepare('UPDATE users SET email=? WHERE id=?').run(change.new_email,row.user_id);db.prepare('INSERT INTO account_verifications VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at').run(row.user_id,change.new_email,clock());db.prepare("UPDATE account_tokens SET used=1 WHERE user_id=? AND purpose IN ('email','verify','reset')").run(row.user_id);}
   else if(purpose==='reset'){db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(pass),row.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);db.prepare("UPDATE account_tokens SET used=1 WHERE user_id=? AND purpose='reset'").run(row.user_id);}else db.prepare('INSERT INTO account_verifications VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at').run(row.user_id,row.email,clock());
   db.prepare('UPDATE account_tokens SET used=1 WHERE digest=?').run(row.digest);
  });
 }
 async function dispatchOne(deliver){
  if(!key)return null;
  const time=clock(),lease=randomUUID();const job=transaction(db,()=>{const row=db.prepare("SELECT * FROM account_mail WHERE state IN ('pending','sending') AND next_attempt<=? AND lease_until<=? ORDER BY next_attempt LIMIT 1").get(time,time);if(!row)return null;db.prepare("UPDATE account_mail SET state='sending',lease=?,lease_until=?,attempts=attempts+1 WHERE id=?").run(lease,time+60000,row.id);return {...row,attempts:row.attempts+1};});if(!job)return null;
  const valid=db.prepare('SELECT 1 FROM account_tokens t JOIN users u ON u.id=t.user_id AND u.email=t.email WHERE t.digest=? AND t.used=0 AND t.expires>?').get(job.token_digest,time);
  if(!valid){db.prepare("UPDATE account_mail SET state='cancelled',payload='' WHERE id=? AND lease=?").run(job.id,lease);return {state:'cancelled'};}
  try{await deliver({...open(job.payload),idempotencyKey:job.id});db.prepare("UPDATE account_mail SET state='sent',payload='',lease_until=0 WHERE id=? AND lease=?").run(job.id,lease);return {state:'sent'};}catch{const state=job.attempts>=5?'failed':'pending';db.prepare("UPDATE account_mail SET state=?,payload=CASE WHEN ?='failed' THEN '' ELSE payload END,next_attempt=?,lease_until=0 WHERE id=? AND lease=?").run(state,state,time+30000*2**job.attempts,job.id,lease);return {state};}
 }
 return {status,enqueue,enqueueEmailChange,consume,dispatchOne};
}
