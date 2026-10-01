import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';

// Synthetic DOM tests exercise the controls themselves, without the app server or user data.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType=props.pointerType||'mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};

const compiled=fileURLToPath(new URL(`.form-editor-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/FormScreenEditor.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false});
await writeFile(compiled,output.outputFiles[0].text);
const ui=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor}=await import('@testing-library/react');
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
