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
const compiled=fileURLToPath(new URL(`.notification-experience-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/NotificationBell.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {NotificationBell}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const at=new Date().toISOString();
const actions=[{id:'action:t',kind:'task',label:'Call the venue',context:'Room styling',destination:{type:'task',taskId:'crm:task-1'}},{id:'action:q',kind:'enquiry',label:'Review new enquiry',context:'A spring dinner',destination:{type:'opportunity',opportunityId:'deal-1'}}];
function fixture({fail=false,items=2,pending=false}={}){
 const opened=[],writes=[],updates=Array.from({length:items},(_,n)=>({id:'n'+n,kind:'message',label:'Message '+n,context:'Room styling',at,actor:'Amelia',readAt:null,destination:n===0?{type:'conversation',clientId:'c1',conversationId:'thread-1'}:{type:'project',projectId:'p1',tab:'Designs',designId:'d1'}}));let first=true,watermark=items;
 const request=async(url,method,body)=>{
  if(method==='POST'){writes.push(body);if(pending)throw Error('Read state could not be saved');for(const item of updates)if(body.action==='read-all'||body.id===item.id)item.readAt=body.action==='read'&&!body.read?null:at;return {changed:1};}
  if(first&&fail){first=false;throw Error('Updates could not be loaded');}first=false;
  const q=new URL(url,'http://localhost').searchParams,filter=q.get('filter'),rows=filter==='all'?updates:updates.filter(x=>!x.readAt),offset=Math.min(Number(q.get('offset')),Math.max(0,Math.floor((rows.length-1)/25)*25));
  return {actions,updates:rows.slice(offset,offset+25),unreadCount:updates.filter(x=>!x.readAt).length,total:rows.length,offset,limit:25,watermark};
 };
 render(h(NotificationBell,{studio:{id:'s1'},userId:'u1',projects:[],request,onOpen:dest=>opened.push(dest)}));return {opened,writes};
}
async function open(input){const trigger=await screen.findByRole('button',{name:/Notifications, \d+ unread updates, 2 actions/});await input.click(trigger);return await screen.findByRole('dialog',{name:'Notifications'});}

test('the modal keeps action items distinct from read updates and restores keyboard focus',async()=>{
 const input=user(),{opened,writes}=fixture();const trigger=await screen.findByRole('button',{name:'Notifications, 2 unread updates, 2 actions'});await input.click(trigger);let dialog=await screen.findByRole('dialog',{name:'Notifications'});
 assert.ok(within(dialog).getByRole('button',{name:'Open Call the venue'}));await input.click(within(dialog).getByRole('radio',{name:'Updates (2)'}));await screen.findByRole('button',{name:'Open Message 0'});await input.click(screen.getByRole('button',{name:'Mark all read'}));
 await screen.findByRole('heading',{name:'You’re caught up.'});assert.deepEqual(writes,[{action:'read-all',through:2}]);assert.equal(opened.length,0);
 await input.click(screen.getByRole('radio',{name:'Action required (2)'}));assert.ok(await screen.findByRole('button',{name:'Open Call the venue'}));await input.keyboard('{Escape}');await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));await waitFor(()=>assert.equal(document.activeElement,trigger));
});

test('opening an update saves its personal read state and routes to its exact record',async()=>{
 const input=user(),{opened,writes}=fixture();await open(input);await input.click(screen.getByRole('radio',{name:'Updates (2)'}));await screen.findByRole('button',{name:'Open Message 0'});await input.click(screen.getByRole('button',{name:'Open Message 0'}));await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
 assert.deepEqual(writes,[{action:'read',id:'n0',read:true}]);assert.deepEqual(opened,[{type:'conversation',clientId:'c1',conversationId:'thread-1'}]);
 await open(input);await input.click(screen.getByRole('button',{name:'Open Call the venue'}));assert.deepEqual(opened.at(-1),{type:'task',taskId:'crm:task-1'});
});

test('history paginates and supports marking an update unread without navigation',async()=>{
 const input=user(),{opened,writes}=fixture({items:28});await open(input);await input.click(screen.getByRole('radio',{name:'Updates (28)'}));await screen.findByRole('button',{name:'Open Message 0'});assert.equal(screen.queryByRole('button',{name:'Open Message 27'}),null);
 await input.click(screen.getByRole('button',{name:'Next',exact:true}));assert.ok(await screen.findByRole('button',{name:'Open Message 27'}));assert.ok(screen.getByText('26–28 of 28'));
 await input.click(screen.getByRole('button',{name:'Mark read: Message 27'}));await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Open Message 27'}),null));await input.click(screen.getByRole('radio',{name:'All updates',exact:true}));await screen.findByRole('button',{name:'Open Message 0'});await input.click(screen.getByRole('button',{name:'Next',exact:true}));await screen.findByRole('button',{name:'Mark unread: Message 27'});await input.click(screen.getByRole('button',{name:'Mark unread: Message 27'}));await screen.findByRole('button',{name:'Mark read: Message 27'});
 assert.equal(opened.length,0);assert.deepEqual(writes.at(-1),{action:'read',id:'n27',read:false});
});

test('a failed read does not dismiss the drawer or navigate; failed loading can retry',async()=>{
 const input=user(),{opened}=fixture({fail:true,pending:true});await screen.findByRole('button',{name:'Notifications, 0 unread updates, 0 actions'});await input.click(screen.getByRole('button',{name:'Notifications, 0 unread updates, 0 actions'}));await screen.findByRole('button',{name:'Open Message 0'});
 await input.click(screen.getByRole('button',{name:'Open Message 0'}));assert.ok(await screen.findByRole('alert'));assert.equal(opened.length,0);assert.ok(screen.getByRole('dialog'));assert.ok(screen.getByRole('button',{name:'Mark read: Message 0'}));await input.click(screen.getByRole('button',{name:'Retry',exact:true}));await waitFor(()=>assert.equal(screen.queryByRole('alert'),null));
});
