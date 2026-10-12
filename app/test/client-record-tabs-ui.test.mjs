import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {FolioCRM} from './src/components/FolioCRM.jsx'; export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';",'client-record-tabs');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const client={id:'c1',name:'Amelia Hart',email:'amelia@example.test',stage:'Active',tags:[],notes:[],createdAt:'2026-01-01T10:00:00.000Z',updatedAt:'2026-01-01T10:00:00.000Z'};
const request=async url=>url.startsWith('/api/clients?')?{clients:[client]}:url.startsWith('/api/conversations?')?{conversations:[]}:url.startsWith('/api/invoices?')?{invoices:[]}:{};

test('client record tabs have a panel and move with the arrow keys',async()=>{
 const input=userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
 render(h(ui.WorkspaceUIProvider,null,h(ui.FolioCRM,{studio:{id:'s1',branding:{}},user:{id:'u1',name:'Studio'},projects:[],request,run:async fn=>fn(),busy:false,openProject(){},clientId:'c1',onSelect(){},renderNewProject:()=>null,mode:'clients'})));
 await screen.findByRole('heading',{name:'Amelia Hart'});
 const tablist=screen.getByRole('tablist',{name:'Client record sections'}),overview=screen.getByRole('tab',{name:'Overview'});
 const panel=screen.getByRole('tabpanel');
 assert.equal(overview.getAttribute('aria-controls'),panel.id);
 assert.equal(panel.getAttribute('aria-labelledby'),overview.id);
 assert.equal(tablist.querySelectorAll('[tabindex="0"]').length,1,'only the open tab is in the Tab order');
 overview.focus();
 await input.keyboard('{ArrowRight}');
 assert.equal(document.activeElement,screen.getByRole('tab',{name:'People'}));
 await input.keyboard('{ArrowLeft}{ArrowLeft}');
 assert.equal(document.activeElement,screen.getByRole('tab',{name:'Notes'}),'the left arrow wraps to the last tab');
 await input.keyboard('{Home}');
 assert.equal(document.activeElement,overview);
 await input.keyboard('{End}{Enter}');
 const notes=screen.getByRole('tab',{name:'Notes'});
 assert.equal(notes.getAttribute('aria-selected'),'true');
 assert.equal(screen.getByRole('tabpanel').getAttribute('aria-labelledby'),notes.id);
});
