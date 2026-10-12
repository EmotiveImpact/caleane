import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

// The client join page names the studio and the person invited, and only for a live invitation.
test('a client invitation preview names the studio and the client',async t=>{
 const origin='http://127.0.0.1:4320',dir=await mkdtemp(path.join(os.tmpdir(),'caleane-invite-preview-')),{server,db}=await createWorkspace({dbFile:path.join(dir,'db'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});});
 const agent=()=>{let cookie='';return async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:r.status,data:await r.json()};};};
 const studio=agent();assert.equal((await studio('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
 const studioId=(await studio('/api/me')).data.studios.find(s=>s.role==='owner').id;
 const clientId=(await studio(`/api/clients?studio=${studioId}`,'POST',{name:'Priya Shah',email:'priya.preview@example.test'})).data.client.id;
 const token=new URL((await studio(`/api/clients/${clientId}/invite?studio=${studioId}`,'POST',{})).data.url).hash.slice(1);
 const visitor=agent(),preview=await visitor('/api/invite/preview','POST',{token});
 assert.equal(preview.status,200);assert.equal(preview.data.name,'Priya Shah');assert.equal(preview.data.email,'priya.preview@example.test');assert.ok(preview.data.studioName);
 assert.equal((await visitor('/api/invite/preview','POST',{token:'not-a-real-token'})).status,400);
 assert.equal((await visitor('/api/invite/claim','POST',{token,name:'Priya Shah',password:'correct horse battery 42'})).status,200);
 assert.equal((await agent()('/api/invite/preview','POST',{token})).status,400,'a used invitation reveals nothing');
});
