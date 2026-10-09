import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';

// Exercise draft/save behaviour without touching the user's workspace database.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=settings',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.matchMedia=dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.task-create-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/TaskWorkspace.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);
const {TaskWorkspace}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
const user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>{cleanup();history.replaceState(null,'','/?view=settings');});
after(async()=>{await unlink(compiled);dom.window.close();});
const studio={id:'studio-test',name:'Test studio',branding:{profession:'events'}};
const project={id:'project-test',title:'Sample project',workflowType:'events',coverUrl:'',brief:{name:'Sample client',occasion:'Wedding'},tasks:[]};
const client={id:'client-test',name:'Sample client'};
function fixture({fail=false}={}){
 const writes=[];
 const request=async(path,method,body)=>{
  if(method==='POST'){
   writes.push({path,body});if(fail)throw new Error('Could not create task. Try again.');
   if(path.startsWith('/api/projects/'))return {project:{...project,tasks:[{id:'new-project-task',...body,due:body.due||'',completed:false}]}};
   return {task:{id:'new-crm-task',...body,clientName:client.name,completed:false}};
  }
  if(path.startsWith('/api/task-workspace/project/')||path.startsWith('/api/task-workspace/crm/'))return {assigneeName:'',canAssign:false,canContribute:false,comments:[],files:[]};
  if(path.startsWith('/api/crm/tasks'))return {tasks:[]};
  if(path.startsWith('/api/clients'))return {clients:[client]};
  if(path.startsWith('/api/opportunities'))return {opportunities:[]};
  if(path.startsWith('/api/task-workspace'))return {assignments:{}};
  throw new Error('Unexpected request: '+path);
 };
 function Fixture(){const [projects,setProjects]=React.useState([project]);return h(TaskWorkspace,{studio,projects,request,onProjectUpdate:p=>setProjects([p]),openProject(){},openClient(){},openOpportunity(){}});}
 render(h(Fixture));return writes;
}

test('new project task is created from a filtered view and shown in All tasks',async()=>{
 const input=user(),writes=fixture();await screen.findByText('Nothing in this view');
 await input.click(screen.getByRole('radio',{name:'Completed',exact:true}));
 await input.click(screen.getByRole('button',{name:'New task',exact:true}));
 screen.getByRole('dialog',{name:'New task'});
 await input.type(screen.getByRole('textbox',{name:'Task',exact:true}),'Confirm the venue');
 await input.selectOptions(screen.getByRole('combobox',{name:'Responsible'}),'client');
 await input.click(screen.getByRole('button',{name:'Create task'}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
 assert.equal(writes[0].path,'/api/projects/project-test/tasks?studio=studio-test');assert.equal(writes[0].body.assignee,'client');
 assert.equal(screen.getByRole('radio',{name:'All tasks',exact:true}).getAttribute('aria-checked'),'true');
 assert.ok(screen.getByRole('button',{name:'Confirm the venue',exact:true}));assert.ok(screen.getByLabelText('Task details'));
});

test('private follow-up uses the client route and exposes its privacy in the details',async()=>{
 const input=user(),writes=fixture();await screen.findByText('Nothing in this view');
 await input.click(screen.getByRole('button',{name:'New task',exact:true}));
 await input.selectOptions(screen.getByRole('combobox',{name:'Belongs to'}),'client:client-test');
 await input.type(screen.getByRole('textbox',{name:'Task',exact:true}),'Follow up with client');
 await input.selectOptions(screen.getByRole('combobox',{name:'Priority'}),'High');
 await input.click(screen.getByRole('button',{name:'Create task'}));await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
 assert.equal(writes[0].path,'/api/crm/tasks?studio=studio-test');assert.equal(writes[0].body.clientId,'client-test');assert.equal(writes[0].body.priority,'High');
 assert.ok(screen.getByText('This follow-up is private to your studio.'));assert.ok(screen.getByRole('button',{name:'Follow up with client',exact:true}));
});

test('failed creation leaves the form and draft available for retry',async()=>{
 const input=user();fixture({fail:true});await screen.findByText('Nothing in this view');
 await input.click(screen.getByRole('button',{name:'New task',exact:true}));
 await input.type(screen.getByRole('textbox',{name:'Task',exact:true}),'Keep this draft');await input.click(screen.getByRole('button',{name:'Create task'}));
 await waitFor(()=>assert.ok(screen.getByRole('dialog').textContent.includes('Could not create task. Try again.')));
 assert.equal(screen.getByRole('textbox',{name:'Task',exact:true}).value,'Keep this draft');assert.equal(screen.getByRole('button',{name:'Create task'}).disabled,false);
 await input.keyboard('[Escape]');assert.equal(screen.queryByRole('dialog'),null);
});
