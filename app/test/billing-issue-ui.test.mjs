import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The studio's Issue invoice form, with a fake server.
const dom=setupDom();
const defaults={currency:'GBP',vatRegistered:true,taxRate:20,sellerAddress:'1 Studio Lane',sellerContact:'hello@studio.test',paymentInstructions:'Bank transfer.',paymentTermsDays:14,lateFee:{enabled:true,type:'fixed',amountMinor:2500,currency:'GBP',percent:5,afterDays:7},tips:{enabled:false}};
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('billing-defaults')?{defaults}:{items:[]}});
const {module:ui,remove}=await bundle("export {Billing} from './src/components/Billing.jsx';",'billing-issue');
const {render,screen,cleanup,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const estimate={id:'e1',version:1,title:'Wedding scope',status:'Budget confirmed',briefRevision:1,currency:'GBP',taxRate:20,subtotal:100000,tax:20000,total:120000,items:[{title:'Flowers',quantity:1,unitAmount:100000}]};
const deposit={id:'i1',number:'INV-2026-0001',projectId:'p1',estimateId:'e1',estimateVersion:1,kind:'Deposit',label:'',status:'Paid',currency:'GBP',shareMinor:30000,amountMinor:27000,netMinor:22500,taxMinor:4500,taxRate:20,discountMinor:3000,discountNetMinor:2500,discountLabel:'Returning client · 10% off',dueMinor:27000,paidMinor:27000,balanceMinor:0,issuedAt:'2026-10-01T10:00:00Z',dueDate:'2026-10-15',snapshot:{},payments:[],charges:[]};
const p={id:'p1',studioId:'s1',title:'Wedding',briefRevision:1,brief:{name:'Amelia Taylor',date:'2027-06-12'},estimates:[estimate]};
function harness(invoices){
 const sent=[];
 const request=async path=>path.includes('/invoices/plan')?{plan:null}:path.includes('/invoices')?{invoices}:{stripe:{}};
 const mutate=async(action,body)=>{sent.push({action,body});return {invoice:{...deposit,id:'new',number:'INV-2026-0002',status:'Issued'}};};
 render(h(ui.Billing,{p,studio:{id:'s1',name:'Studio'},owner:true,request,run:fn=>fn(),mutate,busy:false,onNavigate(){}}));
 return sent;
}

test('a percentage discount on the deposit carries over to the balance, and says so',async()=>{
 const input=user();harness([deposit]);
 await input.click(await screen.findByRole('button',{name:/Issue invoice/}));
 await screen.findByText('Discount');
 assert.equal(screen.getByDisplayValue('Percentage').tagName,'SELECT');
 assert.ok(screen.getByDisplayValue('10'));assert.ok(screen.getByDisplayValue('Returning client'));
 assert.ok(screen.getByText(/Carried over from INV-2026-0001, so the whole project gets 10% off/));
});

test('a quick invoice needs no estimate and a fixed fee in another currency is left off with a reason',async()=>{
 // No confirmed estimate: the form opens on a quick invoice.
 const input=user();p.estimates=[];
 const quickSent=harness([]);
 await input.click(await screen.findByRole('button',{name:/Issue invoice/}));
 assert.ok(await screen.findByText(/There’s no confirmed estimate yet/));
 await input.type(screen.getByPlaceholderText(/extra styling hours/),'Rush fee');
 await input.type(screen.getByLabelText('Line 1'),'Weekend delivery');
 await input.type(screen.getByLabelText(/Unit price/),'150');
 await input.selectOptions(screen.getByLabelText('Currency'),'EUR');
 assert.ok(screen.getByText(/so it isn’t added to a EUR invoice/));
 await input.type(screen.getByLabelText('Client billing address'),'2 Elm Row');
 await input.click(screen.getByRole('button',{name:'Issue invoice'}));
 await waitFor(()=>assert.equal(quickSent.length,1));
 const body=quickSent[0].body;
 assert.deepEqual([body.quick,body.kind,body.label,body.currency,body.taxRate,body.lateFee],[true,'Full','Rush fee','EUR',20,undefined]);
 assert.deepEqual(body.items,[{title:'Weekend delivery',quantity:1,unitAmount:15000}]);
 p.estimates=[estimate];
});

test('the client tells the studio they have paid and sees that it was passed on',async()=>{
 const input=user(),open={...deposit,id:'i2',number:'INV-2026-0002',status:'Issued',paidMinor:0,balanceMinor:27000,discountLabel:'',paymentInstructions:'Bank transfer.'},calls=[];
 const request=async(path,method,body)=>{if(method==='POST'){calls.push({path,body});return {invoice:{...open,paidNotice:{paidOn:body.paidOn,method:body.method,reference:body.reference,sentAt:'2026-10-09T10:00:00Z',sentBy:'Amelia Taylor'}}};}return path.includes('/invoices/plan')?{plan:null}:path.includes('/invoices')?{invoices:[open]}:{stripe:{}};};
 render(h(ui.Billing,{p:{...p,accessRole:'Approver'},studio:{id:'s1',name:'Studio'},owner:false,request,run:fn=>fn(),mutate:async()=>({}),busy:false,onNavigate(){}}));
 await input.click(await screen.findByRole('button',{name:'I’ve paid'}));
 await input.type(screen.getByLabelText(/Payment reference/),'AMELIA');
 await input.click(screen.getByRole('button',{name:'Tell the studio'}));
 await waitFor(()=>assert.equal(calls.length,1));
 assert.match(calls[0].path,/\/invoices\/i2\/paid-notice\?studio=s1$/);
 assert.equal(calls[0].body.method,'bank_transfer');assert.equal(calls[0].body.reference,'AMELIA');
 assert.ok(await screen.findByText(/You told the studio on 9 Oct 2026 that you paid by bank transfer/));
 assert.equal(screen.queryByRole('button',{name:'I’ve paid'}),null);
});

test('a quick invoice line can be zero-rated, and the summary shows VAT at each rate',async()=>{
 const input=user();p.estimates=[];
 const sent=harness([]);
 await input.click(await screen.findByRole('button',{name:/Issue invoice/}));
 await input.type(await screen.findByPlaceholderText(/extra styling hours/),'Extras');
 await input.type(screen.getByLabelText('Line 1'),'Styling');
 await input.type(screen.getByLabelText(/Unit price/),'100');
 await input.click(screen.getByRole('button',{name:/Add a line/}));
 await input.type(screen.getByLabelText('Line 2'),'Printed menus');
 await input.type(screen.getAllByLabelText(/Unit price/)[1],'50');
 const rates=screen.getAllByLabelText('VAT');
 assert.deepEqual([...rates[1].options].map(option=>option.textContent),['Usual rate','Reduced (5%)','Zero-rated (0%)','Exempt']);
 await input.selectOptions(rates[1],'0');
 const summary=screen.getByRole('complementary',{name:'Invoice summary'});
 assert.match(summary.textContent,/VAT at 20% on £100\.00£20\.00/);
 assert.match(summary.textContent,/Zero-rated on £50\.00£0\.00/);
 assert.match(summary.textContent,/Invoice amount£170\.00/);
 await input.type(screen.getByLabelText('Client billing address'),'2 Elm Row');
 await input.click(screen.getByRole('button',{name:'Issue invoice'}));
 await waitFor(()=>assert.equal(sent.length,1));
 assert.deepEqual(sent[0].body.items,[{title:'Styling',quantity:1,unitAmount:10000},{title:'Printed menus',quantity:1,unitAmount:5000,taxRate:0}]);
 p.estimates=[estimate];
});

test('an issued invoice at more than one rate lists the VAT at each',async()=>{
 const mixed={...deposit,id:'i3',number:'INV-2026-0003',estimateId:'',kind:'Full',label:'Extras',status:'Issued',shareMinor:17000,amountMinor:17000,netMinor:15000,taxMinor:2000,discountMinor:0,discountNetMinor:0,discountLabel:'',paidMinor:0,balanceMinor:17000,dueMinor:17000,
  snapshot:{vatRegistered:true,vatBreakdown:[{rate:20,exempt:false,netMinor:10000,taxMinor:2000},{rate:0,exempt:false,netMinor:5000,taxMinor:0}],lines:{taxRate:20,items:[{title:'Styling',quantity:1,unitAmount:10000},{title:'Printed menus',quantity:1,unitAmount:5000,taxRate:0}]}}};
 harness([mixed]);
 assert.ok(await screen.findByText(/1 × £50\.00 · Zero-rated/));
 assert.ok(screen.getByText('VAT at 20% on £100.00'));assert.ok(screen.getByText('Zero-rated on £50.00'));
 assert.equal(screen.queryByText('VAT (20%)'),null);
});
