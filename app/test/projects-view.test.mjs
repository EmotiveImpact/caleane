import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('a project the studio creates starts in planning, and sample briefs credit their own client',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'projects-view-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let cookie='';
 async function call(route,method='GET',body){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json().catch(()=>null)};}
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id;
  const created=await call('/api/projects?studio='+studio,'POST',{name:'Grace Okafor',email:'grace@example.test',occasion:'Garden party',date:'2027-07-01',venue:'',vision:''});
  assert.equal(created.status,201);
  assert.equal(created.data.project.status,'Planning');
  assert.equal(created.data.project.activity[0].text,'Created the project');
  assert.equal(created.data.project.activity[0].actor,'NAY Studio');
  const samples=(await call('/api/projects?studio='+studio)).data.projects.filter(p=>p.demo);
  for(const p of samples)assert.equal(p.activity.at(-1).actor,p.brief.name);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=projects',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
const compiled=fileURLToPath(new URL(`.projects-view-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/StudioViews.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);
const {StudioProjects,defaultProjectsView,attentionAction}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,fireEvent}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await unlink(compiled);dom.window.close();});

const studio={id:'studio-test',name:'Test studio'};
const project=(id,title,status)=>({id,title,status,briefRevision:1,brief:{name:'Client '+id,occasion:'Party'},clientEmail:id+'@example.test',designs:[],inspiration:[],changeRequests:[],tasks:[],updatedAt:'2026-10-01T12:00:00Z'});
const projects=[project('a','Active planning','Planning'),project('b','New enquiry','Enquiry'),project('c','Finished work','Complete'),project('d','Old work','Archived')];

test('the projects list keeps its tab, search and layout in the parent so they survive opening a project',()=>{
 let view={...defaultProjectsView};
 const props={projects,studio,owner:true,openProject(){},createAction:null,board:()=>h('p',null,'board')};
 const {unmount}=render(h(StudioProjects,{...props,view,onViewChange:next=>{view=next;}}));
 fireEvent.click(screen.getByRole('button',{name:/^Enquiries/}));
 assert.equal(view.group,'Enquiries');
 unmount();
 render(h(StudioProjects,{...props,view,onViewChange:next=>{view=next;}}));
 assert.equal(screen.getByRole('button',{name:/^Enquiries/}).getAttribute('aria-pressed'),'true');
 assert.ok(screen.getAllByText('New enquiry').length);
 assert.equal(screen.queryByText('Active planning'),null);
});

test('the delivery board shows every stage except archived, whichever tab was open',()=>{
 let shown=[];
 render(h(StudioProjects,{projects,studio,owner:true,openProject(){},view:{...defaultProjectsView,group:'Enquiries',mode:'board'},onViewChange(){},board:list=>{shown=list.map(p=>p.id);return null;}}));
 assert.deepEqual(shown,['a','b','c']);
 assert.equal(screen.queryByRole('group',{name:'Project status'}),null);
});

test('attention buttons name what they open',()=>{
 assert.equal(attentionAction({tab:'Decisions',kind:'choice-1'}),'choice');
 assert.equal(attentionAction({tab:'Conversation',kind:'message'}),'messages');
 assert.equal(attentionAction({tab:'Plan',kind:'task-1'}),'task');
 assert.equal(attentionAction({tab:'Somewhere',kind:'other'}),'details');
});
