import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
const origin='http://127.0.0.1:4320';
test('reference details and discussion persist without changing a design decision',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-references-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const sessions={owner:'',client:''};
 async function call(route,method='GET',body,who){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(who&&sessions[who]?{Cookie:sessions[who]}:{})},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie&&who)sessions[who]=cookie.split(';')[0];let data;try{data=await response.json();}catch{}return {status:response.status,data,response};}
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id;
  const query='?studio='+studio;
  const p=(await call('/api/projects'+query,'GET',undefined,'client')).data.projects[0];
  const originalDesigns=structuredClone(p.designs),revision=p.briefRevision;
  const route='/api/projects/'+p.id;
  const added=await call(route+'/inspiration'+query,'POST',{title:'Stone sample',url:'',note:'Texture for the entry',category:'Materials',source:'Studio archive'},'owner');
  assert.equal(added.status,200);
  const reference=added.data.project.inspiration.find(i=>i.title==='Stone sample');
  assert.equal(reference.category,'Materials');assert.equal(reference.source,'Studio archive');
  const commented=await call(route+'/reference-comments'+query,'POST',{referenceId:reference.id,text:'Can we use a warmer finish?',point:{x:37,y:48}},'client');
  assert.equal(commented.status,200);
  const discussion=commented.data.project.inspiration.find(i=>i.id===reference.id).comments;
  assert.equal(discussion.length,1);assert.deepEqual(discussion[0].point,{x:37,y:48});
  assert.equal((await call(route+'/reference-comments'+query,'POST',{referenceId:reference.id,text:'Invalid pin',point:{x:103,y:48}},'client')).status,400);
  assert.equal((await call(route+'/reference-update'+query,'POST',{referenceId:reference.id,title:'Changed by client'},'client')).status,403);
  const edited=await call(route+'/reference-update'+query,'POST',{referenceId:reference.id,title:'Travertine sample',note:'For the arrival wall',category:'Materials',source:'Stone library'},'owner');
  assert.equal(edited.status,200);
  const result=edited.data.project;
  assert.equal(result.inspiration.find(i=>i.id===reference.id).title,'Travertine sample');
  assert.equal(result.inspiration.find(i=>i.id===reference.id).comments[0].text,'Can we use a warmer finish?');
  assert.deepEqual(result.designs,originalDesigns);assert.equal(result.briefRevision,revision);
  assert.equal((await call('/api/projects/00000000-0000-4000-8000-000000000000/reference-comments'+query,'POST',{referenceId:reference.id,text:'Outside'},'client')).status,404);
  const image=await call('/assets/identity/calenne-symbol-ivory.svg');assert.equal(image.status,200);assert.equal(image.response.headers.get('content-type'),'image/svg+xml');
  const favicon=await call('/assets/identity/calenne-favicon-32.png');assert.equal(favicon.status,200);assert.equal(favicon.response.headers.get('content-type'),'image/png');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
