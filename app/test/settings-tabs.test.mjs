import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';

// Exercise draft/save behaviour without touching the user's workspace database.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=settings',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.settings-tabs-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/SettingsWorkspace.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);
const {SettingsWorkspace,settingsSection}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,act}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const section=name=>screen.getByRole('button',{name,exact:true});
const h=React.createElement;
const user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>{cleanup();history.replaceState(null,'','/?view=settings');});
after(async()=>{await unlink(compiled);dom.window.close();});
const base={id:'settings-test',slug:'test',name:'Original studio',accent:'#202326',origins:['https://original.test'],branding:{portalTitle:'Original portal',welcome:'Welcome',logoUrl:'',profession:'events',projectTypes:['Custom type'],intakeQuestions:[{id:'keep'}]}};
function fixture({deferred=false}={}){
 let stored=structuredClone(base),finish;const writes=[];
 const billing={writes:[],stored:{sellerAddress:'',sellerContact:'',taxRegistration:'',paymentInstructions:'',paymentTermsDays:14,plan:[{label:'Deposit',percent:100,due:{type:'on_issue',days:0}}],lateFee:{enabled:false,type:'fixed',amountMinor:2500,percent:5,afterDays:7},tips:{enabled:false}}};
 const request=async(path,method,body)=>{
  if(method==='PATCH'){writes.push(body);const apply=()=>{stored={...stored,name:body.name,accent:body.accent,origins:body.origins,branding:{portalTitle:body.portalTitle,welcome:body.welcome,logoUrl:body.logoUrl,profession:body.profession,projectTypes:body.projectTypes,intakeQuestions:body.intakeQuestions}};return {};};if(deferred)return new Promise(resolve=>{finish=()=>resolve(apply());});return apply();}
  if(path.startsWith('/api/calendar-sync'))return {providers:[],items:[],mappings:[]};
  if(path.startsWith('/api/data-governance'))return {policy:{reviewAfterDays:365,revision:1},projects:[]};
  if(path.startsWith('/api/operations'))return {checks:[]};
  if(path.startsWith('/api/stripe'))return {onboarding:{status:'unavailable'}};
  if(path.startsWith('/api/billing-defaults')){if(method==='POST'){billing.writes.push(body);billing.stored=structuredClone(body);}return {defaults:structuredClone(billing.stored)};}
  throw new Error('Unexpected request: '+path);
 };
 function Fixture(){const [studio,setStudio]=React.useState(stored);return h(SettingsWorkspace,{studio,request,run:fn=>fn(),busy:false,reload:async()=>setStudio(stored),navigate:()=>{}});}
 render(h(Fixture));return {writes,billing,finish:()=>finish()};
}

test('each pane saves only its own edits and keeps other drafts through reload',async()=>{
 const input=user(),{writes}=fixture();
 await input.clear(screen.getByRole('textbox',{name:'Studio name'}));await input.type(screen.getByRole('textbox',{name:'Studio name'}),'Draft studio');
 await input.click(section('Website'));
 assert.equal(document.querySelectorAll('.settings-tab-panel:not([hidden])').length,1);
 assert.equal(new URLSearchParams(location.search).get('settingsTab'),'website');
 await input.clear(screen.getByRole('textbox',{name:'Connected website origins'}));await input.type(screen.getByRole('textbox',{name:'Connected website origins'}),'https://new.test');
 await input.click(screen.getByRole('button',{name:'Save website settings'}));await screen.findByText('Saved.');
 assert.equal(writes[0].name,'Original studio');assert.deepEqual(writes[0].origins,['https://new.test']);assert.deepEqual(writes[0].intakeQuestions,base.branding.intakeQuestions);
 await input.click(section('Studio'));assert.equal(screen.getByRole('textbox',{name:'Studio name'}).value,'Draft studio');
 await input.click(screen.getByRole('button',{name:'Save studio details'}));await screen.findByText('Saved.');
 assert.equal(writes[1].name,'Draft studio');assert.deepEqual(writes[1].origins,['https://new.test']);assert.deepEqual(writes[1].projectTypes,['Custom type']);
});

