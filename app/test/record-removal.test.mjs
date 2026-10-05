import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64').toString('base64');

test('studios can remove tasks, references, drafts, comments, notes, contacts and erase a client',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-removal-')),file=path.join(dir,'test.sqlite'),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:file,origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const client=(await call('/api/clients'+q)).data.clients.find(c=>c.email==='amelia@example.test');
  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.clientId===client.id);

  // Project and follow-up tasks
  let r=await call(`/api/projects/${project.id}/tasks${q}`,'POST',{title:'Temporary step',assignee:'studio',due:''});
  assert.equal(r.status,200);const task=r.data.project.tasks.at(-1);
  r=await call(`/api/projects/${project.id}/tasks${q}`,'POST',{taskId:task.id,remove:true});
  assert.equal(r.status,200);assert.ok(!r.data.project.tasks.some(t=>t.id===task.id));
  r=await call('/api/crm/tasks'+q,'POST',{clientId:client.id,title:'Call back',dueDate:'',priority:'Normal'});
  assert.equal(r.status,201);
  assert.equal((await call(`/api/crm/tasks/${r.data.task.id}${q}`,'PATCH',{remove:true})).status,200);
  assert.ok(!(await call('/api/crm/tasks'+q)).data.tasks.some(t=>t.id===r.data.task.id));

  // References, their files and comments
  r=await call(`/api/projects/${project.id}/files${q}`,'POST',{name:'swatch.png',content:png,title:'Swatch'});
  assert.equal(r.status,200);const ref=r.data.project.inspiration[0];
  r=await call(`/api/projects/${project.id}/reference-comments${q}`,'POST',{referenceId:ref.id,text:'Lovely'});
  const comment=r.data.project.inspiration[0].comments[0];
  r=await call(`/api/projects/${project.id}/reference-comments${q}`,'POST',{referenceId:ref.id,removeCommentId:comment.id});
  assert.equal(r.data.project.inspiration[0].comments.length,0);
  r=await call(`/api/projects/${project.id}/reference-update${q}`,'POST',{referenceId:ref.id,remove:true});
  assert.equal(r.status,200);assert.ok(!r.data.project.inspiration.some(i=>i.id===ref.id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files WHERE id=?').get(ref.fileId).n,0,'unused reference file is deleted');

  // Design comments can be reopened, edited and deleted
  const design=project.designs.at(-1);
  r=await call(`/api/projects/${project.id}/comments${q}`,'POST',{designId:design.id,text:'First thought'});
  let dc=r.data.project.designs.find(d=>d.id===design.id).comments.at(-1);
  r=await call(`/api/projects/${project.id}/comments${q}`,'POST',{designId:design.id,editCommentId:dc.id,text:'Second thought'});
  assert.equal(r.data.project.designs.find(d=>d.id===design.id).comments.at(-1).text,'Second thought');
  await call(`/api/projects/${project.id}/comments${q}`,'POST',{designId:design.id,resolve:true,commentId:dc.id});
  r=await call(`/api/projects/${project.id}/comments${q}`,'POST',{designId:design.id,unresolve:true,commentId:dc.id});
  assert.equal(r.data.project.designs.find(d=>d.id===design.id).comments.find(c=>c.id===dc.id).resolved,false);
  r=await call(`/api/projects/${project.id}/comments${q}`,'POST',{designId:design.id,removeCommentId:dc.id});
  assert.ok(!r.data.project.designs.find(d=>d.id===design.id).comments.some(c=>c.id===dc.id));

  // Private drafts and their uploads
  r=await call(`/api/projects/${project.id}/drafts/files${q}`,'POST',{name:'draft.png',content:png});
  const asset=r.data.asset;
  r=await call(`/api/projects/${project.id}/drafts/files${q}`,'POST',{name:'spare.png',content:png});
  const spare=r.data.asset;
  assert.equal((await call(`/api/projects/${project.id}/drafts/files${q}`,'PATCH',{removeFileId:spare.fileId})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files WHERE id=?').get(spare.fileId).n,0);
  r=await call(`/api/projects/${project.id}/drafts${q}`,'POST',{title:'Idea',description:'',assetIds:[asset.fileId],briefRevision:project.briefRevision});
  assert.equal(r.status,201);
  assert.equal((await call(`/api/projects/${project.id}/drafts/${r.data.draft.id}${q}`,'PATCH',{remove:true})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files WHERE id=?').get(asset.fileId).n,0,'draft-only upload is deleted with the draft');

  // Notes, contacts and archiving
  r=await call(`/api/clients/${client.id}/notes${q}`,'POST',{text:'Prefers calls'});const note=r.data.client.notes[0];
  r=await call(`/api/clients/${client.id}/notes${q}`,'PATCH',{noteId:note.id,text:'Prefers email'});
  assert.equal(r.data.client.notes[0].text,'Prefers email');
  r=await call(`/api/clients/${client.id}/notes${q}`,'PATCH',{noteId:note.id,remove:true});
  assert.ok(!r.data.client.notes.some(n=>n.id===note.id));
  r=await call(`/api/clients/${client.id}/contacts${q}`,'POST',{name:'Temp Contact',email:'temp@example.test'});
  assert.equal((await call(`/api/contacts/${r.data.contact.id}${q}`,'PATCH',{remove:true})).status,200);
  const primary=(await call(`/api/clients/${client.id}/contacts${q}`)).data.contacts.find(c=>c.isPrimary);
  assert.equal((await call(`/api/contacts/${primary.id}${q}`,'PATCH',{remove:true})).status,409,'primary contact is protected');
  r=await call(`/api/clients/${client.id}${q}`,'PATCH',{archived:true});
  assert.equal(r.data.client.archived,true);
  r=await call(`/api/clients/${client.id}${q}`,'PATCH',{archived:false});
  assert.equal(r.data.client.archived,false);

  // Erasure: a fresh client with a project is erased completely
  r=await call('/api/clients'+q,'POST',{name:'Erase Me',email:'erase@example.test'});const doomed=r.data.client;
  r=await call('/api/projects'+q,'POST',{clientId:doomed.id,name:'Erase Me',email:'erase@example.test',occasion:'Birthday'});
  const doomedProject=r.data.project;
  await call(`/api/projects/${doomedProject.id}/messages${q}`,'POST',{text:'Hello'});
  r=await call(`/api/clients/${doomed.id}/erase${q}`);
  assert.equal(r.status,200);assert.equal(r.data.projects.length,1);assert.equal(r.data.blocked.length,0);
  assert.equal((await call(`/api/clients/${doomed.id}/erase${q}`,'POST',{confirmName:'erase me'})).status,400,'name must match exactly');
  r=await call(`/api/clients/${doomed.id}/erase${q}`,'POST',{confirmName:'Erase Me'});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clients WHERE id=?').get(doomed.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects WHERE id=?').get(doomedProject.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE project_id=?').get(doomedProject.id).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crm_contacts WHERE email='erase@example.test'").get().n,0);
  assert.equal((await call(`/api/projects/${doomedProject.id}${q}`)).status,404);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});

test('clients without approval rights do not receive prices or payment activity',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-roles-')),file=path.join(dir,'test.sqlite'),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:file,origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const client=(await call('/api/clients'+q)).data.clients.find(c=>c.email==='amelia@example.test');
  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.clientId===client.id);
  assert.equal((await call(`/api/projects/${project.id}/estimates${q}`,'POST',{currency:'GBP',items:[{title:'Flowers',quantity:1,unitAmount:50000}]})).status,200);
  let r=await call(`/api/clients/${client.id}/contacts${q}`,'POST',{name:'Viewer Friend',email:'viewer@example.test'});
  await call(`/api/projects/${project.id}/stakeholders${q}`,'POST',{contactId:r.data.contact.id,role:'Viewer'});
  r=await call(`/api/projects/${project.id}/stakeholders/${r.data.contact.id}/invite${q}`,'POST',{});
  const token=new URL(r.data.url).hash.slice(1);
  assert.equal((await call('/api/invite/claim','POST',{token,name:'Viewer Friend',password:'ViewerPass2026!'},'viewer')).status,200);
  const seen=(await call(`/api/projects/${project.id}${q}`,'GET',undefined,'viewer')).data.project;
  assert.deepEqual(seen.estimates,[]);assert.deepEqual(seen.proposals,[]);assert.equal(seen.moneyHidden,true);
  assert.ok(!seen.activity.some(a=>/estimate|invoice|payment/i.test(a.text)));
  const own=(await call(`/api/projects/${project.id}${q}`)).data.project;
  assert.ok(own.estimates.length>0,'the studio still sees estimates');
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});

test('people can change their name and password and sign out other devices',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-account-')),file=path.join(dir,'test.sqlite'),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:file,origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'laptop');
  assert.equal((await call('/api/account/profile','PATCH',{name:'Renamed Owner'})).status,200);
  assert.equal((await call('/api/me')).data.user.name,'Renamed Owner');
  assert.equal((await call('/api/account/password','POST',{current:'wrong password!',password:'BrandNewPass2026!'})).status,400);
  assert.equal((await call('/api/account/password','POST',{current:'StudioDemo2026!',password:'BrandNewPass2026!'})).status,200);
  assert.equal((await call('/api/me')).status,200,'this device stays signed in');
  assert.equal((await call('/api/me','GET',undefined,'laptop')).status,401,'other devices are signed out');
  await call('/api/login','POST',{email:'studio@example.test',password:'BrandNewPass2026!'},'laptop');
  const r=await call('/api/account/sessions','POST',{action:'sign-out-others'});
  assert.equal(r.data.signedOut,1);
  assert.equal((await call('/api/me','GET',undefined,'laptop')).status,401);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});

test('estimate drafts stay private until shared',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'studio-estimate-draft-')),file=path.join(dir,'test.sqlite'),origin='http://127.0.0.1:4320';
 const {server,db}=await createWorkspace({dbFile:file,origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:await response.json()};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
  await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const project=(await call('/api/projects'+q)).data.projects.find(p=>p.brief.email==='amelia@example.test'||p.clientEmail==='amelia@example.test');
  const before=project.estimates?.length||0;
  let r=await call(`/api/projects/${project.id}/estimates${q}`,'POST',{saveAs:'draft',currency:'EUR',title:'Draft',items:[{title:'Hire',quantity:2,unitAmount:1000}]});
  assert.equal(r.status,200);assert.equal(r.data.project.estimateDraft.currency,'EUR');assert.equal(r.data.project.estimates.length,before);
  const seen=(await call(`/api/projects/${project.id}${q}`,'GET',undefined,'client')).data.project;
  assert.equal(seen.estimateDraft,undefined,'clients never see drafts');
  r=await call(`/api/projects/${project.id}/estimates${q}`,'POST',{currency:'EUR',title:'Shared',items:[{title:'Hire',quantity:2,unitAmount:1000}]});
  assert.equal(r.data.project.estimates.length,before+1);assert.equal(r.data.project.estimateDraft,undefined);
  await call(`/api/projects/${project.id}/estimates${q}`,'POST',{saveAs:'draft',currency:'EUR',items:[{title:'Hire',quantity:1,unitAmount:1000}]});
  r=await call(`/api/projects/${project.id}/estimates${q}`,'POST',{discardDraft:true});
  assert.equal(r.data.project.estimateDraft,undefined);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
