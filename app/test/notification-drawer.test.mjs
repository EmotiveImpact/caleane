import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
import {notificationDestination,notificationAge} from '../src/lib/notifications.js';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=overview',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.notification-drawer-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/NotificationDrawer.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {NotificationDrawer}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});

test('notification destinations follow each role and never send clients to studio-only pages',()=>{
 const enquiry={kind:'enquiry',projectId:'p1',clientId:'c1',opportunityId:'o1'};
 assert.deepEqual(notificationDestination(enquiry,{owner:true}),{view:'pipeline',opportunityId:'o1',clientId:'c1'});
 assert.equal(notificationDestination(enquiry,{owner:false}),null);
 assert.deepEqual(notificationDestination({kind:'message',projectId:'p1',clientId:'c1'},{owner:false}),{view:'projects',projectId:'p1',tab:'Conversation'});
 assert.deepEqual(notificationDestination({kind:'message',projectId:null,clientId:'c1'},{owner:true}),{view:'inbox',clientId:'c1'});
 assert.deepEqual(notificationDestination({kind:'message',projectId:null,clientId:'c1'},{owner:false}),{view:'inbox',clientId:null});
 assert.deepEqual(notificationDestination({kind:'message',projectId:'p1'},{staff:true}),{view:'projects',projectId:'p1'});
 assert.deepEqual(notificationDestination({kind:'project_update',projectId:'p1'},{owner:false}),{view:'projects',projectId:'p1',tab:'Activity'});
 assert.deepEqual(notificationDestination({kind:'project_update',projectId:'p1',title:'Shared design Table plan'},{owner:false}),{view:'projects',projectId:'p1',tab:'Designs'});
 assert.deepEqual(notificationDestination({kind:'project_update',projectId:'p1',title:'Issued invoice INV-2026-0002'},{owner:true}),{view:'projects',projectId:'p1',tab:'Billing'});
 assert.deepEqual(notificationDestination({kind:'project_update',projectId:'p1',title:'Sent the estimate'},{owner:false}),{view:'projects',projectId:'p1',tab:'Estimate'});
 assert.deepEqual(notificationDestination({kind:'project_update',projectId:'p1',title:'Signed the contract'},{owner:false}),{view:'projects',projectId:'p1',tab:'Contract'});
 assert.deepEqual(notificationDestination({kind:'task_assigned',taskId:'project:p1:t1',projectId:'p1'},{owner:true}),{view:'tasks',taskId:'project:p1:t1'});
 assert.deepEqual(notificationDestination({kind:'task_assigned',taskId:'project:p1:t1',projectId:'p1'},{staff:true}),{view:'projects',projectId:'p1'});
});

test('notification ages read naturally',()=>{
 const now=Date.parse('2026-10-05T12:00:00Z');
 assert.equal(notificationAge('2026-10-05T11:59:40Z',now),'Just now');
 assert.equal(notificationAge('2026-10-05T11:15:00Z',now),'45 min ago');
 assert.equal(notificationAge('2026-10-05T07:00:00Z',now),'5 h ago');
 assert.equal(notificationAge('2026-10-04T09:00:00Z',now),'Yesterday');
 assert.equal(notificationAge('2026-09-02T09:00:00Z',now),'2 Sept');
 assert.equal(notificationAge('not a date',now),'');
});

function fixture(){
 const calls=[],opened=[];let state=[
  {id:'n2',kind:'message',title:'Amelia Taylor: Could we add candles?',detail:'Amelia’s wedding',projectId:'p1',createdAt:new Date().toISOString(),read:false},
  {id:'n1',kind:'project_update',title:'Approved design version 2',detail:'Amelia’s wedding',projectId:'p1',createdAt:new Date(Date.now()-7200000).toISOString(),read:true}];
 const page=()=>({notifications:state,unread:state.filter(n=>!n.read).length,nextCursor:null});
 const request=async(url,method='GET',body)=>{calls.push([method,url,body]);
  if(url.startsWith('/api/notifications/read')){state=state.map(n=>body.all||body.ids.includes(n.id)?{...n,read:true}:n);}
  else if(url.startsWith('/api/notifications/unread')){state=state.map(n=>body.ids.includes(n.id)?{...n,read:false}:n);}
  return page();};
 render(h(NotificationDrawer,{studio:{id:'s1'},request,onOpen:item=>opened.push(item.id)}));
 return {calls,opened};
}

