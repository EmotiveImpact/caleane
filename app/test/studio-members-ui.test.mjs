import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {StudioMembers} from './src/components/StudioMembers.jsx';",'studio-members');
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const studio={id:'studio-test',name:'Test studio'},owner={name:'Sophie Lane',email:'sophie@example.test'};

test('members show a loading state, an empty state and a retry after a load error',async()=>{
 const input=user();let release,fail=true;
 render(h(ui.StudioMembers,{studio,request:()=>fail?Promise.reject(new Error('Offline.')):new Promise(resolve=>{release=resolve;})}));
 const alert=await screen.findByRole('alert');
 assert.match(alert.textContent,/Members could not be loaded. Offline./);
 fail=false;await input.click(within(alert).getByRole('button',{name:'Retry'}));
 assert.ok(screen.getByText('Loading members…'));
 release({owner,members:[],pending:[]});
 assert.ok(await screen.findByText('No team members yet.'));
 await input.click(screen.getByRole('button',{name:'Invite a team member'}));
 assert.equal(document.activeElement,screen.getByLabelText('Email address'));
});

test('an invitation link can be copied again, and a lost link can be replaced after confirming',async()=>{
 const input=user(),posts=[];let pending=[{id:'hash-old',email:'old@example.test',expires:Date.now()+86400000}];
 const request=async(path,method,body)=>{
  if(method==='POST'){posts.push(body.email);pending=[{id:'hash-'+posts.length,email:body.email,expires:Date.now()+86400000},...pending.filter(p=>p.email!==body.email)];return {url:`http://localhost/staff-invite#token-${posts.length}`};}
  return {owner,members:[],pending};
 };
 render(h(ui.StudioMembers,{studio,request}));
 await screen.findByText('old@example.test');
 await input.type(screen.getByLabelText('Email address'),'new@example.test');
 await input.click(screen.getByRole('button',{name:'Create invitation'}));
 const row=(await screen.findByText('new@example.test')).closest('.member-row');
 await input.click(within(row).getByRole('button',{name:'Copy link'}));
 assert.equal(await navigator.clipboard.readText(),'http://localhost/staff-invite#token-1');
 assert.ok(within(row).getByRole('button',{name:'Copied'}));
 const oldRow=screen.getByText('old@example.test').closest('.member-row');
 await input.click(within(oldRow).getByRole('button',{name:'Create a new link'}));
 const dialog=await screen.findByRole('alertdialog',{name:'Create a new link for old@example.test?'});
 assert.match(dialog.textContent,/earlier link stops working/);
 await input.click(within(dialog).getByRole('button',{name:'Create a new link'}));
 await waitFor(()=>assert.deepEqual(posts,['new@example.test','old@example.test']));
 assert.equal(screen.getByLabelText('Private invitation link').value,'http://localhost/staff-invite#token-2');
});

test('a bookkeeper can be invited, and a member can be switched to bookkeeper after confirming',async()=>{
 const input=user(),posts=[],patches=[];
 let members=[{id:'m1',name:'Tom Field',email:'tom@example.test',access:'viewer',joinedAt:'2026-09-01T00:00:00.000Z',projectIds:['p1']}],pending=[];
 const request=async(path,method,body)=>{
  if(method==='POST'){posts.push(body);pending=[{id:'hash-1',email:body.email,access:body.access,expires:Date.now()+86400000}];return {url:'http://localhost/join-studio#token-1',access:body.access};}
  if(method==='PATCH'){patches.push([path,body]);members=members.map(m=>({...m,access:body.access,projectIds:[]}));return {ok:true};}
  return {owner,members,pending};
 };
 render(h(ui.StudioMembers,{studio,request,projects:[{id:'p1',title:'Spring wedding',status:'Planning',brief:{name:'Amelia'}}]}));
 await screen.findByText('Tom Field');
 const choice=screen.getByRole('group',{name:'Access'});
 assert.equal(within(choice).getByRole('radio',{name:/Team member/}).checked,true);
 await input.click(within(choice).getByRole('radio',{name:/Bookkeeper/}));
 await input.type(screen.getByLabelText('Email address'),'books@example.test');
 await input.click(screen.getByRole('button',{name:'Create invitation'}));
 await waitFor(()=>assert.deepEqual(posts,[{email:'books@example.test',access:'bookkeeper'}]));
 const invited=screen.getByText('books@example.test').closest('.member-row');
 assert.match(invited.textContent,/Invitation pending · Expires/);
 assert.equal(invited.querySelector('.member-role').textContent,'Bookkeeper','the role shows as a chip');
 await input.click(screen.getByRole('button',{name:'Access for Tom Field'}));
 const memberChoice=screen.getByRole('group',{name:'Access for Tom Field'});
 await input.click(within(memberChoice).getByRole('radio',{name:/Bookkeeper/}));
 const dialog=await screen.findByRole('alertdialog',{name:'Make Tom Field a bookkeeper?'});
 assert.match(dialog.textContent,/contribution access to 1 project ends/);
 await input.click(within(dialog).getByRole('button',{name:'Make bookkeeper'}));
 await waitFor(()=>assert.deepEqual(patches,[['/api/staff/m1?studio=studio-test',{access:'bookkeeper'}]]));
 const row=(await screen.findByText(/Finances only, read-only/)).closest('.member-row');
 assert.equal(row.querySelector('.member-role').textContent,'Bookkeeper');
 assert.equal(screen.queryByRole('checkbox',{name:/Spring wedding/}),null);
});
