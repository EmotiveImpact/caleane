import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=overview',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.onboarding-ui-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/Onboarding.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {StudioSetup,ClientWelcome}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const steps=[{id:'brand',title:'Add your brand',detail:'',done:true},{id:'form',title:'Publish your enquiry form',detail:'',done:false},{id:'team',title:'Invite your team',detail:'',optional:true,done:false}];

test('setup checklist shows progress, opens a step and hides when dismissed',async()=>{
 const calls=[],opened=[];let dismissed=false;
 const request=async(url,method='GET',body)=>{calls.push([method,body]);if(method==='POST')dismissed=true;return {studioSetup:{steps,completed:1,total:3,complete:false,dismissed}};};
 render(h(StudioSetup,{studio:{id:'s1'},request,onStep:id=>opened.push(id)}));
 const u=user(),region=await screen.findByRole('region',{name:'Get your studio ready'});
 assert.match(region.textContent,/1 of 3 done/);
 assert.equal(within(region).getByRole('progressbar').getAttribute('aria-valuenow'),'1');
 assert.ok(within(region).getByRole('button',{name:'Add your brand, done'}));
 assert.ok(within(region).getByRole('button',{name:'Invite your team, optional'}));
 await u.click(within(region).getByRole('button',{name:'Publish your enquiry form'}));
 assert.deepEqual(opened,['form']);
 await u.click(within(region).getByRole('button',{name:'Hide for now'}));
 await waitFor(()=>assert.equal(screen.queryByRole('region',{name:'Get your studio ready'}),null));
 assert.deepEqual(calls.at(-1),['POST',{action:'dismiss-setup'}]);
});

test('setup checklist stays out of the way once the required steps are done',async()=>{
 render(h(StudioSetup,{studio:{id:'s1'},request:async()=>({studioSetup:{steps,completed:3,total:3,complete:true,dismissed:false}}),onStep:()=>{}}));
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(screen.queryByRole('region'),null);
});

test('client welcome appears once and can open their project',async()=>{
 const calls=[],opened=[];
 const request=async(url,method='GET',body)=>{calls.push([method,body]);return {clientWelcome:{show:true,studioName:'NAY DÉCOR',welcome:'Your project, thoughtfully brought together.',logoUrl:'',projects:[{id:'p1',title:'Amelia’s wedding'}]}};};
 render(h(ClientWelcome,{studio:{id:'s1'},request,onOpenProject:p=>opened.push(p.id)}));
 const u=user(),dialog=await screen.findByRole('dialog',{name:'Welcome to NAY DÉCOR'});
 assert.match(dialog.textContent,/Decisions waiting for you/);
 await u.click(within(dialog).getByRole('button',{name:'Open Amelia’s wedding'}));
 assert.deepEqual(opened,['p1']);
 await waitFor(()=>assert.deepEqual(calls.at(-1),['POST',{action:'welcome-seen'}]));
});

test('client welcome stays hidden after it has been seen',async()=>{
 render(h(ClientWelcome,{studio:{id:'s1'},request:async()=>({clientWelcome:{show:false,studioName:'NAY',welcome:'',projects:[]}}),onOpenProject:()=>{}}));
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(screen.queryByRole('dialog'),null);
});