test('appearance draft survives tab changes and saving it does not save website drafts',async()=>{
 const input=user(),{writes}=fixture();
 await input.click(section('Website'));await input.type(screen.getByRole('textbox',{name:'Connected website origins'}),'\nhttps://draft.test');
 await input.click(section('Appearance'));await input.click(screen.getByRole('radio',{name:'Mulberry',exact:true}));
 await input.click(section('Studio'));await input.click(section('Appearance'));
 assert.equal(screen.getByRole('radio',{name:'Mulberry',exact:true}).getAttribute('aria-checked'),'true');
 await input.click(screen.getByRole('button',{name:'Save appearance'}));await screen.findByText('Saved.');
 assert.equal(writes[0].accent,'#604852');assert.deepEqual(writes[0].origins,base.origins);
 await input.click(screen.getByRole('radio',{name:'Graphite',exact:true}));assert.equal(screen.queryByText('Saved.'),null);
 await input.click(section('Website'));assert.match(screen.getByRole('textbox',{name:'Connected website origins'}).value,/draft\.test/);
});

test('edits made during a save stay in the field and are not marked saved',async()=>{
 const input=user(),result=fixture({deferred:true});
 await input.type(screen.getByRole('textbox',{name:'Studio name'}),' saved');await input.click(screen.getByRole('button',{name:'Save studio details'}));
 await waitFor(()=>assert.equal(result.writes.length,1));await input.type(screen.getByRole('textbox',{name:'Studio name'}),' newer');
 await act(async()=>result.finish());
 assert.equal(screen.getByRole('textbox',{name:'Studio name'}).value,'Original studio saved newer');assert.equal(screen.queryByText('Saved.'),null);
 assert.equal(result.writes[0].name,'Original studio saved');
});

test('provider return URLs and old links open the right section',async()=>{
 assert.equal(settingsSection('?calendar_callback=google&settingsTab=studio'),'connections');assert.equal(settingsSection('?stripe=pending'),'connections');assert.equal(settingsSection('?settingsTab=unknown'),'studio');
 assert.equal(settingsSection('?settingsTab=pricing'),'invoices');assert.equal(settingsSection('?xero_callback=1'),'integrations');assert.equal(settingsSection('?settingsTab=price-list'),'price-list');
 history.replaceState(null,'','/?view=settings&settingsTab=data');const input=user();fixture();
 assert.equal(section('Data').getAttribute('aria-current'),'page');assert.equal(section('Status').getAttribute('aria-current'),null);
 await input.click(section('Status'));
 assert.equal(section('Status').getAttribute('aria-current'),'page');assert.equal(document.querySelectorAll('.settings-tab-panel:not([hidden])').length,1);
 assert.equal(new URLSearchParams(location.search).get('settingsTab'),'status');
});

test('plain Settings opens the section list on a phone, and the back link returns to it',async()=>{
 const input=user();fixture();
 const page=document.querySelector('.settings-tabbed');
 assert.ok(page.classList.contains('is-list-open'));
 await input.click(section('Website'));
 assert.ok(page.classList.contains('is-section-open'));assert.equal(new URLSearchParams(location.search).get('settingsTab'),'website');
 await input.click(screen.getByRole('button',{name:'Settings',exact:true}));
 assert.ok(page.classList.contains('is-list-open'));assert.equal(new URLSearchParams(location.search).get('settingsTab'),null);
 cleanup();history.replaceState(null,'','/?view=settings&settingsTab=fields');fixture({});
 assert.ok(document.querySelector('.settings-tabbed').classList.contains('is-section-open'));
});

test('money sections save only their own billing fields on top of the latest saved record',async()=>{
 history.replaceState(null,'','/?view=settings&settingsTab=late-fees');
 const input=user(),{billing}=fixture();
 await screen.findByRole('button',{name:'Save late fees and tips'});
 billing.stored={...billing.stored,sellerAddress:'Saved elsewhere'};
 await input.click(screen.getByRole('switch',{name:/tip to final invoices/}));
 await input.click(screen.getByRole('button',{name:'Save late fees and tips'}));await screen.findByText('Saved.');
 assert.equal(billing.writes[0].sellerAddress,'Saved elsewhere');assert.equal(billing.writes[0].tips.enabled,true);assert.deepEqual(billing.writes[0].plan,billing.stored.plan);
});
