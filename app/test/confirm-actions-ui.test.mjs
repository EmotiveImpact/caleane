import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// Confirmation and load-retry behaviour, driven by a fake request function.
const dom=setupDom();
const {module:ui,remove}=await bundle("export {CalendarSyncSettings} from './src/components/CalendarSyncSettings.jsx'; export {TaskCollaboration} from './src/components/TaskCollaboration.jsx'; export {RelationshipPeople} from './src/components/RelationshipPeople.jsx';",'confirm-actions');
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const studio={id:'studio-test',name:'Test studio'};

test('calendar connections show a retry after a load error and confirm before disconnecting',async()=>{
 const input=user(),writes=[];let fail=true;
 const data={providers:[{id:'google',configured:true,connected:true}],items:[{key:'t1',title:'Venue visit',project:'Sample',date:'2026-11-02'}],mappings:[{provider:'google',key:'t1',status:'Synced',date:'2026-11-02'}]};
 const request=async(path,method,body)=>{if(method==='POST'){writes.push(body);return {note:'Done.'};}if(fail)throw new Error('Network unavailable.');return data;};
 render(h(ui.CalendarSyncSettings,{studio,request}));
 const alert=await screen.findByRole('alert');
 assert.match(alert.textContent,/Network unavailable/);
 assert.equal(screen.queryByText('Loading calendar connections…'),null);
 fail=false;await input.click(within(alert).getByRole('button',{name:'Retry'}));
 await screen.findByText('Google Calendar');
 await input.click(screen.getByRole('button',{name:'Disconnect'}));
 const dialog=await screen.findByRole('alertdialog',{name:'Disconnect Google Calendar?'});
 assert.match(dialog.textContent,/All 1 synced date for this calendar will be unlinked/);
 await input.click(within(dialog).getByRole('button',{name:'Cancel'}));
 await waitFor(()=>assert.equal(screen.queryByRole('alertdialog'),null));
 assert.deepEqual(writes,[]);
 await input.click(screen.getByRole('button',{name:'Disconnect'}));
 await input.click(within(await screen.findByRole('alertdialog')).getByRole('button',{name:'Disconnect'}));
 await waitFor(()=>assert.deepEqual(writes,[{action:'disconnect',provider:'google'}]));
});

test('task details replace the loading text with an error and retry',async()=>{
 const input=user();let calls=0;
 const request=async()=>{calls++;if(calls===1)throw new Error('Server busy.');return {canAssign:false,canContribute:false,assigneeName:'',comments:[],files:[]};};
 render(h(ui.TaskCollaboration,{task:{kind:'project',id:'t1',key:'project:t1'},studio,request}));
 const alert=await screen.findByRole('alert');
 assert.match(alert.textContent,/Task details could not be loaded. Server busy./);
 assert.equal(screen.queryByText('Loading task details…'),null);
 await input.click(within(alert).getByRole('button',{name:'Retry'}));
 await screen.findByText('No comments yet. Keep updates for this task here.');
 assert.equal(screen.queryByRole('alert'),null);
});

test('project participants confirm removal, role changes and replacement invitations',async()=>{
 const input=user(),writes=[];
 const member={contactId:'c2',name:'Ada Brook',email:'ada@example.test',role:'Collaborator',isPrimary:false,portalLinked:true};
 const request=async(path,method,body)=>{
  if(method){writes.push({path,method,body});if(path.includes('/invite'))return {url:'http://localhost/join#abc',email:member.email,expiresDays:7};return {stakeholders:[member]};}
  if(path.includes('/contacts'))return {contacts:[]};if(path.startsWith('/api/organizations'))return {organizations:[]};if(path.includes('/organization'))return {organization:null};
  return {stakeholders:[member]};
 };
 render(h(ui.RelationshipPeople,{studio,client:{id:'cl1',name:'Sample client',email:'client@example.test'},projects:[{id:'p1',title:'Spring launch'}],request}));
 const role=await screen.findByRole('combobox',{name:'Role for Ada Brook'});
 await input.selectOptions(role,'Approver');
 let dialog=await screen.findByRole('alertdialog',{name:'Make Ada Brook an approver on Spring launch?'});
 assert.match(dialog.textContent,/Approver can accept proposals and estimates, confirm design decisions, and see and pay invoices/);
 await input.click(within(dialog).getByRole('button',{name:'Cancel'}));
 await waitFor(()=>assert.equal(screen.queryByRole('alertdialog'),null));
 assert.equal(role.value,'Collaborator');assert.equal(writes.length,0);
 await input.click(screen.getByRole('button',{name:'Remove Ada Brook from Spring launch'}));
 dialog=await screen.findByRole('alertdialog',{name:'Remove Ada Brook from Spring launch?'});
 await input.click(within(dialog).getByRole('button',{name:'Remove from project'}));
 await waitFor(()=>assert.deepEqual(writes.map(w=>w.body),[{remove:true}]));
 await input.click(screen.getByRole('button',{name:'Invite'}));
 dialog=await screen.findByRole('alertdialog',{name:'Create a new invitation for Ada Brook?'});
 assert.match(dialog.textContent,/earlier invitation link for ada@example.test in this studio stops working/);
 await input.click(within(dialog).getByRole('button',{name:'Create new link'}));
 assert.ok(await screen.findByRole('textbox',{name:'Participant invitation link'}));
});
