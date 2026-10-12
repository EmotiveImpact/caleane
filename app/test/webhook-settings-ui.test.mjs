import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.webhook-settings-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/WebhookSettings.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,outdir:'out',loader:{'.css':'empty'}});
await writeFile(compiled,output.outputFiles.find(file=>file.path.endsWith('.js')).text);
const {WebhookSettings}=await import(pathToFileURL(compiled));
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const events=['enquiry.received','form.submitted','client.created','booking.created'].map(type=>({type,label:type,description:''}));

test('a new webhook endpoint starts with every event ticked',async()=>{
 const sent=[];const request=async(url,method='GET',body)=>{if(method==='POST')sent.push(body);return {endpoints:[],deliveries:[],events};};
 const input=userEvent.setup();render(React.createElement(WebhookSettings,{studio:{id:'s1'},request}));
 await input.click(await screen.findByRole('button',{name:'Add an endpoint'}));
 for(const event of events)assert.equal(screen.getByRole('checkbox',{name:event.type}).getAttribute('aria-checked')??String(screen.getByRole('checkbox',{name:event.type}).checked),'true',event.type);
 await input.type(screen.getByRole('textbox',{name:/Endpoint address/}),'https://example.test/hook');
 await input.click(screen.getByRole('button',{name:'Add endpoint'}));
 assert.deepEqual(sent[0].events,events.map(event=>event.type));
});
