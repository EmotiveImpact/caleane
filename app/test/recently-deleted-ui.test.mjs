import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {RecentlyDeleted} from './src/components/DataGovernanceSettings.jsx';",'recently-deleted-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

test('recently deleted lists what can come back and restores it',async()=>{
 const item={id:'d1',kind:'project-task',type:'Task',label:'Order the linen',detail:'',projectTitle:'Harbour gala',deletedBy:'NAY Studio',deletedAt:'2026-10-09T10:00:00.000Z',expiresAt:'2026-11-08T10:00:00.000Z'};
 const calls=[];const request=async(path,method)=>{calls.push([path,method]);return method==='POST'?{restored:{kind:'project-task'},items:[]}:{items:[item]};};
 render(h(ui.RecentlyDeleted,{studio:{id:'s1'},request}));
 assert.ok(await screen.findByText('Order the linen'));
 assert.ok(screen.getByText('Task · Harbour gala'));
 await user().click(screen.getByRole('button',{name:'Restore'}));
 assert.ok(await screen.findByText('Task restored: Order the linen'));
 assert.ok(screen.getByText('Nothing deleted in the last 30 days.'));
 assert.deepEqual(calls.at(-1),['/api/recently-deleted/d1/restore?studio=s1','POST']);
});
