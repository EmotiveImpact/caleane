import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The plan's own issue form takes a discount, carrying a percentage over from the earlier
// invoice, and the studio can let the plan issue its payments itself.
const dom=setupDom();
const {module:ui,remove}=await bundle("export {PaymentPlan} from './src/components/PaymentPlan.jsx';",'payment-plan-ui');
const {render,screen,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const p={id:'p1',briefRevision:1,brief:{date:'2027-06-12'},estimates:[{id:'e1',status:'Budget confirmed',briefRevision:1,subtotal:100000,total:120000,currency:'GBP'}]};
const plan={estimateId:'e1',currency:'GBP',totalMinor:120000,current:true,revision:2,autoIssue:null,autopay:null,steps:[
 {id:'s1',label:'Deposit',amountMinor:36000,dueDate:'2026-10-09',invoice:{id:'i1',number:'INV-2026-0001',status:'Issued'}},
 {id:'s2',label:'Balance',amountMinor:84000,dueDate:'2027-05-29',invoice:null,autoBlocked:{reason:'Automatic issuing needs the client billing address.'}}]};
const invoices=[{id:'i1',estimateId:'e1',status:'Issued',number:'INV-2026-0001',issuedAt:'2026-10-09T10:00:00Z',discountLabel:'Returning client · 10% off',netMinor:27000,discountNetMinor:3000,snapshot:{customerAddress:'2 Elm Row'}}];
const defaults={sellerAddress:'1 Studio Lane',sellerContact:'hello@studio.test',paymentInstructions:'Bank transfer.',paymentTermsDays:14};

function setup(){
 const sent=[];
 const request=async(url,method='GET',body)=>{if(method==='GET')return {plan,defaults};sent.push(body);return {plan:{...plan,autoIssue:body.action==='auto-issue'&&body.on?{since:'2026-10-09T10:00:00Z',byName:'NAY Studio'}:null}};};
 render(h(ui.PaymentPlan,{p,studio:{id:'st1'},owner:true,request,run:fn=>fn(),busy:false,invoices,onIssued(){}}));
 return sent;
}

test('a plan payment carries the earlier percentage discount and shows what the client will pay',async()=>{
 const sent=setup();
 await screen.findByText('Automatic issuing needs the client billing address.');
 fireEvent.click(screen.getByRole('button',{name:'Issue invoice'}));
 assert.equal(screen.getByLabelText('Percentage off').value,'10');
 assert.equal(screen.getByLabelText('Shown as (optional)').value,'Returning client');
 assert.ok(screen.getByText(/Carried over from INV-2026-0001\. This invoice comes to £756\.00 instead of £840\.00\./));
 fireEvent.submit(screen.getByRole('button',{name:'Issue invoice'}).closest('form'));
 await waitFor(()=>assert.equal(sent.length,1));
 assert.deepEqual([sent[0].action,sent[0].stepId,sent[0].customerAddress,sent[0].discount],['issue','s2','2 Elm Row',{type:'percent',percent:10,reason:'Returning client'}]);
});

test('the studio can let the plan issue each payment itself',async()=>{
 const sent=setup();
 const toggle=await screen.findByRole('switch',{name:/Issue each payment automatically/});
 assert.ok(screen.getByText(/goes out 14 days before its due date/));
 fireEvent.click(toggle);
 await waitFor(()=>assert.deepEqual(sent[0],{action:'auto-issue',on:true}));
 await screen.findByText('Each payment is issued automatically 14 days before it is due.');
});
