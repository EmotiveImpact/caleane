import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createWorkspace} from '../server.mjs';import {createAccountSecurity} from '../account-security.mjs';import {passwordOK} from '../store.mjs';
test('account links are encrypted, purpose bound, single use and reset revokes sessions',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-account-')),key=randomBytes(32).toString('base64'),origin='http://127.0.0.1:4320';const {db,server}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,notificationKey:key});let time=Date.now();const service=createAccountSecurity(db,{origin,encryptionKey:key,clock:()=>time}),user=db.prepare('SELECT * FROM users WHERE email=?').get('studio@example.test'),sent=[];
 try{service.enqueue(user,'reset');const row=db.prepare('SELECT * FROM account_mail').get();assert.ok(!row.payload.includes(user.email));await service.dispatchOne(async msg=>{sent.push(msg);});let token=sent[0].text.match(/#([a-f0-9]{64})/)[1];assert.throws(()=>service.consume(token,'verify'),{status:400});assert.throws(()=>service.consume(token,'reset','short'),{status:400});db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('test-session',user.id,time+60000);service.consume(token,'reset','NewStrongPassword2026!');assert.equal(db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(user.id).n,0);assert.ok(passwordOK('NewStrongPassword2026!',db.prepare('SELECT password FROM users WHERE id=?').get(user.id).password));assert.throws(()=>service.consume(token,'reset','AnotherPassword2026!'),{status:400});
 service.enqueue(user,'verify');await service.dispatchOne(async msg=>sent.push(msg));token=sent.at(-1).text.match(/#([a-f0-9]{64})/)[1];service.consume(token,'verify');assert.equal(service.status(user).verified,true);assert.throws(()=>service.consume(token,'verify'),{status:400});
 time+=61000;service.enqueue(user,'reset');time+=31*60000;assert.deepEqual(await service.dispatchOne(async()=>assert.fail('expired email sent')),{state:'cancelled'});
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
test('recovery API is generic and does not return secrets; verification needs a session',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-account-http-')),origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,notificationKey:randomBytes(32).toString('base64')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{const a=await post('/api/account/recovery',{email:'studio@example.test'}),b=await post('/api/account/recovery',{email:'missing@example.test'});assert.deepEqual(a,b);assert.equal(a.status,200);assert.equal((await post('/api/account/verification',{})).status,401);assert.equal((await post('/api/account/reset',{token:'invented',password:'NewPassword2026!'})).status,400);assert.equal(db.prepare('SELECT count(*) n FROM account_mail').get().n,1);}finally{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
test('a sign-in email changes only when the new address confirms, and the old address is told',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-account-email-')),key=randomBytes(32).toString('base64'),origin='http://127.0.0.1:4320';const {db,server}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,notificationKey:key});let time=Date.now();const service=createAccountSecurity(db,{origin,encryptionKey:key,clock:()=>time}),sent=[];
 const user=()=>db.prepare('SELECT * FROM users WHERE id=(SELECT id FROM users WHERE email IN (?,?))').get('studio@example.test','new-studio@example.test');
 try{
  service.enqueueEmailChange(user(),'amelia@example.test');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_mail').get().n,0);
  service.enqueueEmailChange(user(),'new-studio@example.test');while(await service.dispatchOne(async msg=>sent.push(msg)));
  assert.deepEqual(sent.map(msg=>msg.to).sort(),['new-studio@example.test','studio@example.test']);
  assert.match(sent.find(msg=>msg.to==='studio@example.test').text,/new-studio@example\.test/);assert.doesNotMatch(sent.find(msg=>msg.to==='studio@example.test').text,/#[a-f0-9]{64}/);
  assert.equal(user().email,'studio@example.test');
  const token=sent.find(msg=>msg.to==='new-studio@example.test').text.match(/#([a-f0-9]{64})/)[1];
  assert.throws(()=>service.consume(token,'verify'));
  service.consume(token,'email');assert.equal(user().email,'new-studio@example.test');assert.equal(service.status(user()).verified,true);
  assert.throws(()=>service.consume(token,'email'));
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
test('changing email over the API needs a session and the current password',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-account-email-http-')),origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,notificationKey:randomBytes(32).toString('base64')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await post('/api/account/email',{email:'new@example.test',current:'StudioDemo2026!'})).status,401);
  await post('/api/login',{email:'studio@example.test',password:'StudioDemo2026!'});
  assert.equal((await post('/api/account/email',{email:'new@example.test',current:'wrong password'})).status,400);
  assert.equal((await post('/api/account/email',{email:'studio@example.test',current:'StudioDemo2026!'})).status,400);
  const taken=await post('/api/account/email',{email:'amelia@example.test',current:'StudioDemo2026!'}),fresh=await post('/api/account/email',{email:'someone-new@example.test',current:'StudioDemo2026!'});
  assert.equal(taken.status,200);assert.equal(fresh.status,200);assert.ok(!JSON.stringify(fresh.data).match(/[a-f0-9]{64}/));
  assert.equal(db.prepare('SELECT email FROM users WHERE email=?').get('studio@example.test').email,'studio@example.test');
  assert.equal((await post('/api/account/confirm-email',{token:'0'.repeat(64)})).status,400);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
