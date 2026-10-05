import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {StudioBilling,invoiceLedgerCSV,ledgerTotals} from './src/components/Billing.jsx';",'billing-ledger');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const projects=[{id:'p1',title:'=HYPERLINK("http://evil.test")',brief:{name:'+Ada Brook'}},{id:'p2',title:'Spring launch',brief:{name:'Ben Cole'}}];
const invoices=[
 {id:'i1',number:'INV-001',projectId:'p1',kind:'Deposit',currency:'GBP',amountMinor:50000,dueMinor:50000,paidMinor:0,balanceMinor:50000,status:'Issued',issuedAt:'2026-01-10T10:00:00Z',dueDate:'2026-01-24'},
 {id:'i2',number:'INV-002',projectId:'p2',kind:'Balance',currency:'GBP',amountMinor:80000,dueMinor:80000,paidMinor:80000,balanceMinor:0,status:'Paid',issuedAt:'2026-03-02T10:00:00Z',dueDate:'2026-03-16'},
 {id:'i3',number:'INV-003',projectId:'p2',kind:'Deposit',currency:'GBP',amountMinor:30000,dueMinor:30000,paidMinor:10000,balanceMinor:20000,status:'Partially paid',issuedAt:'2026-05-05T10:00:00Z',dueDate:'2999-01-01'},
 {id:'i4',number:'INV-004',projectId:'p2',kind:'Deposit',currency:'GBP',amountMinor:9000,dueMinor:9000,paidMinor:0,balanceMinor:9000,status:'Cancelled',issuedAt:'2026-05-06T10:00:00Z',dueDate:'2026-05-20'}
];
const numbers=()=>[...document.querySelectorAll('.studio-billing-ledger>button strong:first-child')].map(x=>x.textContent).filter(x=>x.startsWith('INV'));
const totals=()=>Object.fromEntries([...document.querySelectorAll('.studio-billing-totals>div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent]));

test('the ledger filters overdue invoices and a date range, totals the rows shown and exports them',async()=>{
 const input=user();
 render(h(ui.StudioBilling,{projects,studio:{id:'s1'},request:async()=>({invoices}),run(){},openProject(){}}));
 await screen.findByText('INV-001');
 assert.deepEqual(totals(),{'Invoices shown':'4',Invoiced:'£1,600.00',Paid:'£900.00',Outstanding:'£700.00'});
 await input.click(within(screen.getByRole('group',{name:'Filter invoices'})).getByRole('button',{name:/Overdue/}));
 assert.deepEqual(numbers(),['INV-001']);
 assert.deepEqual(totals(),{'Invoices shown':'1',Invoiced:'£500.00',Paid:'£0.00',Outstanding:'£500.00'});
 await input.click(within(screen.getByRole('group',{name:'Filter invoices'})).getByRole('button',{name:'All'}));
 const range=screen.getByRole('group',{name:'Issue date range'});
 await input.type(within(range).getByLabelText('Issued from'),'2026-03-01');
 await input.type(within(range).getByLabelText('Issued to'),'2026-05-05');
 assert.deepEqual(numbers(),['INV-003','INV-002']);
 assert.equal(totals().Outstanding,'£200.00');
 let exported='';const originalCreate=URL.createObjectURL;
 URL.createObjectURL=blob=>{exported=blob;return 'blob:ledger';};URL.revokeObjectURL=()=>{};
 dom.window.HTMLAnchorElement.prototype.click=function(){this.dataset.clicked=this.download;};
 await input.click(screen.getByRole('button',{name:'Export CSV'}));
 const text=await exported.text();URL.createObjectURL=originalCreate;
 assert.equal(text.trim().split('\r\n').length,3);
 assert.match(text,/"INV-003","Deposit","Spring launch","Ben Cole","2026-05-05","2999-01-01","Partially paid","No","GBP","300.00","100.00","200.00"/);
 await input.click(within(range).getByRole('button',{name:'Clear dates'}));
 assert.equal(numbers().length,4);
});

test('CSV export neutralises spreadsheet formulas',()=>{
 const csv=ui.invoiceLedgerCSV([invoices[0]],new Map(projects.map(p=>[p.id,p])));
 assert.match(csv,/"'=HYPERLINK\(""http:\/\/evil.test""\)","'\+Ada Brook"/);
 assert.match(csv.split('\r\n')[1],/"Yes"/);
 assert.deepEqual(ui.ledgerTotals([invoices[3]]),[{currency:'GBP',invoiced:0,paid:0,outstanding:0}]);
});
