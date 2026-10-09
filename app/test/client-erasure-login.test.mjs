import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

// Erasing a client must also end their login: no session, no invitation and no account left to sign in with.
const origin='http://127.0.0.1:4320',password='correct horse battery 42';
async function workspace(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-erasure-login-')),{server,db}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});});
 const agent=()=>{let cookie='';return async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:r.status,data:await r.json().catch(()=>null)};};};
 const studio=agent();assert.equal((await studio('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
 const studioId=(await studio('/api/me')).data.studios.find(s=>s.role==='owner').id;
 // A client invited and joined, signed in on their own device.
 async function joinedClient(email,name){
  const clientId=(await studio(`/api/clients?studio=${studioId}`,'POST',{name,email})).data.client.id;
  const invite=(await studio(`/api/clients/${clientId}/invite?studio=${studioId}`,'POST',{})).data;
  const client=agent();assert.equal((await client('/api/invite/claim','POST',{token:new URL(invite.url).hash.slice(1),name,password})).status,200);
  assert.equal((await client('/api/me')).data.studios.length,1);
  return {clientId,client,token:new URL(invite.url).hash.slice(1),userId:db.prepare('SELECT id FROM users WHERE email=?').get(email).id};
 }
 return {db,studio,studioId,agent,joinedClient};
}

test('an erased client cannot sign in, keep a session or reuse their invitation',async t=>{
 const {db,studio,studioId,agent,joinedClient}=await workspace(t);
 const {clientId,client,token,userId}=await joinedClient('erase.me@example.test','Erase Me');
 db.prepare('INSERT INTO invitations VALUES(?,?,?,?,0)').run(randomUUID(),studioId,'erase.me@example.test',Date.now()+86400000);
 const erased=await studio(`/api/clients/${clientId}/erase?studio=${studioId}`,'POST',{confirmName:'Erase Me'});
 assert.equal(erased.status,200);assert.deepEqual(erased.data.accounts,{deleted:1,anonymised:0,unlinked:0});
 assert.equal((await client('/api/me')).status,401,'the session they were signed in with has ended');
 const again=agent();
 const signIn=await again('/api/login','POST',{email:'erase.me@example.test',password});
 assert.equal(signIn.status,401,'their email and password no longer sign in');assert.match(signIn.data.error,/incorrect/i);
 assert.equal((await again('/api/invite/claim','POST',{token,name:'Erase Me',password})).status,400,'the used invitation cannot make a new login');
 for(const [sql,arg] of [['SELECT 1 FROM users WHERE id=? OR email=?',[userId,'erase.me@example.test']],['SELECT 1 FROM sessions WHERE user_id=?',[userId]],['SELECT 1 FROM memberships WHERE user_id=?',[userId]],['SELECT 1 FROM invitations WHERE email=?',['erase.me@example.test']]])
  assert.equal(db.prepare(sql).get(...arg),undefined,sql);
});

test('a login still named by a kept record is anonymised, and one shared with another studio only loses this studio',async t=>{
 const {db,studio,studioId,agent,joinedClient}=await workspace(t);
 // Something the studio keeps still points at the first login, so the row stays without anything that identifies or signs in.
 const kept=await joinedClient('kept@example.test','Kept Record');
 const amelia=db.prepare('SELECT id FROM clients WHERE studio_id=? AND email=?').get(studioId,'amelia@example.test').id;
 db.prepare(`INSERT INTO crm_activities(id,studio_id,client_id,kind,title,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),studioId,amelia,'note','Introduced Amelia',kept.userId,'Kept Record',new Date().toISOString());
 const first=await studio(`/api/clients/${kept.clientId}/erase?studio=${studioId}`,'POST',{confirmName:'Kept Record'});
 assert.deepEqual(first.data.accounts,{deleted:0,anonymised:1,unlinked:0});
 const row=db.prepare('SELECT * FROM users WHERE id=?').get(kept.userId);
 assert.equal(row.name,'Erased client');assert.match(row.email,/@erased\.invalid$/);assert.equal(row.password,'');
 assert.equal((await kept.client('/api/me')).status,401);
 assert.equal((await agent()('/api/login','POST',{email:'kept@example.test',password})).status,401);
 // The second login also works with another studio, which keeps it.
 const shared=await joinedClient('shared@example.test','Shared Client'),otherStudio=randomUUID();
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(otherStudio,'other-studio','Other Studio','#222222','[]');
 db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(shared.userId,otherStudio,'client');
 const second=await studio(`/api/clients/${shared.clientId}/erase?studio=${studioId}`,'POST',{confirmName:'Shared Client'});
 assert.deepEqual(second.data.accounts,{deleted:0,anonymised:0,unlinked:1});
 const me=await shared.client('/api/me');
 assert.equal(me.status,200);assert.deepEqual(me.data.studios.map(s=>s.id),[otherStudio],'they keep the other studio and lose this one');
 assert.equal(db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND studio_id=?').get(shared.userId,studioId),undefined);
});