test('drawer shows unread history, opens a notification and marks it read',async()=>{
 const {calls,opened}=fixture(),u=user();
 const trigger=await screen.findByRole('button',{name:'Notifications, 1 unread'});
 await u.click(trigger);
 const dialog=await screen.findByRole('dialog',{name:'Notifications'});
 const items=within(dialog).getAllByRole('listitem');assert.equal(items.length,2);
 assert.match(items[0].textContent,/Message, unread/);assert.match(items[0].textContent,/Just now/);
 assert.match(items[1].textContent,/2 h ago/);
 await u.click(within(dialog).getByRole('button',{name:/Could we add candles/}));
 assert.deepEqual(opened,['n2']);
 await waitFor(()=>assert.ok(calls.some(([method,url,body])=>method==='POST'&&url==='/api/notifications/read?studio=s1'&&body.ids[0]==='n2')));
 await waitFor(()=>assert.ok(screen.getByRole('button',{name:'Notifications, 0 unread'})));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
 assert.equal(document.activeElement,trigger,'focus returns to the drawer button');
});

test('drawer filters unread, marks all as read and restores unread',async()=>{
 const {calls}=fixture(),u=user();
 await u.click(await screen.findByRole('button',{name:'Notifications, 1 unread'}));
 const dialog=await screen.findByRole('dialog',{name:'Notifications'});
 await u.click(within(dialog).getByRole('radio',{name:'Unread'}));
 assert.equal(within(dialog).getAllByRole('listitem').length,1);
 await u.click(within(dialog).getByRole('button',{name:'Mark all as read'}));
 await waitFor(()=>assert.ok(within(dialog).getByText('Nothing unread')));
 assert.ok(calls.some(([method,,body])=>method==='POST'&&body.all===true));
 assert.equal(within(dialog).getByRole('button',{name:'Mark all as read'}).disabled,true);
 await u.click(within(dialog).getByRole('radio',{name:'All'}));
 await u.click(within(dialog).getAllByRole('button',{name:'Mark unread'})[0]);
 await waitFor(()=>assert.ok(screen.getByRole('button',{name:'Notifications, 1 unread',hidden:true})));
});

test('one bell shows waiting work and saved updates in two tabs with a single badge',async()=>{
 const opened=[],request=async()=>({notifications:[{id:'n1',kind:'enquiry',title:'New enquiry from Priya Patel',detail:'Anniversary dinner',createdAt:new Date().toISOString(),read:false}],unread:1,unreadByKind:{enquiry:1},nextCursor:null});
 const attention={items:[{id:'a1',kind:'message',label:'New client message',context:'Amelia Taylor',detail:'Table plan'}],loadError:false,onOpen:item=>opened.push(['attention',item.id]),onOverview:()=>opened.push(['overview'])};
 render(h(NotificationDrawer,{studio:{id:'s1'},request,onOpen:item=>opened.push(['update',item.id]),attention}));
 const u=user(),trigger=await screen.findByRole('button',{name:'Notifications, 1 needs attention, 1 unread'});
 assert.equal(trigger.textContent,'1','an unread enquiry is already counted under Needs attention');
 await u.click(trigger);const dialog=await screen.findByRole('dialog',{name:'Notifications'});
 assert.equal(within(dialog).getByRole('tab',{name:'Needs attention (1)'}).getAttribute('aria-selected'),'true');
 await u.click(within(dialog).getByRole('tab',{name:'Updates (1)'}));
 await u.keyboard('{Enter}');
 await waitFor(()=>assert.ok(within(dialog).getByRole('button',{name:/New enquiry from Priya Patel/})));
 await u.click(within(dialog).getByRole('tab',{name:'Needs attention (1)'}));await u.keyboard('{Enter}');
 await u.click(await within(dialog).findByRole('button',{name:/New client message/}));
 assert.deepEqual(opened,[['attention','a1']]);
});
