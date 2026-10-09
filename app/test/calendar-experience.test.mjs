import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=pipeline',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.calendar-experience-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/CalendarWorkspace.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {Calendar}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const stamp=new Date(), day=`${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,'0')}-${String(stamp.getDate()).padStart(2,'0')}`;
const label=new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const project={id:'p1',title:'Room styling',status:'Enquiry',brief:{name:'Amelia',date:day},tasks:[{id:'t1',title:'Prepare samples',due:day,completed:false},{id:'t2',title:'Completed task',due:day,completed:true}]};
const followUp={id:'c1',title:'Call Amelia',clientName:'Amelia',dueDate:day,completed:false};
function fixture({fail=false}={}){
 const opened=[];let reads=0;
 const request=async()=>{reads++;if(fail&&reads===1)throw Error('offline');return {tasks:[followUp]};};
 render(h(Calendar,{projects:[project,{...project,id:'archived',status:'Archived'}],studio:{id:'s1'},request,openProject:(p,tab)=>opened.push(['project',p.id,tab]),openTasks:id=>opened.push(['task',id])}));
 return {opened};
}

test('selecting a day opens a modal in context, groups its schedule and returns focus on close',async()=>{
 const input=user();fixture();const cell=await screen.findByRole('button',{name:label+', 3 scheduled items'});
 assert.equal(screen.queryByRole('dialog'),null);await input.click(cell);
 const dialog=await screen.findByRole('dialog',{name:label});assert.ok(within(dialog).getByRole('heading',{name:'Project dates'}));assert.ok(within(dialog).getByRole('heading',{name:'Tasks & follow-ups'}));assert.ok(within(dialog).getByText('Tentative · Enquiry'));
 assert.equal(screen.queryByText('Completed task'),null);await input.click(within(dialog).getByRole('button',{name:'Close',exact:true}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));await waitFor(()=>assert.equal(document.activeElement,cell));
});

test('calendar items route to the exact CRM task, project task or project brief',async()=>{
 const input=user(),{opened}=fixture();await screen.findByRole('button',{name:label+', 3 scheduled items'});
 for(const name of ['Call Amelia','Prepare samples','Room styling']){
  await input.click(screen.getByRole('button',{name:'Today',exact:true}));const dialog=await screen.findByRole('dialog');
  await input.click(within(dialog).getByRole('button',{name:(name==='Room styling'?'Open project brief: ':'Open task: ')+name}));await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
 }
 assert.deepEqual(opened,[['task','crm:c1'],['task','project:p1:t1'],['project','p1','Brief']]);
});

test('filters apply to both month and day; day browsing crosses month boundaries without closing',async()=>{
 const input=user();fixture();await screen.findByRole('button',{name:label+', 3 scheduled items'});await input.click(screen.getByRole('button',{name:'Projects',exact:true}));
 await input.click(screen.getByRole('button',{name:label+', 1 scheduled item'}));const dialog=await screen.findByRole('dialog');assert.equal(within(dialog).queryByRole('heading',{name:'Tasks & follow-ups'}),null);
 await input.click(within(dialog).getByRole('button',{name:'Close',exact:true}));await screen.findByRole('button',{name:'Next month',exact:true});await input.click(screen.getByRole('button',{name:'Next month',exact:true}));
 await input.click(screen.getByRole('button',{name:/^Day details for /}));const nextFirst=new Date(stamp.getFullYear(),stamp.getMonth()+1,1);const nextLabel=nextFirst.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 assert.ok(await screen.findByRole('dialog',{name:nextLabel}));await input.click(screen.getByRole('button',{name:'Previous day',exact:true}));
 const previous=new Date(nextFirst);previous.setDate(0);assert.ok(await screen.findByRole('dialog',{name:previous.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}));assert.ok(screen.getByText('A clear day.'));
 await input.click(screen.getByRole('button',{name:'Close',exact:true}));assert.ok(screen.getByRole('heading',{name:stamp.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}));
});

test('failed follow-up loading stays visible and can be retried without hiding project dates',async()=>{
 const input=user();fixture({fail:true});await screen.findByRole('alert');assert.ok(screen.getByRole('button',{name:label+', 2 scheduled items'}));await input.click(screen.getByRole('button',{name:'Today',exact:true}));
 assert.ok(await screen.findByRole('alert'));await input.click(screen.getByRole('button',{name:'Retry follow-ups',exact:true}));await waitFor(()=>assert.equal(screen.queryByRole('alert'),null));assert.ok(screen.getByRole('button',{name:'Open task: Call Amelia',exact:true}));assert.ok(screen.getByRole('button',{name:'Open project brief: Room styling',exact:true}));assert.ok(screen.getByRole('dialog',{name:label}));
});
