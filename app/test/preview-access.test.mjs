import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';

test('optional preview gate protects app and API while leaving GET health open',async()=>{
 const previousUser=process.env.PREVIEW_ACCESS_USER,previousPass=process.env.PREVIEW_ACCESS_PASS;
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-preview-'));
 let workspace;
 let base;
 async function start(file){workspace=await createWorkspace({dbFile:path.join(dir,file),origin});await new Promise(resolve=>workspace.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${workspace.server.address().port}`;}
 async function stop(){await new Promise(resolve=>workspace.server.close(resolve));workspace.db.close();workspace=null;}
 async function call(route,authorization,method='GET',body){return fetch(base+route,{method,headers:{Origin:origin,...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
 const auth=(name,pass)=>'Basic '+Buffer.from(`${name}:${pass}`,'utf8').toString('base64');
 try{
  process.env.PREVIEW_ACCESS_USER='preview-guest';process.env.PREVIEW_ACCESS_PASS='A-strong-preview-pass:2026';
  await start('gated.sqlite');
  let response=await call('/api/health');assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  response=await call('/api/info');assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate'),/^Basic realm="Caleane preview"/);assert.equal(await response.text(),'Preview access required.');
  assert.equal((await call('/')).status,401);
  assert.equal((await call('/favicon.svg')).status,401);
  assert.equal((await call('/api/public/missing')).status,401);
  assert.equal((await call('/api/info',auth('preview-guest','wrong'))).status,401);
  assert.equal((await call('/api/info',auth('wrong','A-strong-preview-pass:2026'))).status,401);
  assert.equal((await call('/api/info','Basic malformed:base64')).status,401);
  response=await call('/api/signup',undefined,'POST',{name:'Blocked',email:'blocked@example.test',studio:'Blocked Studio',slug:'blocked-studio',password:'Password12345!'});
  assert.equal(response.status,401);
  assert.equal(workspace.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email='blocked@example.test'").get().n,0);
  response=await call('/api/info',auth('preview-guest','A-strong-preview-pass:2026'));assert.equal(response.status,200);
  response=await call('/favicon.svg',auth('preview-guest','A-strong-preview-pass:2026'));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^image\/svg\+xml/);
  assert.equal((await call('/api/health',auth('wrong','wrong'))).status,200);
  assert.equal((await call('/api/health',undefined,'HEAD')).status,401);
  await stop();
  delete process.env.PREVIEW_ACCESS_USER;delete process.env.PREVIEW_ACCESS_PASS;
  await start('ungated.sqlite');
  assert.equal((await call('/api/info')).status,200);
  assert.equal((await call('/favicon.svg')).status,200);
 }finally{
  if(workspace?.server.listening)await stop();
  if(previousUser===undefined)delete process.env.PREVIEW_ACCESS_USER;else process.env.PREVIEW_ACCESS_USER=previousUser;
  if(previousPass===undefined)delete process.env.PREVIEW_ACCESS_PASS;else process.env.PREVIEW_ACCESS_PASS=previousPass;
  await rm(dir,{recursive:true,force:true});
 }
});
