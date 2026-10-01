import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {formDefaults,validateForm} from '../forms.mjs';
import {newScreen,formPath,conditionMatches,branchDestinations,describeCondition,formFields} from '../src/lib/form-flow.js';
import {captureIntakeAnswers,normalizeIntakeAnswers,updateIntakeAnswers} from '../intake-questions.mjs';
import {createWorkspace} from '../server.mjs';
const condition=(field,operator,value)=>({match:'all',rules:[{field,operator,value}]});
function definition(){const d=formDefaults({accent:'#202326',branding:{}});d.projectTypes=['Wedding'];d.fields={date:false,venue:false,budget:false,colours:false,inspiration:false,practiceDetails:false};d.questions=[{id:'q-service',label:'What services do you need?',type:'multi',required:true,options:['Design','Planning']},{id:'q-guests',label:'How many guests?',type:'number',required:true,options:[]},{id:'q-setup',label:'Tell us about your setup',type:'long',required:true,options:[]}];d.screens=[newScreen(['core:occasion','core:vision','q-service','q-guests'],'Start','s-start'),{...newScreen(['q-setup'],'Your setup','s-setup'),showWhen:{match:'all',rules:[{field:'q-service',operator:'contains',value:'Planning'},{field:'q-guests',operator:'gte',value:'50'}]}},newScreen(['core:name','core:email'],'Contact','s-contact')];return validateForm(d);}
test('mixed screens evaluate typed AND/OR rules and remove skipped answers from the path',()=>{
 const d=definition(),values={occasion:'Wedding',name:'QA',email:'qa@example.test'},answers={'q-service':['Planning'],'q-guests':'70','q-setup':'Original setup'};
 assert.equal(formPath(d,values,answers).path.length,3);
 const changed=formPath(d,values,{...answers,'q-service':['Design']});assert.equal(changed.path.length,2);assert.equal(changed.active['q-setup'],undefined);
 assert.equal(conditionMatches(condition('q-guests','gt','1'),{'q-guests':''}),false);
 assert.equal(conditionMatches(condition('q-guests','eq','70.0'),answers,new Map([['q-guests',{type:'number'}]])),true);
 assert.equal(conditionMatches(condition('core:date','before','2026-12-01'),{'core:date':'2026-11-01'}),true);
 assert.equal(conditionMatches(condition('core:date','onOrAfter','2026-11-01'),{'core:date':'2026-11-01'}),true);
 assert.equal(conditionMatches(condition('q-skipped','empty',''),{}),false);
 assert.equal(conditionMatches({match:'any',rules:[{field:'q-guests',operator:'gt',value:'100'},{field:'q-service',operator:'contains',value:'Planning'}]},answers),true);
 const captured=captureIntakeAnswers(answers,d.questions,{excludedIds:new Set(['q-setup'])});assert.equal(captured[2].applicable,false);assert.equal(captured[2].value,'');assert.equal(normalizeIntakeAnswers(captured)[2].screenExcluded,true);assert.equal(updateIntakeAnswers(captured,captured.map(a=>({id:a.id,value:a.value})))[2].applicable,false);
});
test('screen validation prevents missing fields, duplicates, cycles and skipping required contact fields',()=>{
 const d=definition();
 const invalid=mutate=>{const next=structuredClone(d);mutate(next);assert.throws(()=>validateForm(next));};
 invalid(d=>d.screens[1].fields.push('core:occasion'));
 invalid(d=>d.screens[2].fields.pop());
 invalid(d=>d.screens[0].showWhen=condition('q-setup','answered',''));
 invalid(d=>d.screens[2].showWhen=condition('q-service','contains','Design'));
 invalid(d=>d.screens[1].jumps=[{to:'s-start',when:condition('q-guests','gte','50')}]);
 invalid(d=>d.screens[0].jumps=[{to:'s-deleted',when:condition('q-guests','gte','50')}]);
 invalid(d=>{d.screens.push({...newScreen([],'A note','s-note'),kind:'welcome'});d.screens[0].jumps=[{to:'s-note',when:condition('q-guests','gte','50')}];});
 invalid(d=>d.screens[1].showWhen=condition('q-service','gt','2'));
 invalid(d=>d.screens[1].showWhen=condition('q-service','contains','Missing option'));
 invalid(d=>d.screens[0].imageUrl='javascript:alert(1)');
 const branched=structuredClone(d);branched.screens[0].jumps=[{to:'s-contact',when:condition('q-service','contains','Design')}];assert.equal(formPath(validateForm(branched),{occasion:'Wedding'},{'q-service':['Design'],'q-guests':'70','q-setup':'Skipped'}).path.length,2);
});
test('screen design options are validated and legacy screens get stable defaults',()=>{
 const d=definition();
 for(const layout of ['center','image-left','image-right','cover','stack','split']){
  d.screens[0]={...d.screens[0],layout,imageFit:'contain',imagePosition:'top',contentWidth:'wide'};
  const screen=validateForm(d).screens[0];assert.equal(screen.layout,layout);assert.equal(screen.imageFit,'contain');assert.equal(screen.imagePosition,'top');assert.equal(screen.contentWidth,'wide');
 }
 const legacy=structuredClone(d);delete legacy.screens[0].imageFit;delete legacy.screens[0].imagePosition;delete legacy.screens[0].contentWidth;
 const normalized=validateForm(legacy);assert.equal(normalized.screens[0].imageFit,'cover');assert.equal(normalized.screens[0].imagePosition,'center');assert.equal(normalized.screens[0].contentWidth,'comfortable');assert.equal(normalized.theme.buttonStyle,'solid');
 for(const key of ['layout','imageFit','imagePosition','contentWidth']){const invalid=structuredClone(d);invalid.screens[0][key]='invalid';assert.throws(()=>validateForm(invalid));}
 d.theme.buttonStyle='outline';assert.equal(validateForm(d).theme.buttonStyle,'outline');d.theme.buttonStyle='unsafe';assert.throws(()=>validateForm(d));
});
test('the public API enforces the same screen route and preserves the published design in the response',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-screens-')),origin='http://127.0.0.1:4320',app=await createWorkspace({dbFile:path.join(dir,'db.sqlite'),origin,demo:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 async function call(route,body,key){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{Cookie:cookie})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
 try{
  await call('/api/login',{email:'studio@example.test',password:'StudioDemo2026!'});const studio=(await call('/api/me')).data.studios[0],q='?studio='+studio.id,d=definition();d.theme={font:'serif',background:'paper',radius:'square'};d.screens[0].layout='image-right';d.screens[0].imageFit='contain';d.screens[0].imagePosition='bottom';d.screens[0].contentWidth='narrow';d.theme.buttonStyle='outline';d.screens[2].columns=2;d.screens[0].jumps=[{to:'s-contact',when:condition('q-service','contains','Design')}];
  let form=(await call('/api/forms'+q,{slug:'mixed-screens',definition:d})).data.form;form=(await call('/api/forms/'+form.id+q,{action:'publish',revision:form.revision})).data.form;
  const body={name:'Screen QA',email:'screen-qa@example.test',occasion:'Wedding',formVersion:1,intakeAnswers:{'q-service':['Planning'],'q-guests':'60'}};
  assert.equal((await call('/api/public/nay-decor/forms/mixed-screens/enquiries',body,'missing-visible')).status,400);
  assert.equal((await call('/api/public/nay-decor/forms/mixed-screens/enquiries',{...body,intakeAnswers:{'q-service':['Design'],'q-guests':'60','q-setup':'Should be cleared'}},'skipped-required')).status,201);
  const response=(await call('/api/forms/'+form.id+'/responses'+q)).data.responses[0];assert.equal(response.snapshot.brief.intakeAnswers[2].value,'');assert.equal(response.snapshot.brief.intakeAnswers[2].applicable,false);assert.equal(response.snapshot.definition.screens[0].layout,'image-right');assert.equal(response.snapshot.definition.screens[0].imageFit,'contain');assert.equal(response.snapshot.definition.screens[0].imagePosition,'bottom');assert.equal(response.snapshot.definition.screens[0].contentWidth,'narrow');assert.equal(response.snapshot.definition.theme.buttonStyle,'outline');assert.equal(response.snapshot.definition.theme.font,'serif');
  assert.equal((await call('/api/public/nay-decor/forms/mixed-screens/enquiries',{...body,intakeAnswers:{'q-service':['Planning'],'q-guests':'60','q-setup':'Marquee setup'}},'visible-complete')).status,201);
  assert.equal((await call('/api/public/nay-decor/forms/mixed-screens/enquiries',{...body,intakeAnswers:{'q-service':['Design'],'q-guests':'invalid'}},'invalid-source')).status,400);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();await rm(dir,{recursive:true,force:true});}
});


test('editor destinations stop at required details and condition summaries explain the rule',()=>{
 const d=definition();d.screens.push({...newScreen([],'A final note','s-note'),kind:'welcome'});
 assert.deepEqual(branchDestinations(d,'s-start').map(s=>s.id),['s-setup','s-contact']);
 assert.deepEqual(branchDestinations(d,'s-contact').map(s=>s.id),['s-note']);
 assert.deepEqual(branchDestinations(d,'missing'),[]);
 const text=describeCondition(d.screens[1].showWhen,formFields(d));
 assert.match(text,/What services do you need.*contains.*Planning/);
 assert.match(text,/ and How many guests.*is at least.*50/);
 assert.equal(describeCondition(null,[]),'Always');
});
