import {createHmac,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {hash,transaction} from './store.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',STEP=30000,CHALLENGE_MS=5*60000,CHALLENGE_TRIES=5,RECOVERY_COUNT=10;
export function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=value<<8|byte;bits+=8;while(bits>=5){out+=ALPHABET[value>>>bits-5&31];bits-=5;}}if(bits)out+=ALPHABET[value<<5-bits&31];return out;}
export function fromBase32(text){let bits=0,value=0;const out=[];for(const char of text.replace(/[\s=]/g,'').toUpperCase()){const index=ALPHABET.indexOf(char);if(index<0)throw new Error('Not base32.');value=value<<5|index;bits+=5;if(bits>=8){out.push(value>>>bits-8&255);bits-=8;}}return Buffer.from(out);}
// RFC 6238 with the defaults every authenticator app uses: SHA-1, six digits, 30 seconds.
export function totp(secret,step){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const mac=createHmac('sha1',secret).update(counter).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,'0');}
const same=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const recoveryDigest=code=>hash('caleane-recovery:'+code);
// Two-step sign-in with an authenticator app. The password proves who you are; the six-digit code
// proves you hold the phone. Recovery codes are single use and only their hashes are stored.
export function createTwoStep(db,{encryptionKey='',previousKeys=[],issuer='Caleane',clock=Date.now}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS account_two_step(user_id TEXT PRIMARY KEY REFERENCES users(id),secret TEXT NOT NULL,enabled_at INTEGER,created INTEGER NOT NULL,last_step INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS account_recovery_codes(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),used INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS account_recovery_codes_user ON account_recovery_codes(user_id);
 CREATE TABLE IF NOT EXISTS account_sign_in_challenges(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);`);
 const keys=[encryptionKey,...previousKeys].filter(Boolean).map(k=>Buffer.from(k,'base64')).filter((k,i,all)=>k.length===32&&all.findIndex(o=>o.equals(k))===i);
 // Secrets are encrypted at rest when the server has an account key (never in the browser sample).
 function seal(secret){if(!keys.length)return 'plain:'+secret;const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys[0],iv);cipher.setAAD(Buffer.from('caleane-two-step-v1'));const content=Buffer.concat([cipher.update(secret),cipher.final()]);return [iv,cipher.getAuthTag(),content].map(b=>b.toString('base64url')).join('.');}
 function open(stored){if(stored.startsWith('plain:'))return stored.slice(6);const [iv,tag,content]=stored.split('.').map(s=>Buffer.from(s,'base64url'));for(const key of keys){try{const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('caleane-two-step-v1'));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(content),decipher.final()]).toString();}catch{}}fail(503,'Two-step sign-in cannot be checked right now. Use a recovery code, or contact support.');}
 const row=userId=>db.prepare('SELECT * FROM account_two_step WHERE user_id=?').get(userId);
 const enabled=userId=>!!row(userId)?.enabled_at;
 function status(userId){const r=row(userId);return {enabled:!!r?.enabled_at,since:r?.enabled_at?new Date(r.enabled_at).toISOString():null,recoveryLeft:r?.enabled_at?db.prepare('SELECT COUNT(*) AS n FROM account_recovery_codes WHERE user_id=? AND used=0').get(userId).n:0};}
 function newRecoveryCodes(userId){const codes=Array.from({length:RECOVERY_COUNT},()=>{const raw=base32(randomBytes(5)).toLowerCase();return raw.slice(0,4)+'-'+raw.slice(4);});db.prepare('DELETE FROM account_recovery_codes WHERE user_id=?').run(userId);for(const code of codes)db.prepare('INSERT INTO account_recovery_codes VALUES(?,?,0)').run(recoveryDigest(code.replace('-','')),userId);return codes;}
 // A code is accepted once: a step already used (or older) is refused, so a code seen over a shoulder cannot be replayed.
 function checkApp(r,code){const secret=fromBase32(open(r.secret)),current=Math.floor(clock()/STEP);for(const step of [current,current-1,current+1])if(step>r.last_step&&same(totp(secret,step),code)){db.prepare('UPDATE account_two_step SET last_step=? WHERE user_id=?').run(step,r.user_id);return true;}return false;}
 function check(userId,input,{recovery=true}={}){
  const r=row(userId);if(!r?.enabled_at)return false;const code=typeof input==='string'?input.replace(/[\s-]/g,'').toLowerCase():'';
  if(/^\d{6}$/.test(code))return checkApp(r,code);
  if(recovery&&/^[a-z2-7]{8}$/.test(code))return db.prepare('UPDATE account_recovery_codes SET used=1 WHERE digest=? AND user_id=? AND used=0').run(recoveryDigest(code),userId).changes===1;
  return false;
 }
 function begin(user){if(enabled(user.id))fail(409,'Two-step sign-in is already on.');const secret=base32(randomBytes(20));db.prepare('INSERT INTO account_two_step(user_id,secret,enabled_at,created) VALUES(?,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,created=excluded.created,last_step=0').run(user.id,seal(secret),clock());const label=encodeURIComponent(issuer+':'+user.email);return {secret,uri:`otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`};}
 function confirm(user,input){return transaction(db,()=>{const r=row(user.id);if(!r||r.enabled_at)fail(409,r?'Two-step sign-in is already on.':'Start setting up two-step sign-in first.');if(clock()-r.created>30*60000)fail(400,'This setup has expired. Start again to get a new code.');const code=typeof input==='string'?input.replace(/\s/g,''):'';if(!/^\d{6}$/.test(code)||!checkApp(r,code))fail(400,'That code did not match. Check the time on your phone is set automatically and try the newest code.');db.prepare('UPDATE account_two_step SET enabled_at=? WHERE user_id=?').run(clock(),user.id);return newRecoveryCodes(user.id);});}
 function disable(user,input){transaction(db,()=>{if(!check(user.id,input))fail(400,'That code did not match.');db.prepare('DELETE FROM account_recovery_codes WHERE user_id=?').run(user.id);db.prepare('DELETE FROM account_two_step WHERE user_id=?').run(user.id);db.prepare('DELETE FROM account_sign_in_challenges WHERE user_id=?').run(user.id);});}
 function regenerate(user,input){return transaction(db,()=>{if(!check(user.id,input,{recovery:false}))fail(400,'Enter the current code from your authenticator app.');return newRecoveryCodes(user.id);});}
 // Between the password and the code, the browser holds only this short-lived reference, never a session.
 function challenge(user){const token=randomBytes(32).toString('hex'),time=clock();db.prepare('DELETE FROM account_sign_in_challenges WHERE expires<?').run(time);db.prepare('INSERT INTO account_sign_in_challenges VALUES(?,?,?,0)').run(hash(token),user.id,time+CHALLENGE_MS);return token;}
 function complete(token,input){
  const expired='This sign-in has expired. Enter your email and password again.';
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(400,expired);
  const result=transaction(db,()=>{const c=db.prepare('SELECT * FROM account_sign_in_challenges WHERE digest=? AND expires>?').get(hash(token),clock());if(!c)fail(400,expired);
   if(check(c.user_id,input)){db.prepare('DELETE FROM account_sign_in_challenges WHERE digest=?').run(c.digest);return {userId:c.user_id};}
   if(c.attempts+1>=CHALLENGE_TRIES){db.prepare('DELETE FROM account_sign_in_challenges WHERE digest=?').run(c.digest);return {error:'Too many codes did not match. Enter your email and password again.'};}
   db.prepare('UPDATE account_sign_in_challenges SET attempts=attempts+1 WHERE digest=?').run(c.digest);return {error:'That code did not match. Try the newest code from your app.'};});
  if(result.error)fail(400,result.error);
  return db.prepare('SELECT * FROM users WHERE id=?').get(result.userId);
 }
 return {enabled,status,begin,confirm,disable,regenerate,challenge,complete};
}
