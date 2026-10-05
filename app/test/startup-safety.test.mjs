import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace,assertSafeStartup} from '../server.mjs';
import {createAccountSecurity} from '../account-security.mjs';

test('the seeded demo refuses to start in production without an explicit opt-in',()=>{
 assert.throws(()=>assertSafeStartup({WORKSPACE_DEMO:'1',NODE_ENV:'production'}),/ALLOW_PUBLIC_DEMO=1/);
 assert.doesNotThrow(()=>assertSafeStartup({WORKSPACE_DEMO:'1',NODE_ENV:'production',ALLOW_PUBLIC_DEMO:'1'}));
 assert.doesNotThrow(()=>assertSafeStartup({WORKSPACE_DEMO:'1'}));
 assert.doesNotThrow(()=>assertSafeStartup({NODE_ENV:'production'}));
});

test('account mail moves to its own key and still opens mail sealed with the shared key',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-mail-keys-')),origin='http://127.0.0.1:4320',shared=randomBytes(32).toString('base64'),own=randomBytes(32).toString('base64');
 const {db,server}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true,notificationKey:shared,accountMailKey:''});
 try{
  const user=db.prepare("SELECT * FROM users WHERE email='studio@example.test'").get(),sent=[];
  createAccountSecurity(db,{origin,encryptionKey:shared}).enqueue(user,'reset');
  const rotated=createAccountSecurity(db,{origin,encryptionKey:own,previousKeys:[shared]});
  assert.deepEqual(await rotated.dispatchOne(async message=>{sent.push(message);}),{state:'sent'});
  assert.equal(sent[0].to,user.email);
  rotated.enqueue(db.prepare("SELECT * FROM users WHERE email='amelia@example.test'").get(),'verify');
  const sharedOnly=createAccountSecurity(db,{origin,encryptionKey:shared});
  assert.deepEqual(await sharedOnly.dispatchOne(async()=>assert.fail('decrypted with the wrong key')),{state:'pending'},'mail sealed with the account key needs that key');
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
