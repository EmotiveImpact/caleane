import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {studioStorageBytes,studioQuotaBytes,cleanupUnattachedUploads,DEFAULT_STUDIO_QUOTA_BYTES} from '../uploads.mjs';

const origin='http://127.0.0.1:4320';
async function workspace(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-uploads-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${ws.server.address().port}`;let cookie='';
 const call=async(route,method='GET',body)=>{const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return {status:response.status,data:await response.json()};};
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
 const studio=(await call('/api/me')).data.studios[0],q='?studio='+studio.id,project=(await call('/api/projects'+q)).data.projects.find(p=>p.tasks?.length);
 return {ws,call,studio,q,project};
}
const pdf=bytes=>Buffer.from('%PDF-1.7\n'+'x'.repeat(bytes)).toString('base64');

test('the studio storage quota defaults to 2 GB and can be configured',()=>{
 assert.equal(studioQuotaBytes({}),DEFAULT_STUDIO_QUOTA_BYTES);assert.equal(DEFAULT_STUDIO_QUOTA_BYTES,2*1024**3);
 assert.equal(studioQuotaBytes({CALEANE_STUDIO_STORAGE_BYTES:'5000'}),5000);assert.equal(studioQuotaBytes({CALEANE_STUDIO_STORAGE_BYTES:'nonsense'}),DEFAULT_STUDIO_QUOTA_BYTES);
});

test('every upload path refuses files beyond the studio storage quota',async t=>{
 const {ws,call,studio,q,project}=await workspace(t),conversation=(await call('/api/conversations'+q)).data.conversations[0];
 const previous=process.env.CALEANE_STUDIO_STORAGE_BYTES;t.after(()=>{if(previous===undefined)delete process.env.CALEANE_STUDIO_STORAGE_BYTES;else process.env.CALEANE_STUDIO_STORAGE_BYTES=previous;});
 const used=studioStorageBytes(ws.db,studio.id);process.env.CALEANE_STUDIO_STORAGE_BYTES=String(used+3000);
 assert.equal((await call(`/api/conversations/${conversation.id}/files${q}`,'POST',{name:'a.pdf',content:pdf(2000)})).status,201);
 assert.ok(studioStorageBytes(ws.db,studio.id)>used);
 const refused=[
  await call(`/api/conversations/${conversation.id}/files${q}`,'POST',{name:'b.pdf',content:pdf(2000)}),
  await call(`/api/projects/${project.id}/files${q}`,'POST',{name:'c.pdf',content:pdf(2000)}),
  await call(`/api/projects/${project.id}/drafts/files${q}`,'POST',{name:'d.pdf',content:pdf(2000)}),
  await call(`/api/task-workspace/project/${project.tasks[0].id}${q}&project=${project.id}`,'POST',{action:'file',name:'e.pdf',content:pdf(2000)}),
 ];
 for(const response of refused){assert.equal(response.status,413);assert.match(response.data.error,/storage/);}
 process.env.CALEANE_STUDIO_STORAGE_BYTES=String(used+100000);
 assert.equal((await call(`/api/task-workspace/project/${project.tasks[0].id}${q}&project=${project.id}`,'POST',{action:'file',name:'e.pdf',content:pdf(2000)})).status,200);
});

test('uploads nobody attached are cleaned up while attached and recent files stay',async t=>{
 const {ws,call,studio,q}=await workspace(t),db=ws.db,conversation=(await call('/api/conversations'+q)).data.conversations[0],route=`/api/conversations/${conversation.id}`;
 const upload=async name=>(await call(`${route}/files${q}`,'POST',{name,content:pdf(100)})).data.file.fileId;
 const attached=await upload('attached.pdf'),stale=await upload('stale.pdf'),recent=await upload('recent.pdf');
 assert.equal((await call(`${route}/messages${q}`,'POST',{text:'With a file',attachmentIds:[attached]})).status,200);
 db.prepare("UPDATE conversation_files SET created_at='2020-01-01T00:00:00.000Z' WHERE id IN (?,?)").run(attached,stale);
 db.prepare('INSERT INTO task_collaboration VALUES(?,?,?)').run(studio.id,'crm:listed',JSON.stringify({assigneeId:'',comments:[],files:[{id:'listed-file'}]}));
 for(const fileId of ['listed-file','orphan-file'])db.prepare('INSERT INTO task_attachments VALUES(?,?,?,?,?,?)').run(fileId,studio.id,'crm:listed','task.pdf','application/pdf',Buffer.from('%PDF-1.7 task'));
 assert.equal(cleanupUnattachedUploads(db),2);
 assert.deepEqual(db.prepare('SELECT id FROM conversation_files ORDER BY id').all().map(r=>r.id),[attached,recent].sort());
 assert.deepEqual(db.prepare('SELECT id FROM task_attachments').all().map(r=>r.id),['listed-file']);
 assert.equal(cleanupUnattachedUploads(db,{clock:()=>Date.now()+2*86400000}),1,'the recent upload goes once it is a day old');
});
