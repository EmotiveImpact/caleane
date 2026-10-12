import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {ClientImport} from './src/components/ClientImport.jsx'; export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';",'client-import');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const csv='First Name,Last Name,Email,Company\nNadia,Okafor,nadia@example.com,Okafor Interiors\nKnown,Person,known@example.com,\nNo,Email,,\n';

test('a studio chooses a CSV, checks the matched columns and imports the rows that are ready',async()=>{
 const input=user(),calls=[],imported=[];
 const request=async(url,method,body)=>{calls.push({url,method,body});if(url.startsWith('/api/custom-fields'))return {fields:{client:[],project:[]}};return {clients:[{id:'n1',name:'Nadia Okafor',email:'nadia@example.com'}],skipped:[]};};
 render(h(ui.WorkspaceUIProvider,null,h(ui.ClientImport,{open:true,onOpenChange(){},studio:{id:'s-import'},clients:[{id:'k',email:'known@example.com'}],request,onImported:list=>imported.push(...list)})));
 const file=new dom.window.File([csv],'contacts.csv',{type:'text/csv'});
 await input.upload(screen.getByLabelText('Choose a CSV file'),file);
 assert.ok(await screen.findByText('Match your columns'));
 assert.match(screen.getByRole('combobox',{name:'Column for First name'}).textContent,/First Name/);
 assert.match(screen.getByRole('combobox',{name:'Column for Full name'}).textContent,/Not in this file/);
 assert.ok(screen.getByText('1 ready to import'));
 assert.ok(screen.getByText('2 will be skipped'));
 const rows=document.querySelectorAll('.client-import-rows>li');
 assert.match(rows[1].textContent,/Row 3.*Already one of your clients/);
 assert.match(rows[2].textContent,/Row 4.*No email address/);
 await input.type(screen.getByPlaceholderText('For example, HoneyBook'),'HoneyBook');
 await input.click(screen.getByRole('button',{name:'Import 1 client'}));
 assert.ok(await screen.findByText('1 client added'));
 const sent=calls.find(c=>c.url.startsWith('/api/clients/import'));
 assert.equal(sent.method,'POST');
 assert.deepEqual(sent.body.rows.map(r=>[r.row,r.name,r.email,r.company]),[[2,'Nadia Okafor','nadia@example.com','Okafor Interiors']]);
 assert.equal(sent.body.tag,'HoneyBook');
 assert.equal(sent.body.stage,'Active');
 assert.equal(sent.body.fileName,'contacts.csv');
 assert.deepEqual(imported.map(c=>c.id),['n1']);
 assert.match(within(document.querySelector('.client-import-done')).getByText(/rows were skipped/).textContent,/2 rows were skipped/);
});

test('a file without an email column asks for one before importing',async()=>{
 const input=user();
 const request=async()=>({fields:{client:[],project:[]}});
 render(h(ui.WorkspaceUIProvider,null,h(ui.ClientImport,{open:true,onOpenChange(){},studio:{id:'s-missing'},clients:[],request,onImported(){}})));
 await input.upload(screen.getByLabelText('Choose a CSV file'),new dom.window.File(['Name,Address\nAmelia,1 High Street\n'],'list.csv',{type:'text/csv'}));
 assert.ok(await screen.findByText('Choose the column that holds email addresses.'));
 assert.equal(screen.getByRole('button',{name:'Nothing to import'}).disabled,true);
 await input.click(screen.getByRole('button',{name:'Choose another file'}));
 await input.upload(screen.getByLabelText('Choose a CSV file'),new dom.window.File(['just a header\n'],'empty.csv',{type:'text/csv'}));
 assert.match((await screen.findByRole('alert')).textContent,/no clients in it/);
});

test('a file too big to send in one go says so instead of failing on the server',async()=>{
 const input=user(),calls=[];
 const request=async(url,method,body)=>{calls.push({url,method});return {fields:{client:[],project:[]}};};
 render(h(ui.WorkspaceUIProvider,null,h(ui.ClientImport,{open:true,onOpenChange(){},studio:{id:'s-big'},clients:[],request,onImported(){}})));
 const note='x'.repeat(1500),rows=Array.from({length:1000},(_,i)=>`Person ${i},p${i}@example.com,${note}`).join('\n');
 await input.upload(screen.getByLabelText('Choose a CSV file'),new dom.window.File([`Name,Email,Notes\n${rows}\n`],'big.csv',{type:'text/csv'}));
 await input.click(await screen.findByRole('button',{name:'Import 1,000 clients'}));
 assert.match((await screen.findByRole('alert')).textContent,/Split it into two files/);
 assert.equal(calls.filter(c=>c.url.startsWith('/api/clients/import')).length,0);
});
