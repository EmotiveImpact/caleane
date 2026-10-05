import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom('http://localhost/?view=settings');
const {module:ui,remove}=await bundle("export {SettingsWorkspace} from './src/components/SettingsWorkspace.jsx';",'settings-unsaved');
const {render,screen,cleanup,act}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>{cleanup();history.replaceState(null,'','/?view=settings');});
after(async()=>{await remove();dom.window.close();});

const studio={id:'s1',slug:'test',name:'Original studio',accent:'#202326',origins:['https://original.test'],branding:{portalTitle:'Original portal',welcome:'Welcome',logoUrl:'',profession:'events',projectTypes:['Custom type'],intakeQuestions:[]}};
function mount(){
 let stored=structuredClone(studio);
 const request=async(path,method,body)=>{
  if(method==='PATCH'){stored={...stored,name:body.name.trim(),origins:body.origins,branding:{...stored.branding,portalTitle:body.portalTitle,welcome:body.welcome}};return {};}
  if(path.startsWith('/api/calendar-sync'))return {providers:[],items:[],mappings:[]};
  if(path.startsWith('/api/data-governance'))return {policy:{reviewAfterDays:365,revision:1},projects:[]};
  if(path.startsWith('/api/operations'))return {checks:[]};
  return {onboarding:{status:'unavailable'}};
 };
 function Fixture(){const [current,setCurrent]=React.useState(stored);return h(ui.SettingsWorkspace,{studio:current,request,run:fn=>fn(),busy:false,reload:async()=>setCurrent(stored),navigate:()=>{}});}
 render(h(Fixture));
}
const leave=()=>{let allowed;act(()=>{allowed=window.dispatchEvent(new Event('caleane:before-navigate',{cancelable:true}));});return allowed;};
const unload=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};

test('unsaved settings block leaving until they are saved or discarded',async()=>{
 const input=user();mount();
 assert.equal(leave(),true);assert.equal(unload(),false);
 const name=screen.getByRole('textbox',{name:'Studio name'});
 await input.type(name,' ');
 assert.equal(unload(),true);
 assert.equal(leave(),false);
 assert.match(screen.getByRole('alert').textContent,/unsaved changes in Studio/);
 await input.click(screen.getByRole('button',{name:'Save studio details'}));
 await screen.findByText('Saved.');
 assert.equal(leave(),true,'saving clears the guard even when the server trims the value');
 assert.equal(screen.queryByRole('alert'),null);
 await input.click(screen.getByRole('tab',{name:'Website',exact:true}));
 await input.type(screen.getByRole('textbox',{name:'Connected website origins'}),'\nhttps://draft.test');
 assert.equal(leave(),false);
 await input.click(screen.getByRole('button',{name:'Discard changes'}));
 assert.equal(screen.getByRole('textbox',{name:'Connected website origins'}).value,'https://original.test');
 assert.equal(leave(),true);assert.equal(unload(),false);
});
