import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';

// Synthetic DOM tests exercise the controls themselves, without the app server or user data.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType=props.pointerType||'mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};

const compiled=fileURLToPath(new URL(`.form-editor-${process.pid}.mjs`,import.meta.url));
const output=await build({stdin:{contents:"export {FormImagePosition} from './FormImagePosition.jsx'; export {FormScreenEditor} from './FormScreenEditor.jsx'; export {FormsWorkspace} from './FormsWorkspace.jsx';",resolveDir:fileURLToPath(new URL('../src/components/',import.meta.url)),loader:'jsx'},bundle:true,packages:'external',format:'esm',platform:'node',write:false});
await writeFile(compiled,output.outputFiles[0].text);
const ui=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,fireEvent}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
const mount=content=>render(content);
const user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await unlink(compiled);dom.window.close();});


const base={profession:'events',projectTypes:['Wedding'],fields:{},questions:[{id:'q-setting',label:'Where is the event?',type:'choice',options:['Inside','Outside'],required:false}],screens:[
 {id:'s-project',title:'Project',kind:'questions',mode:'single',fields:['core:occasion','core:vision'],layout:'center',columns:1,description:'',imageUrl:'',imageAlt:'',buttonLabel:'',jumps:[],showWhen:null},
 {id:'s-setting',title:'Setting',kind:'questions',mode:'single',fields:['q-setting'],layout:'center',columns:1,description:'',imageUrl:'',imageAlt:'',buttonLabel:'',jumps:[],showWhen:null},
 {id:'s-contact',title:'Contact',kind:'questions',mode:'group',fields:['core:name','core:email'],layout:'center',columns:1,description:'',imageUrl:'',imageAlt:'',buttonLabel:'',jumps:[],showWhen:null}
]};
let last;
function Fixture(){const [definition,setDefinition]=React.useState(structuredClone(base)),[selected,setSelected]=React.useState('s-setting');last=definition;return h(ui.FormScreenEditor,{definition,onChange:setDefinition,selectedId:selected,onSelect:setSelected});}

test('selected question edits preserve its identity and do not change another screen',async()=>{
 const input=user();mount(h(Fixture));
 assert.equal(screen.getByRole('tab',{name:'Content'}).getAttribute('data-state'),'active');
 await input.clear(screen.getByRole('textbox',{name:'Question text'}));
 await input.type(screen.getByRole('textbox',{name:'Question text'}),'Indoor or outdoor?');
 assert.equal(last.questions[0].id,'q-setting');assert.equal(last.questions[0].label,'Indoor or outdoor?');
 assert.deepEqual(last.screens[0],base.screens[0]);
 await input.click(screen.getByRole('button',{name:/01\s*Project/}));
 await input.click(screen.getByText('Screen settings',{exact:true}));
 assert.equal(screen.getByRole('textbox',{name:'Screen title'}).value,'Project');
});

test('adding a question screen creates one usable field and selects its content',async()=>{
 const input=user();mount(h(Fixture));
 await input.click(screen.getByRole('button',{name:'Add screen'}));
 await input.click(await screen.findByRole('menuitem',{name:'Question screen'}));
 assert.equal(last.questions.length,2);assert.equal(last.screens.length,4);
 const created=last.screens[2];assert.equal(created.mode,'single');assert.equal(created.fields[0],last.questions[1].id);
 assert.equal(screen.getByRole('textbox',{name:'Question text'}).value,'New question');
 assert.equal(last.screens[3].id,'s-contact');
});

