import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';
import {createWorkspace} from '../server.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {WorkspaceSearch} from './src/components/WorkspaceSearch.jsx';",'workspace-search-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const many=Array.from({length:12},(_,i)=>({type:'task',id:'t'+i,title:'Lantern task '+(i+1),subtitle:'Sample',meta:'To do'}));
const response={total:14,groups:[{label:'Contacts',items:[{type:'contact',id:'ct1',clientId:'cl1',title:'Lantern Ward',subtitle:'Sample client',meta:'Contact'}],total:1},{label:'References',items:[{type:'reference',id:'reference:p1:r1',projectId:'p1',title:'Lantern glow',subtitle:'Spring',meta:'Lighting'}],total:1},{label:'Tasks',items:many,total:12}]};

test('search results form a listbox with an active descendant and a show all option',async()=>{
 const input=user(),opened=[];
 render(h(ui.WorkspaceSearch,{studio:{id:'s1'},section:'overview',request:async()=>response,onOpenResult:item=>opened.push(item)}));
 await input.click(screen.getByRole('button',{name:'Search workspace'}));
 const box=screen.getByRole('combobox',{name:'Search workspace records'});
 await input.type(box,'lantern');
 const list=await screen.findByRole('listbox',{name:'Search results'});
 assert.equal(box.getAttribute('aria-controls'),list.id);
 assert.equal((await screen.findAllByRole('option')).length,10);
 assert.equal(box.getAttribute('aria-activedescendant'),screen.getAllByRole('option')[0].id);
 assert.equal(screen.getAllByRole('option')[0].getAttribute('aria-selected'),'true');
 let scrolled=null;const original=dom.window.Element.prototype.scrollIntoView;dom.window.Element.prototype.scrollIntoView=function(){scrolled=this;};
 await input.keyboard('{ArrowDown}');
 const second=screen.getAllByRole('option')[1];
 assert.equal(box.getAttribute('aria-activedescendant'),second.id);
 assert.equal(scrolled,second);dom.window.Element.prototype.scrollIntoView=original;
 assert.match(screen.getByText(/Showing 10 of 14 matches/).textContent,/Showing 10 of 14/);
 await input.click(screen.getByRole('button',{name:'Show all results'}));
 assert.equal(screen.getAllByRole('option').length,14);
 assert.equal(document.activeElement,box);
 assert.equal(screen.queryByRole('button',{name:'Show all results'}),null);
 await input.keyboard('{ArrowUp}{Enter}');
 assert.deepEqual(opened.map(item=>[item.type,item.id]),[['client','cl1']]);
});

test('references open their project and the server returns contacts, references and up to 50 per group',async()=>{
 const input=user(),opened=[];
 render(h(ui.WorkspaceSearch,{studio:{id:'s1'},section:'overview',request:async()=>response,onOpenResult:item=>opened.push(item)}));
 await input.click(screen.getByRole('button',{name:'Search workspace'}));
 await input.type(screen.getByRole('combobox'),'lantern');
 await input.click(await screen.findByRole('option',{name:/Lantern glow/}));
 assert.deepEqual([opened[0].type,opened[0].id],['project','p1']);

 const origin='http://127.0.0.1:4321',dir=await mkdtemp(path.join(os.tmpdir(),'caleane-search-ui-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const call=async(route,method='GET',body)=>{const res=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:res.status,data:await res.json()};};
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const created=await call('/api/projects'+q,'POST',{name:'Quill Harrow',email:'quill@example.test',occasion:'Harbour exhibition',vision:'Gallery work'});
  const project=created.data.project;
  assert.equal((await call(`/api/projects/${project.id}/inspiration`+q,'POST',{title:'Brass lanterns on the quay',note:'Low warm light',category:'Lighting'})).status<300,true);
  const clients=(await call('/api/clients'+q)).data.clients;
  const client=clients.find(c=>c.email==='quill@example.test')||clients[0];
  assert.ok((await call(`/api/clients/${client.id}/contacts`+q,'POST',{name:'Wren Fairlight',email:'wren@example.test',phone:''})).status<300);
  for(let i=0;i<12;i++)await call(`/api/projects/${project.id}/tasks`+q,'POST',{title:'Harbour signage check '+i,assignee:'studio',due:'2026-11-10'});
  let result=(await call('/api/search'+q+'&q=fairlight')).data;
  assert.ok(result.groups.find(g=>g.label==='Contacts')?.items.some(item=>item.title==='Wren Fairlight'&&item.clientId===client.id));
  result=(await call('/api/search'+q+'&q=fairlight&scope=clients')).data;
  assert.ok(result.groups.some(g=>g.label==='Contacts'));
  result=(await call('/api/search'+q+'&q=brass%20lanterns&scope=projects')).data;
  assert.ok(result.groups.find(g=>g.label==='References')?.items.some(item=>item.projectId===project.id&&item.meta==='Lighting'));
  result=(await call('/api/search'+q+'&q=harbour%20signage&scope=tasks')).data;
  assert.equal(result.groups[0].items.length,12);assert.equal(result.total,12);assert.equal(result.limit,50);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
