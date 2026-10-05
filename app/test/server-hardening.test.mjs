import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

async function workspace(t,options={}){
 const origin=options.origin||'http://127.0.0.1:4320',dir=await mkdtemp(path.join(os.tmpdir(),'caleane-hardening-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0,...options});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${ws.server.address().port}`;
 const call=(route,{method='GET',body,headers={}}={})=>fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 return {ws,call};
}
const status=async pending=>{const response=await pending;await response.arrayBuffer();return response.status;};
const login=(call,email,password,ip)=>call('/api/login',{method:'POST',body:{email,password},headers:ip?{'X-Forwarded-For':ip}:{}});

test('without TRUST_PROXY a spoofed X-Forwarded-For header does not escape the per-address limit',async t=>{
 const {call}=await workspace(t);
 for(let i=0;i<15;i++)assert.equal((await login(call,`nobody${i}@example.test`,'not the password!',`10.0.0.${i}`)).status,401);
 assert.equal((await login(call,'another@example.test','not the password!','10.9.9.9')).status,429);
});

test('behind a trusted proxy the right-most forwarded address is limited separately',async t=>{
 const {call}=await workspace(t,{trustProxy:1});
 for(let i=0;i<15;i++)assert.equal((await login(call,`nobody${i}@example.test`,'not the password!','1.1.1.1, 203.0.113.5')).status,401);
 assert.equal((await login(call,'next@example.test','not the password!','9.9.9.9, 203.0.113.5')).status,429,'the spoofable left-most entry is ignored');
 assert.equal((await login(call,'next@example.test','not the password!','203.0.113.6')).status,401,'another client keeps its own allowance');
});

test('repeated failures against one email are limited across addresses',async t=>{
 const {call}=await workspace(t,{trustProxy:1});
 for(let i=0;i<10;i++)assert.equal((await login(call,'studio@example.test','not the password!',`198.51.100.${i}`)).status,401);
 assert.equal((await login(call,'studio@example.test','StudioDemo2026!','198.51.100.200')).status,429);
 assert.equal((await login(call,'amelia@example.test','StudioDemo2026!','198.51.100.201')).status,200);
});

test('large bodies are refused before sign-in and slow requests are bounded',async t=>{
 const {ws,call}=await workspace(t);
 const big=JSON.stringify({name:'a.png',content:'A'.repeat(200000)});
 assert.equal(await status(call('/api/projects/00000000-0000-0000-0000-000000000000/files?studio=x',{method:'POST',body:big})),401);
 assert.equal(await status(call('/api/conversations/abc/files?studio=x',{method:'POST',body:big})),401);
 assert.equal(await status(call('/api/login',{method:'POST',body:big})),413);
 const chunked=await new Promise((resolve,reject)=>{const request=http.request(`http://127.0.0.1:${ws.server.address().port}/api/login`,{method:'POST',headers:{Origin:'http://127.0.0.1:4320','Content-Type':'application/json'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.write('{"email":"'+'a'.repeat(70000));request.end('"}');});
 assert.equal(chunked,413,'bodies without a length are counted as they arrive');
 assert.equal(ws.server.headersTimeout,20000);assert.equal(ws.server.requestTimeout,120000);
});

test('app pages carry a content security policy and https origins add HSTS',async t=>{
 const {call}=await workspace(t,{origin:'https://app.example.test'});
 const page=await call('/login'),csp=page.headers.get('content-security-policy');
 assert.match(csp,/script-src 'self';/);assert.match(csp,/connect-src 'self'/);assert.match(csp,/img-src 'self' data: blob: https:/);assert.match(csp,/frame-ancestors 'none'/);
 assert.match(page.headers.get('strict-transport-security'),/max-age=31536000/);
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('referrer-policy'),'same-origin');
 const intake=await call('/intake/nay-decor');assert.match(intake.headers.get('content-security-policy'),/script-src 'self'.*frame-ancestors 'self' /);
});

test('plain http origins do not send HSTS',async t=>{
 const {call}=await workspace(t);
 assert.equal((await call('/api/health')).headers.get('strict-transport-security'),null);
});

test('unexpected errors are logged with method and route but not returned',async t=>{
 const {ws,call}=await workspace(t);
 const cookie=(await login(call,'studio@example.test','StudioDemo2026!')).headers.get('set-cookie').split(';')[0];
 const errors=t.mock.method(console,'error',()=>{});
 ws.db.exec('DROP TABLE studio_branding');
 const response=await call('/api/me?secret=1',{headers:{Cookie:cookie}});
 assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'Something went wrong. Please try again.'});
 assert.equal(errors.mock.callCount(),1);
 const [message,stack]=errors.mock.calls[0].arguments;
 assert.equal(message,'Unexpected error on GET /api/me:');assert.match(stack,/studio_branding/);assert.match(stack,/\n\s+at /);
 assert.equal((await call('/api/projects?studio=x')).status,401);assert.equal(errors.mock.callCount(),1,'expected failures are not logged');
});
