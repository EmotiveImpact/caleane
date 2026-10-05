import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {Dashboard} from './src/components/Dashboard.jsx';",'dashboard-attention');
const {render,screen,cleanup,act,fireEvent}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

let visibility='visible';
Object.defineProperty(dom.window.document,'visibilityState',{configurable:true,get:()=>visibility});
const tasks=Array.from({length:12},(_,i)=>({id:'t'+i,title:'Call supplier '+i,dueDate:'2026-01-0'+(1+i%9),completed:false,clientName:'Sample client'}));
const props=request=>({user:{name:'Sophie'},projects:[],owner:true,studio:{id:'s1',slug:'s1',branding:{}},openProject(){},showProjects(){},request,openClient(){},openMail(){},openTasks(){},openCalendar(){}});
const flush=()=>act(async()=>{for(let i=0;i<5;i++)await Promise.resolve();});
const routes=calls=>calls.filter(path=>path.startsWith('/api/crm/tasks')).length;

test('needs your attention shows eight next steps with a show all control',async()=>{
 const request=async path=>path.startsWith('/api/crm/tasks')?{tasks}:path.startsWith('/api/clients')?{clients:[]}:{conversations:[]};
 render(h(ui.Dashboard,props(request)));
 await screen.findByText('12 next steps');
 assert.equal(document.querySelectorAll('.studio-day-action').length,8);
 fireEvent.click(screen.getByRole('button',{name:'Show all 12 next steps'}));
 assert.equal(document.querySelectorAll('.studio-day-action').length,12);
 assert.equal(screen.getByRole('button',{name:'Show fewer'}).getAttribute('aria-expanded'),'true');
});

test('next steps refresh every minute only while the tab is visible',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-10-05T09:00:00Z')});
 const calls=[];const request=async path=>{calls.push(path);return path.startsWith('/api/crm/tasks')?{tasks:[]}:path.startsWith('/api/clients')?{clients:[]}:{conversations:[]};};
 render(h(ui.Dashboard,props(request)));
 await flush();
 assert.equal(routes(calls),1);
 t.mock.timers.tick(20000);await flush();
 assert.equal(routes(calls),1);
 t.mock.timers.tick(40000);await flush();
 assert.equal(routes(calls),2);
 visibility='hidden';document.dispatchEvent(new dom.window.Event('visibilitychange'));
 t.mock.timers.tick(180000);await flush();
 assert.equal(routes(calls),2);
 visibility='visible';document.dispatchEvent(new dom.window.Event('visibilitychange'));await flush();
 assert.equal(routes(calls),3);
 cleanup();t.mock.timers.tick(120000);await flush();
 assert.equal(routes(calls),3);
});
