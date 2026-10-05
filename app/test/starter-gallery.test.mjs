import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {placeholderKeys} from '../studio-commerce.mjs';
import {starterContract,starterFormDefinition,starterFormSlug,starterKindFor,starterKinds,starterKit} from '../src/lib/starter-gallery.js';

const origin='http://127.0.0.1:4320';
const everyText=kit=>[kit.summary,...kit.messages.flatMap(m=>[m.name,m.category,m.body]),...kit.prices.flatMap(p=>[p.name,p.category,p.description]),kit.contract.title,...kit.contract.clauses.flat(),kit.form.name,kit.form.title,kit.form.description,...kit.form.questions.flatMap(q=>[q.label,q.placeholder||'',...q.options])];

test('there is a starter kit for every kind of work, written without em dashes or unknown placeholders',()=>{
 assert.equal(starterKinds.length,7);
 for(const {id} of starterKinds){
  const kit=starterKit(id);
  assert.equal(kit.id,id);
  assert.ok(kit.messages.length>=3&&kit.prices.length>=3&&kit.contract.clauses.length>=1&&kit.form.questions.length>=3,id);
  for(const value of everyText(kit))assert.doesNotMatch(value,/—/,`${id}: ${value}`);
  for(const {body} of kit.messages)for(const [,key] of body.matchAll(/\{([a-z_]+)\}/g))assert.ok(placeholderKeys.includes(key),`${id} uses {${key}}`);
  assert.doesNotMatch(starterContract(id).termsHtml,/—/);
 }
 // Older kinds of work borrow the gallery of the group they now belong to.
 assert.equal(starterKindFor('floral-design'),'event-styling');
 assert.equal(starterKindFor('unknown'),'event-styling');
 assert.match(starterContract('photo-film',{studioName:'Fern & <Co>'}).termsHtml,/Fern &amp; &lt;Co&gt;/);
});

test('every starter passes the same checks as the Templates, Pricing, Forms and Contracts screens',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-starters-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${ws.server.address().port}`;let cookie='';
 async function call(route,method='GET',body){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
 const studio=(await call('/api/me')).data.studios[0],q=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+q)).data.projects[0];
 for(const {id} of starterKinds){
  const kit=starterKit(id);
  for(const template of kit.messages){const r=await call('/api/message-templates'+q,'POST',{action:'create',template});assert.equal(r.status,200,`${id} ${template.name}: ${r.data.error}`);}
  for(const item of kit.prices){const r=await call('/api/catalogue'+q,'POST',{action:'create',item});assert.equal(r.status,200,`${id} ${item.name}: ${r.data.error}`);}
  const form=await call('/api/forms'+q,'POST',{slug:starterFormSlug(id),definition:starterFormDefinition(id)});
  assert.equal(form.status,201,`${id} form: ${form.data.error}`);
  assert.equal(form.data.form.status,'draft');
  assert.deepEqual(form.data.form.definition.questions.map(item=>item.label),kit.form.questions.map(item=>item.label));
  const contract=starterContract(id,{studioName:studio.name});
  const agreement=await call(`/api/projects/${project.id}/engagements/create-agreement${q}`,'POST',{...contract,expiresOn:'2099-01-01'});
  assert.equal(agreement.status,200,`${id} contract: ${agreement.data.error}`);
  assert.equal(agreement.data.agreements[0].title,kit.contract.title);
  assert.equal(agreement.data.agreements[0].termsHtml,contract.termsHtml);
 }
 // A second copy of a form starter is refused rather than overwriting the first.
 assert.equal((await call('/api/forms'+q,'POST',{slug:starterFormSlug('general'),definition:starterFormDefinition('general')})).status,409);
});
