import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('private drafts become immutable shared versions, and studio viewers remain separate from clients',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-drafts-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  let data;try{data=await response.json();}catch{}return {status:response.status,data};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id,q=`?studio=${studio}`;
  const project=(await call('/api/projects'+q,'GET',undefined,'client')).data.projects[0],route=`/api/projects/${project.id}`;
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9kAAAAASUVORK5CYII=';
  let result=await call(`${route}/drafts/files${q}`,'POST',{name:'private-direction.png',content:png},'owner');assert.equal(result.status,201);const fileId=result.data.asset.fileId;
  assert.equal((await call(`${route}/files/${fileId}${q}`,'GET',undefined,'client')).status,404);
  result=await call(`${route}/drafts${q}`,'POST',{title:'A private direction',description:'A considered first scene.',assetIds:[fileId],briefRevision:project.briefRevision},'owner');assert.equal(result.status,201);const draft=result.data.draft;
  assert.equal(draft.status,'private');assert.equal((await call(`${route}/drafts${q}`,'GET',undefined,'client')).status,403);
  assert.equal(JSON.stringify((await call(`${route}${q}`,'GET',undefined,'client')).data).includes('A private direction'),false);
  assert.equal((await call(`${route}/drafts/${draft.id}/share${q}`,'POST',{revision:0},'owner')).status,409);
  result=await call(`${route}/drafts/${draft.id}/share${q}`,'POST',{revision:draft.revision},'owner');assert.equal(result.status,200);
  const shared=result.data.project.designs.at(-1);assert.equal(shared.title,'A private direction');assert.equal(shared.assets[0].fileId,fileId);assert.equal(shared.assets[0].name,'private-direction.png');assert.match(shared.assets[0].sha256,/^[a-f0-9]{64}$/);assert.equal(shared.byUserId,(await call('/api/me','GET',undefined,'owner')).data.user.id);
  assert.equal((await call(`${route}/files/${fileId}${q}`,'GET',undefined,'client')).status,200);
  assert.equal((await call(`${route}/drafts/${draft.id}/share${q}`,'POST',{revision:draft.revision},'owner')).status,409);
  result=await call(`${route}/drafts${q}`,'POST',{title:'Next direction',description:'A stronger arrival.',assetIds:[],briefRevision:project.briefRevision},'owner');const nextDraft=result.data.draft;
  result=await call(`${route}/brief${q}`,'POST',{revision:project.briefRevision,brief:{...project.brief,venue:'A new setting'}},'owner');assert.equal(result.status,200);
  assert.equal((await call(`${route}/drafts/${nextDraft.id}/share${q}`,'POST',{revision:nextDraft.revision},'owner')).status,409);
  result=await call(`${route}/drafts/${nextDraft.id}${q}`,'PATCH',{revision:nextDraft.revision,title:nextDraft.title,description:nextDraft.description,assetIds:[],briefRevision:2},'owner');assert.equal(result.status,200);
  result=await call(`${route}/drafts/${nextDraft.id}/share${q}`,'POST',{revision:result.data.draft.revision},'owner');assert.equal(result.status,200);
  const latest=result.data.project.designs.at(-1);assert.equal(shared.briefSnapshot.venue,project.brief.venue);assert.equal(latest.briefSnapshot.venue,'A new setting');assert.equal(result.data.project.designs.at(-2).status,'Superseded');
  assert.equal((await call(`${route}/approval${q}`,'POST',{designId:shared.id,decision:'approve'},'client')).status,409);
  assert.equal((await call(`${route}/approval${q}`,'POST',{designId:latest.id,decision:'approve'},'client')).status,200);
  result=await call('/api/staff'+q,'POST',{email:'team@example.test'},'owner');assert.equal(result.status,201);assert.equal(result.data.delivery,'copy_link');const inviteToken=new URL(result.data.url).hash.slice(1);
  assert.equal((await call('/api/staff'+q,'GET',undefined,'client')).status,403);
  assert.equal((await call('/api/staff-invitations/claim','POST',{token:inviteToken,name:'Studio Colleague',password:'Colleague2026!'},'staff')).status,200);
  assert.equal((await call('/api/staff-invitations/claim','POST',{token:inviteToken},'staff')).status,400);
  const staffSession=(await call('/api/me','GET',undefined,'staff')).data;assert.equal(staffSession.studios[0].role,'staff_viewer');
  result=await call('/api/projects'+q,'GET',undefined,'staff');assert.equal(result.status,200);assert.equal(result.data.projects.length,3);const summary=result.data.projects.find(p=>p.id===project.id);assert.equal(summary.accessRole,'Studio viewer');assert.equal(summary.estimates,undefined);assert.equal(summary.messages,undefined);assert.equal(summary.brief.budget,undefined);
  assert.equal((await call(`${route}/files/${fileId}${q}`,'GET',undefined,'staff')).status,403);
  assert.equal((await call(`${route}/drafts${q}`,'GET',undefined,'staff')).status,403);
  assert.equal((await call(`${route}/designs${q}`,'POST',{title:'Forbidden',description:'No'},'staff')).status,403);
  assert.equal((await call(`${route}/approval${q}`,'POST',{designId:latest.id,decision:'approve'},'staff')).status,403);
  assert.equal((await call('/api/settings'+q,'PATCH',{name:'Wrong'},'staff')).status,403);
  assert.equal((await call('/api/invoices'+q,'GET',undefined,'staff')).status,403);
  const member=(await call('/api/staff'+q,'GET',undefined,'owner')).data.members[0];assert.equal(member.email,'team@example.test');
  assert.equal((await call(`/api/staff/${member.id}${q}`,'PATCH',{remove:true},'owner')).status,200);
  assert.equal((await call('/api/projects'+q,'GET',undefined,'staff')).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
