import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createWorkspace} from '../server.mjs';import {totp,base32,fromBase32} from '../two-step.mjs';
const step=()=>Math.floor(Date.now()/30000);
test('codes match RFC 6238 and base32 round trips',()=>{
 assert.equal(totp(Buffer.from('12345678901234567890'),1),'287082');
 assert.equal(totp(Buffer.from('12345678901234567890'),37037036),'081804');
 const bytes=randomBytes(20);assert.deepEqual(fromBase32(base32(bytes)),bytes);assert.equal(base32(Buffer.from('foobar')),'MZXW6YTBOI');
});
async function workspace(t,options={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-two-step-')),origin='http://127.0.0.1:4320';const {server,db}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});});
 const client=()=>{let cookie='';return {get cookie(){return cookie;},async call(route,body,method='POST'){const r=await fetch(base+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0].endsWith('=')?'':set.split(';')[0];return {status:r.status,data:await r.json(),set};}};};
 return {db,client};
}
const login={email:'studio@example.test',password:'StudioDemo2026!'};
test('two-step sign-in: setup, sign in with a code, recovery codes and turning it off',async t=>{
 const {db,client}=await workspace(t,{notificationKey:randomBytes(32).toString('base64')});const owner=client(),other=client();
 await owner.call('/api/login',login);await other.call('/api/login',login);
 assert.equal((await owner.call('/api/account/two-step',{action:'begin',current:'wrong password'})).status,400);
 const begin=await owner.call('/api/account/two-step',{action:'begin',current:login.password});assert.equal(begin.status,200);
 assert.match(begin.data.uri,/^otpauth:\/\/totp\/Caleane%3Astudio%40example\.test\?secret=[A-Z2-7]{32}&issuer=Caleane/);
 const secret=fromBase32(begin.data.secret),stored=db.prepare('SELECT secret FROM account_two_step').get().secret;assert.ok(!stored.includes(begin.data.secret),'secret is encrypted at rest');
 assert.equal((await owner.call('/api/account/two-step',{action:'confirm',code:'000000'})).status,400);
 assert.equal((await owner.call('/api/account/security',null,'GET')).data.twoStep.enabled,false);
 const now=step(),on=await owner.call('/api/account/two-step',{action:'confirm',code:totp(secret,now)});assert.equal(on.status,200);assert.equal(on.data.recoveryCodes.length,10);assert.match(on.data.recoveryCodes[0],/^[a-z2-7]{4}-[a-z2-7]{4}$/);
 assert.equal((await other.call('/api/account/security',null,'GET')).status,401,'other devices are signed out');
 const security=(await owner.call('/api/account/security',null,'GET')).data.twoStep;assert.equal(security.enabled,true);assert.equal(security.recoveryLeft,10);
 // The password alone no longer signs in.
 const fresh=client(),first=await fresh.call('/api/login',login);assert.equal(first.status,200);assert.equal(first.data.twoStep,true);assert.equal(first.set,null);assert.match(first.data.challenge,/^[a-f0-9]{64}$/);
 assert.equal((await fresh.call('/api/me',null,'GET')).data.user,undefined);
 assert.equal((await fresh.call('/api/login/two-step',{challenge:first.data.challenge,code:'123456'})).status,400);
 assert.equal((await fresh.call('/api/login/two-step',{challenge:'0'.repeat(64),code:totp(secret,now+1)})).status,400);
 // The confirming code was already used, so the same step is refused; the next one works.
 assert.equal((await fresh.call('/api/login/two-step',{challenge:first.data.challenge,code:totp(secret,now)})).status,400);
 const signedIn=await fresh.call('/api/login/two-step',{challenge:first.data.challenge,code:totp(secret,now+1)});assert.equal(signedIn.status,200);assert.ok(fresh.cookie);
 assert.equal((await fresh.call('/api/me',null,'GET')).data.user.email,'studio@example.test');
 assert.equal((await client().call('/api/login/two-step',{challenge:first.data.challenge,code:totp(secret,now+1)})).status,400,'a challenge works once');
 // A recovery code signs in once.
 const phoneless=client(),second=await phoneless.call('/api/login',login),code=on.data.recoveryCodes[3];
 assert.equal((await phoneless.call('/api/login/two-step',{challenge:second.data.challenge,code:code.toUpperCase().replace('-',' ')})).status,200);
 const third=await client().call('/api/login',login);assert.equal((await client().call('/api/login/two-step',{challenge:third.data.challenge,code})).status,400);
 assert.equal((await owner.call('/api/account/security',null,'GET')).data.twoStep.recoveryLeft,9);
 // New recovery codes need an app code, not a recovery code.
 assert.equal((await owner.call('/api/account/two-step',{action:'recovery-codes',code:on.data.recoveryCodes[4]})).status,400);
 assert.equal((await owner.call('/api/account/two-step',{action:'begin',current:login.password})).status,409);
 // Turning it off needs the password and a code; a recovery code is accepted.
 assert.equal((await owner.call('/api/account/two-step',{action:'disable',current:'wrong password',code:on.data.recoveryCodes[5]})).status,400);
 assert.equal((await owner.call('/api/account/two-step',{action:'disable',current:login.password,code:'000000'})).status,400);
 assert.equal((await owner.call('/api/account/two-step',{action:'disable',current:login.password,code:on.data.recoveryCodes[5]})).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_recovery_codes').get().n,0);
 const plain=client(),again=await plain.call('/api/login',login);assert.equal(again.data.twoStep,undefined);assert.ok(plain.cookie);
});
test('a sign-in challenge dies after five wrong codes and works in the browser sample without a key',async t=>{
 const {db,client}=await workspace(t);const owner=client();await owner.call('/api/login',login);
 const begin=await owner.call('/api/account/two-step',{action:'begin',current:login.password});const secret=fromBase32(begin.data.secret);
 assert.match(db.prepare('SELECT secret FROM account_two_step').get().secret,/^plain:/);
 const now=step();await owner.call('/api/account/two-step',{action:'confirm',code:totp(secret,now)});
 const visitor=client(),{data}=await visitor.call('/api/login',login);
 for(let i=0;i<4;i++)assert.match((await visitor.call('/api/login/two-step',{challenge:data.challenge,code:'000000'})).data.error,/did not match/);
 assert.match((await visitor.call('/api/login/two-step',{challenge:data.challenge,code:'000000'})).data.error,/Too many/);
 assert.equal((await visitor.call('/api/login/two-step',{challenge:data.challenge,code:totp(secret,now+1)})).status,400);
 assert.equal(visitor.cookie,'');
});
