import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The calm note the studio sees when the person they are writing to has not joined yet.
const dom=setupDom();
const {module:ui,remove}=await bundle("export {NotJoinedNotice} from './src/components/NotJoinedNotice.jsx';",'not-joined-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const studio={id:'studio-1'};

test('the notice names who has not joined and creates their invitation link in one click',async()=>{
 const calls=[];const request=async(url,method)=>{calls.push([url,method]);return {url:'http://127.0.0.1/join#'+'a'.repeat(64),email:'sophie@example.test',expiresDays:7,delivery:'copy_link'};};
 render(h(ui.NotJoinedNotice,{waiting:[{contactId:'contact-1',name:'Sophie Clarke',email:'sophie@example.test',invited:false}],studio,request,projectId:'project-1',clientId:'client-1',what:'messages here'}));
 assert.ok(screen.getByText("Sophie hasn't joined yet, so they can't see messages here."));
 await user().click(screen.getByRole('button',{name:'Copy invitation link'}));
 assert.deepEqual(calls,[['/api/projects/project-1/stakeholders/contact-1/invite?studio=studio-1','POST']],'the existing per-person invitation is used');
 assert.equal(screen.getByLabelText('Invitation link for Sophie Clarke').value,'http://127.0.0.1/join#'+'a'.repeat(64));
 assert.ok(screen.getByText(/No email has been sent\. It expires in 7 days/));
});

test('a client conversation invites through the client record, and nothing shows once everyone has joined',async()=>{
 const calls=[];const request=async url=>{calls.push(url);return {url:'http://127.0.0.1/join#x',email:'noah@example.test',expiresDays:7,delivery:'queued'};};
 const {rerender}=render(h(ui.NotJoinedNotice,{waiting:[{contactId:'contact-2',name:'Noah Williams',email:'noah@example.test',invited:true}],studio,request,clientId:'client-2',what:'messages here'}));
 assert.ok(screen.getByText(/An invitation is waiting for noah@example\.test/));
 await user().click(screen.getByRole('button',{name:'Copy invitation link'}));
 assert.deepEqual(calls,['/api/clients/client-2/invite?studio=studio-1']);
 assert.ok(screen.getByText(/Also emailed to noah@example\.test/));
 rerender(h(ui.NotJoinedNotice,{waiting:[],studio,request,clientId:'client-2'}));
 assert.equal(screen.queryByRole('note'),null);
});