test('logic is local to the selected screen and a removable rule preserves fallback',async()=>{
 const input=user();mount(h(Fixture));
 await input.click(screen.getByRole('tab',{name:'Logic'}));
 assert.ok(screen.getByText('Continue to'));assert.ok(screen.getAllByText('Contact',{exact:true}).length);
 await input.click(screen.getByRole('button',{name:'Add a rule'}));
 assert.equal(last.screens[1].jumps.length,1);assert.equal(last.screens[1].jumps[0].to,'s-contact');
 assert.equal(last.screens[1].jumps[0].when.rules[0].field,'q-setting');
 assert.ok(await screen.findByRole('combobox',{name:'Then go to (rule 1)'}));
 await input.click(screen.getByRole('button',{name:'Delete rule 1'}));
 assert.deepEqual(last.screens[1].jumps,[]);assert.ok(screen.getByText('Continue to'));
});


test('saving a draft preserves edits made while the request is in flight',async()=>{
 const input=user();const definition={...structuredClone(base),name:'Studio form',title:'Welcome',description:'',accent:'#334f59',theme:{font:'sans',background:'white',radius:'soft'},layout:'steps'};
 const stored={id:'form-test',slug:'test',definition,status:'published',publishedVersion:1,revision:1,hasUnpublishedChanges:false,responseCount:0,updatedAt:'2026-10-01T10:00:00Z'};
 let finishSave;
 const request=async(path,method,body)=>{if(!method)return {forms:[stored]};return new Promise(resolve=>{finishSave=()=>resolve({form:{...stored,definition:body.definition,revision:2,hasUnpublishedChanges:true}});});};
 render(h(ui.FormsWorkspace,{studio:{id:'test',slug:'test',name:'Test studio'},request,projects:[]}));
 await input.click(await screen.findByRole('button',{name:/Studio form \/intake/}));
 assert.equal(screen.getByRole('button',{name:'Publish changes'}).disabled,true);
 await input.click(screen.getByRole('button',{name:/02\s*Setting/}));
 await input.clear(screen.getByRole('textbox',{name:'Question text'}));await input.type(screen.getByRole('textbox',{name:'Question text'}),'Saved wording');
 await input.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>assert.ok(finishSave));
 await input.type(screen.getByRole('textbox',{name:'Question text'}),' plus a newer edit');finishSave();
 await waitFor(()=>assert.ok(screen.getByText('Draft saved. Publish when it is ready.')));
 assert.equal(screen.getByRole('textbox',{name:'Question text'}).value,'Saved wording plus a newer edit');
 assert.equal(screen.getByRole('button',{name:'Save draft'}).disabled,false);
});


test('image focal point supports pointer positioning, keyboard adjustment and reset',async()=>{
 const input=user();let position;
 function ImageFixture(){const [value,setValue]=React.useState('top');position=value;return h(ui.FormImagePosition,{src:'/test-image.jpg',value,onChange:setValue});}
 render(h(ImageFixture));const canvas=screen.getByRole('button',{name:'Position image focal point'});
 canvas.getBoundingClientRect=()=>({left:10,top:20,width:200,height:100});
 fireEvent.pointerDown(canvas,{button:0,pointerId:1,clientX:60,clientY:95});assert.equal(position,'25% 75%');
 canvas.hasPointerCapture=()=>true;fireEvent.pointerMove(canvas,{pointerId:1,clientX:500,clientY:-20});assert.equal(position,'100% 0%');
 fireEvent.pointerMove(canvas,{pointerId:1,clientX:60,clientY:95});assert.equal(position,'25% 75%');canvas.hasPointerCapture=()=>false;
 await input.click(screen.getByRole('slider',{name:'Horizontal image position'}));
 canvas.focus();await input.keyboard('[ArrowRight]');assert.equal(position,'26% 75%');
 await input.keyboard('{Shift>}[ArrowUp]{/Shift}');assert.equal(position,'26% 65%');
 fireEvent.change(screen.getByRole('slider',{name:'Vertical image position'}),{target:{value:'100'}});assert.equal(position,'26% 100%');
 await input.click(screen.getByRole('button',{name:'Reset',exact:true}));assert.equal(position,'center');assert.equal(screen.getByRole('button',{name:'Reset',exact:true}).disabled,true);
});
