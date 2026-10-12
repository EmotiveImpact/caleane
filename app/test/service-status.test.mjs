import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

// Settings, Status lists every connected service, and says "coming soon" for the ones Caleane hasn't switched on.
test('the status page lists the helper, calendar, Zoom, Xero and Stripe',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-status-')),origin='http://127.0.0.1:4320',app=await createWorkspace({dbFile:path.join(dir,'db.sqlite'),origin,demo:true,assistant:null});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});});
 const call=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
 const q='?studio='+(await call('/api/me')).data.studios[0].id,status=await call('/api/operations'+q);
 assert.equal(status.status,200);
 const checks=Object.fromEntries(status.data.checks.map(c=>[c.id,c]));
 for(const id of ['ai','calendar','zoom','xero','stripe']){assert.ok(checks[id],id+' is listed');}
 assert.equal(checks.ai.status,'waiting');assert.match(checks.ai.detail,/coming soon/i);
 assert.ok(!JSON.stringify(status.data).match(/sk_|secret|api_key/i),'no keys are exposed');
});
