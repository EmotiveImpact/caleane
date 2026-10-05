import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {ClientDirectory} from './src/components/ClientDirectory.jsx'; export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';",'client-directory');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const clients=Array.from({length:120},(_,i)=>({id:'c'+i,name:'Client '+String(i).padStart(3,'0'),email:`c${i}@example.test`,stage:'Active',createdAt:'2025-01-01T10:00:00.000Z'}));
clients.push({id:'zed',name:'Aaron Zed',email:'aaron@example.test',stage:'Active',createdAt:'2024-01-01T10:00:00.000Z'});
const projects=[{id:'p1',clientId:'c42',title:'Recent project',status:'Active',activity:[{text:'Sent the proposal',at:'2026-09-30T10:00:00.000Z',actor:'Studio'}]}];
const rows=()=>screen.getAllByRole('button').filter(b=>b.classList.contains('studio-client-row'));

test('clients sort by activity or name, page in fifties and open on a single click',async()=>{
 const input=user(),opened=[];
 render(h(ui.WorkspaceUIProvider,null,h(ui.ClientDirectory,{clients,projects,studio:{id:'s1',branding:{}},loading:false,error:'',onSelect:c=>opened.push(c.id),onAdd(){},openProject(){}})));
 assert.equal(rows().length,50);
 assert.match(rows()[0].textContent,/Client 042/);
 assert.ok(screen.getByText('Showing 50 of 121 clients'));
 await input.click(screen.getByRole('button',{name:'Show 50 more'}));
 assert.equal(rows().length,100);
 await input.click(screen.getByRole('button',{name:'Show 21 more'}));
 assert.equal(rows().length,121);
 assert.equal(screen.queryByText(/Showing \d+ of/),null);
 await input.click(screen.getByRole('combobox',{name:'Sort clients'}));
 await input.click(await screen.findByRole('option',{name:'Name A to Z'}));
 assert.equal(rows().length,50);
 assert.match(rows()[0].textContent,/Aaron Zed/);
 await input.hover(rows()[3]);
 assert.match(within(document.querySelector('.studio-client-preview')).getByRole('heading',{level:2}).textContent,/Client 002/);
 await input.click(rows()[1]);
 assert.deepEqual(opened,['c0']);
});
