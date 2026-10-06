import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {ClientDirectory} from './src/components/ClientDirectory.jsx'; export {StudioDetails,TagChips} from './src/components/CustomFields.jsx'; export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';",'custom-fields-ui');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const rows=()=>screen.getAllByRole('button').filter(b=>b.classList.contains('studio-client-row'));

test('clients can be found by tag and by a custom field value',async()=>{
 const input=user();
 const clients=[{id:'a',name:'Amelia Taylor',email:'a@example.test',stage:'Active',tags:['Wedding','Referral'],customFields:{f1:'The Grange'},createdAt:'2026-01-01T10:00:00.000Z'},{id:'b',name:'Bola Ade',email:'b@example.test',stage:'Active',tags:['Brand'],createdAt:'2026-01-02T10:00:00.000Z'},{id:'c',name:'Cara Lee',email:'c@example.test',stage:'Active',createdAt:'2026-01-03T10:00:00.000Z'}];
 render(h(ui.WorkspaceUIProvider,null,h(ui.ClientDirectory,{clients,projects:[],studio:{id:'s1',branding:{}},loading:false,error:'',onSelect(){},onAdd(){},openProject(){}})));
 assert.equal(rows().length,3);
 assert.ok(within(rows().find(r=>/Amelia/.test(r.textContent))).getByText('Wedding'));
 await input.click(screen.getByRole('combobox',{name:'Filter by tag'}));
 await input.click(await screen.findByRole('option',{name:'Brand'}));
 assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Bola Ade/);
 await input.click(screen.getByRole('combobox',{name:'Filter by tag'}));
 await input.click(await screen.findByRole('option',{name:'All tags'}));
 await input.click(screen.getByRole('button',{name:'Filter clients'}));
 await input.type(await screen.findByRole('textbox',{name:'Filter clients'}),'grange');
 assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Amelia/);
});

test('studio details show each field and save tags and values together',async()=>{
 const input=user(),saves=[];
 const definitions={project:[{id:'g',label:'Guest count',type:'number'},{id:'s',label:'Brand stage',type:'choice',options:['New brand','Refresh']},{id:'v',label:'Venue',type:'text'}],client:[]};
 render(h(ui.WorkspaceUIProvider,null,h(ui.StudioDetails,{kind:'project',record:{id:'p1',tags:['Summer'],customFields:{g:120}},definitions,tagSuggestions:['Summer','Winter'],onSave:async body=>{saves.push(body);return true;}})));
 assert.ok(screen.getByText('Summer'));assert.ok(screen.getByText('120'));
 assert.equal(screen.getAllByText('Not set').length,2);
 await input.click(screen.getByRole('button',{name:'Edit'}));
 await input.type(screen.getByRole('combobox',{name:'Tags'}),'Garden{Enter}');
 await input.type(screen.getByLabelText('Venue'),'Kew');
 await input.click(screen.getByRole('button',{name:'Remove tag Summer'}));
 await input.click(screen.getByRole('button',{name:'Save details'}));
 assert.deepEqual(saves,[{tags:['Garden'],fields:{g:120,s:'',v:'Kew'}}]);
});

test('tag chips in lists show the first three and count the rest',()=>{
 render(h(ui.TagChips,{tags:['Wedding','Referral','VIP','2027','Summer'],max:3}));
 const items=within(screen.getByRole('list',{name:'Tags'})).getAllByRole('listitem');
 assert.deepEqual(items.slice(0,3).map(li=>li.textContent),['Wedding','Referral','VIP']);
 assert.equal(items.length,4);assert.match(items[3].textContent,/^\+2and 2 more: 2027, Summer$/);
 assert.equal(items[3].title,'2027, Summer');
 cleanup();
 render(h(ui.TagChips,{tags:['Wedding','Referral'],max:3}));
 assert.equal(within(screen.getByRole('list',{name:'Tags'})).getAllByRole('listitem').length,2);
});
