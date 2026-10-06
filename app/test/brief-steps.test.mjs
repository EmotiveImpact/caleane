import test from 'node:test';
import assert from 'node:assert/strict';
import {briefSteps,chaptersOf,logicGraph,routeSentences,usesBriefLook} from '../src/lib/brief-steps.js';

const screen=(id,fields,title,extra={})=>({id,fields,title,kind:'questions',mode:'single',layout:'center',columns:1,jumps:[],showWhen:null,...extra});
const definition={name:'Test',title:'Start',profession:'events',layout:'steps',fields:{},projectTypes:['Wedding','Dinner'],questions:[{id:'q-setting',label:'Where?',type:'choice',required:true,options:['Inside','Outside']},{id:'q-cover',label:'Which cover?',type:'multi',required:false,options:['Tent','Canopy']}],screens:[screen('s-project',['core:occasion','core:vision'],'Project',{mode:'group'}),screen('s-setting',['q-setting'],'Where?',{chapter:'The setting'}),screen('s-cover',['q-cover'],'Which cover?',{showWhen:{match:'all',rules:[{field:'q-setting',operator:'eq',value:'Outside'}]}}),screen('s-contact',['core:name','core:email'],'Contact',{mode:'group'})]};

test('each question becomes a step, grouped into chapters, and a branch adds its step',()=>{
 const inside=briefSteps(definition,{},{'q-setting':'Inside'}).steps;
 assert.deepEqual(chaptersOf(inside).map(c=>[c.name,c.steps.length]),[['Your project',2],['The setting',1],['About you',2]]);
 const outside=briefSteps(definition,{},{'q-setting':'Outside'}).steps;
 assert.equal(outside.length,inside.length+1);assert.equal(outside.find(s=>s.field.id==='q-cover').chapter,'The setting');
 assert.equal(briefSteps(definition,{name:'Ama Mensah'},{}).steps.find(s=>s.field.id==='core:email').title,'Thanks, Ama. Where can we reach you?');
});
test('the logic map finds screens no one can reach and describes rules in plain words',()=>{
 assert.deepEqual(logicGraph(definition).issues,[]);
 // A required answer is always given, so this rule always skips the cover screen.
 const blocked={...definition,screens:definition.screens.map(s=>s.id==='s-setting'?{...s,jumps:[{to:'s-contact',when:{match:'all',rules:[{field:'q-setting',operator:'answered'}]}}]}:s)};
 const {issues,edges}=logicGraph(blocked);
 assert.equal(issues.length,1);assert.match(issues[0].text,/Which cover\?/);assert.equal(edges.some(e=>e.from==='s-setting'&&e.kind==='next'),false);
 assert.deepEqual(routeSentences(definition).map(r=>r.kind),['only']);
});
test('only step forms use the brief look',()=>{
 assert.equal(usesBriefLook(definition),true);assert.equal(usesBriefLook({...definition,layout:'page'}),false);assert.equal(usesBriefLook({...definition,theme:{look:'classic'}}),false);
});
