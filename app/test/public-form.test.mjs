import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Node','Event','KeyboardEvent','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const compiled=fileURLToPath(new URL(`.public-form-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/PublicForm.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false});
await writeFile(compiled,output.outputFiles[0].text);
const {PublicForm,HostedForm,usesBriefLook}=await import(pathToFileURL(compiled));
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const h=React.createElement;
const makeScreen=(id,fields,title,extra={})=>({id,fields,title,kind:'questions',mode:'single',layout:'center',columns:1,jumps:[],showWhen:null,...extra});
const definition={name:'Test form',title:'Start here',profession:'events',layout:'steps',accent:'#334f59',fields:{},projectTypes:['Wedding','Dinner'],questions:[{id:'q-setting',label:'Where?',type:'choice',required:true,options:['Inside','Outside']},{id:'q-cover',label:'Which cover?',type:'multi',required:true,options:['Tent','Canopy']}],screens:[makeScreen('s-project',['core:occasion'],'Project type'),makeScreen('s-setting',['q-setting'],'Where?'),makeScreen('s-cover',['q-cover'],'Which cover?',{showWhen:{match:'all',rules:[{field:'q-setting',operator:'eq',value:'Outside'}]}}),makeScreen('s-contact',['core:name','core:email'],'Contact'),makeScreen('s-idea',['core:vision'],'Your idea')],submitLabel:'Send brief',successTitle:'Thank you',successMessage:'Preview completed.'};
// The classic look keeps several questions on a screen with a review step.
const props={studio:{slug:'test',name:'Test studio'},form:{slug:'test',definition:{...definition,theme:{look:'classic'}}},preview:true};
const briefProps={studio:{slug:'test',name:'Test studio'},form:{slug:'test',definition},preview:true};
async function reachReview(input,setting='Inside'){
 await input.click(screen.getByRole('radio',{name:'Wedding'}));await input.click(screen.getByRole('button',{name:'Continue'}));
 await input.click(screen.getByRole('radio',{name:setting}));await input.click(screen.getByRole('button',{name:'Continue'}));
 if(setting==='Outside'){await input.click(screen.getByRole('checkbox',{name:'Tent'}));await input.click(screen.getByRole('button',{name:'Continue'}));}
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Sample Client');await input.type(screen.getByRole('textbox',{name:'Email'}),'sample@example.com');await input.click(screen.getByRole('button',{name:'Continue'}));await input.click(screen.getByRole('button',{name:'Continue'}));
}
test('choice cards require an answer and work with the keyboard',async()=>{
 const input=userEvent.setup();render(h(PublicForm,props));
 await input.click(screen.getByRole('button',{name:'Continue'}));assert.match(screen.getByRole('alert').textContent,/Please answer/);assert.equal(document.activeElement,screen.getByRole('radio',{name:'Wedding'}));
 await input.keyboard('[Space][ArrowDown]');assert.equal(screen.getByRole('radio',{name:'Dinner'}).checked,true);
 await input.click(screen.getByRole('button',{name:'Continue'}));assert.ok(screen.getByRole('heading',{name:'Where?'}));
});
test('review edits preserve other answers and return directly when the route is unchanged',async()=>{
 const input=userEvent.setup();render(h(PublicForm,props));await reachReview(input);
 await input.click(screen.getByRole('button',{name:'Edit Your name'}));assert.equal(document.activeElement,screen.getByRole('textbox',{name:'Your name'}));
 await input.clear(screen.getByRole('textbox',{name:'Your name'}));await input.type(screen.getByRole('textbox',{name:'Your name'}),'Updated Client');
 assert.equal(screen.getByRole('textbox',{name:'Email'}).value,'sample@example.com');await input.click(screen.getByRole('button',{name:'Back to review'}));
 assert.ok(screen.getByText('Updated Client'));assert.ok(screen.getByText('sample@example.com'));assert.ok(screen.getByText('Not provided'));
 await input.click(screen.getByRole('button',{name:'Send brief'}));assert.ok(screen.getByRole('heading',{name:'Thank you'}));
});
test('editing a branch exposes new required questions and clears newly hidden answers',async()=>{
 const input=userEvent.setup();render(h(PublicForm,props));await reachReview(input);
 await input.click(screen.getByRole('button',{name:'Edit Where?'}));await input.click(screen.getByRole('radio',{name:'Outside'}));await input.click(screen.getByRole('button',{name:'Continue'}));
 assert.ok(screen.getByRole('heading',{name:'Which cover?'}));await input.click(screen.getByRole('button',{name:'Continue'}));assert.match(screen.getByRole('alert').textContent,/Choose at least one/);assert.equal(document.activeElement,screen.getByRole('checkbox',{name:'Tent'}));
 await input.click(screen.getByRole('checkbox',{name:'Tent'}));await input.click(screen.getByRole('button',{name:'Continue'}));await input.click(screen.getByRole('button',{name:'Continue'}));await input.click(screen.getByRole('button',{name:'Continue'}));
 assert.ok(screen.getByText('Tent'));await input.click(screen.getByRole('button',{name:'Edit Where?'}));await input.click(screen.getByRole('radio',{name:'Inside'}));await input.click(screen.getByRole('button',{name:'Continue'}));await input.click(screen.getByRole('button',{name:'Continue'}));await input.click(screen.getByRole('button',{name:'Continue'}));
 assert.equal(screen.queryByText('Tent'),null);assert.equal(screen.queryByRole('button',{name:'Edit Which cover?'}),null);
 // Returning to the branch must not restore the discarded response.
 await input.click(screen.getByRole('button',{name:'Edit Where?'}));await input.click(screen.getByRole('radio',{name:'Outside'}));await input.click(screen.getByRole('button',{name:'Continue'}));assert.equal(screen.getByRole('checkbox',{name:'Tent'}).checked,false);
});
test('inspecting another screen does not steal focus from editor navigation',async()=>{
 const input=userEvent.setup();function Fixture(){const [id,setId]=React.useState('s-project');return h(React.Fragment,null,h('button',{onClick:()=>setId('s-setting')},'Select screen'),h(PublicForm,{...briefProps,startScreenId:id}));}
 render(h(Fixture));const button=screen.getByRole('button',{name:'Select screen'});await input.click(button);assert.equal(document.activeElement,button);assert.ok(screen.getByRole('heading',{name:'Where?'}));
});

test('new forms use the brief look, and a single page form stays classic',()=>{
 assert.equal(usesBriefLook(definition),true);assert.equal(usesBriefLook({...definition,theme:{look:'classic'}}),false);assert.equal(usesBriefLook({...definition,layout:'page'}),false);
});
test('the brief look asks one question at a time and fills in the brief beside it',async()=>{
 const input=userEvent.setup();render(h(PublicForm,briefProps));
 assert.ok(screen.getByRole('heading',{name:'Start here'}));await input.click(screen.getByRole('button',{name:/Start your brief/}));
 assert.ok(screen.getByRole('heading',{name:'What are we creating?'}));await input.click(screen.getByRole('button',{name:/Continue/}));assert.match(screen.getByRole('alert').textContent,/Choose one/);
 await input.click(screen.getByRole('radio',{name:'Wedding'}));await input.click(screen.getByRole('button',{name:/Continue/}));
 assert.ok(screen.getByRole('heading',{name:'Where?'}));
 const brief=screen.getByRole('complementary',{name:'Your brief'});assert.match(brief.textContent,/Wedding/);assert.match(brief.textContent,/Not answered yet/);
 // A shown branch adds its question, and choosing the other way removes it and its answer.
 await input.click(screen.getByRole('radio',{name:'Outside'}));await input.click(screen.getByRole('button',{name:/Continue/}));
 assert.ok(screen.getByRole('heading',{name:'Which cover?'}));await input.click(screen.getByRole('checkbox',{name:'Tent'}));assert.match(brief.textContent,/Tent/);
 await input.click(screen.getByRole('button',{name:/Where\?/}));await input.click(screen.getByRole('radio',{name:'Inside'}));
 assert.doesNotMatch(screen.getByRole('complementary',{name:'Your brief'}).textContent,/Tent|Which cover/);
});
test('the brief look checks emails and ends with the brief as sent',async()=>{
 const input=userEvent.setup();render(h(PublicForm,briefProps));
 await input.click(screen.getByRole('button',{name:/Start your brief/}));
 await input.click(screen.getByRole('radio',{name:'Dinner'}));await input.click(screen.getByRole('button',{name:/Continue/}));
 await input.click(screen.getByRole('radio',{name:'Inside'}));await input.click(screen.getByRole('button',{name:/Continue/}));
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Ama Mensah');await input.click(screen.getByRole('button',{name:/Continue/}));
 assert.ok(screen.getByRole('heading',{name:'Thanks, Ama. Where can we reach you?'}));
 await input.type(screen.getByRole('textbox',{name:'Email'}),'ama@example');await input.click(screen.getByRole('button',{name:/Continue/}));assert.match(screen.getByRole('alert').textContent,/looks incomplete/);
 await input.type(screen.getByRole('textbox',{name:'Email'}),'.com');await input.click(screen.getByRole('button',{name:/Continue/}));
 await input.type(screen.getByRole('textbox',{name:/idea/i}),'Supper by candlelight');await input.click(screen.getByRole('button',{name:/Send brief/}));
 assert.ok(screen.getByRole('heading',{name:'Thank you'}));for(const text of ['Dinner','Inside','Ama Mensah','ama@example.com','Supper by candlelight'])assert.ok(screen.getByText(text));
});

test('a hosted form that gets an error page shows a plain sentence, never “Unexpected token <”',async()=>{
 const realFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('<!doctype html><h1>Bad gateway</h1>',{status:502});
 try{
  render(React.createElement(HostedForm,{slug:'nay-decor'}));
  assert.ok(await screen.findByText('Caleane could not reach the server. Please try again.'));
  assert.equal(screen.queryByText(/Unexpected token/),null);
 }finally{globalThis.fetch=realFetch;}
});
