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
const compiled=fileURLToPath(new URL(`.notification-routing-${process.pid}.mjs`,import.meta.url));
const output=await build({stdin:{contents:"export {FolioCRM} from './src/components/FolioCRM.jsx'; export {PortalCorrespondence} from './src/components/PortalCorrespondence.jsx';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'jsx'},bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'test-surfaces',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));builder.onLoad({filter:/InboxWorkspace\.jsx$/},()=>({contents:"import React from 'react';export function InboxWorkspace({thread,conversations,onChoose}){return <div><h2>{thread?.subject}</h2>{conversations.map(t=><button key={t.id} onClick={()=>onChoose(t)}>{t.subject}</button>)}</div>}",loader:'jsx'}));builder.onLoad({filter:/ProjectChat\.jsx$/},()=>({contents:"import React from 'react';export function ProjectChat({conversationId}){return <p>{conversationId}</p>}",loader:'jsx'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {FolioCRM,PortalCorrespondence}=await import(pathToFileURL(compiled));
const {render,screen,cleanup}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const threads=[{id:'t1',clientId:'c1',subject:'Materials',messages:[],unreadMessages:0,updatedAt:'2026-10-03'},{id:'t2',clientId:'c1',subject:'Site visit',messages:[],unreadMessages:0,updatedAt:'2026-10-02'}];
const request=async url=>url.includes('/clients')?{clients:[{id:'c1',name:'Amelia',email:'amelia@example.test',tags:[],stage:'Active'}]}:{conversations:threads};
for(const [name,Component] of [['studio',FolioCRM],['client',PortalCorrespondence]])test(`${name} messages reopen the exact notification conversation even after a manual switch`,async()=>{
 const user=userEvent.setup({document:dom.window.document,pointerEventsCheck:0}),props={studio:{id:'s1',name:'Studio'},user:{id:'u1'},projects:[],mode:'inbox',clientId:'c1',initialConversationId:'t1',conversationNavigationKey:{id:'t1'},request,onSelect:()=>{},run:fn=>fn(),onThreadSelect:()=>{}};
 const rendered=render(h(Component,props));await screen.findByRole('heading',{name:'Materials',exact:true});
 await user.click(screen.getByRole('button',{name:/^Site visit/}));await screen.findByRole('heading',{name:'Site visit',exact:true});
 rendered.rerender(h(Component,{...props,conversationNavigationKey:{id:'t1'}}));await screen.findByRole('heading',{name:'Materials',exact:true});
});
