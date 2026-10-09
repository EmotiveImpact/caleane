import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {writeSetting} from '../studio-commerce.mjs';
import {defaultTaxRate,isVatDocument,isVatRegistered,showsTax,taxLabel,vatShare} from '../src/lib/vat.js';
import {invoicePageHtml,invoiceLayouts,sampleInvoice} from '../src/lib/invoice-design.js';
import {invoiceDocumentHtml} from '../src/lib/document-format.js';
import {financeReport,monthlyReportCSV} from '../src/lib/finance-report.js';

const origin='http://127.0.0.1:4320';
const addDays=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);

test('VAT settings: older settings keep their rate, registered studios default to 20%',()=>{
 assert.equal(isVatRegistered({taxRate:20}),true);
 assert.equal(isVatRegistered({taxRate:0,taxRegistration:'GB1'}),true);
 assert.equal(isVatRegistered({taxRate:0}),false);
 assert.equal(isVatRegistered({vatRegistered:false,taxRate:20}),false);
 assert.equal(defaultTaxRate({vatRegistered:true,taxRate:0}),20);
 assert.equal(defaultTaxRate({vatRegistered:true,taxRate:5}),5);
 assert.equal(defaultTaxRate({vatRegistered:false,taxRate:20}),0);
 assert.equal(defaultTaxRate({taxRate:17.5}),17.5);
 assert.equal(isVatDocument({vatRegistered:false},'GBP'),false);
 assert.equal(isVatDocument({},'GBP'),true);
 assert.equal(isVatDocument({},'USD'),false);
 assert.equal(showsTax(0,0),false);assert.equal(taxLabel(20,true),'VAT (20%)');assert.equal(taxLabel(8,false),'Tax (8%)');
 // A £1,200 invoice with £200 VAT, a £20 tip and a £120 credit note: the tip carries no VAT.
 const share=vatShare({amountMinor:120000,taxMinor:20000,creditedMinor:12000,dueMinor:110000});
 assert.equal(Math.round(110000*share),18000);
});

test('invoices say VAT with the VAT number in all six designs, and hide a 0% tax line',()=>{
 const base={number:'INV-1',kind:'Deposit',status:'Issued',currency:'GBP',amountMinor:12000,netMinor:10000,taxMinor:2000,taxRate:20,issuedAt:'2026-10-05',dueDate:'2026-10-19'};
 for(const [layout] of invoiceLayouts){
  const html=invoicePageHtml({...base,snapshot:{sellerName:'Studio',taxRegistration:'GB123456789',vatRegistered:true}},{design:{layout}});
  assert.match(html,/VAT \(20%\)/,layout);assert.match(html,/VAT no\. GB123456789/,layout);assert.doesNotMatch(html,/Tax \(/,layout);
  const none=invoicePageHtml({...base,amountMinor:10000,taxMinor:0,taxRate:0,snapshot:{sellerName:'Studio',vatRegistered:false}},{design:{layout}});
  assert.doesNotMatch(none,/Tax \(|VAT \(/,layout);
 }
 // An invoice issued before the setting existed still shows its rate.
 assert.match(invoicePageHtml({...base,snapshot:{sellerName:'Studio'}}),/VAT \(20%\)/);
 assert.match(invoiceDocumentHtml({...base,estimateVersion:1,snapshot:{taxRegistration:'GB9'}}),/VAT \(20%\).*/);
 assert.doesNotMatch(invoicePageHtml(sampleInvoice({name:'Studio'},{vatRegistered:false,taxRate:0}).invoice),/Tax \(|VAT \(/);
 assert.match(invoicePageHtml(sampleInvoice({name:'Studio'},{vatRegistered:true,taxRate:20,taxRegistration:'GB1'}).invoice),/VAT \(20%\)/);
});

test('reports and project profit leave VAT out of income and show it separately',()=>{
 // The audit case: £580 collected on a 20% VAT invoice, £96.67 of it VAT.
 const invoices=[{id:'a',projectId:'p1',currency:'GBP',amountMinor:58000,netMinor:48333,taxMinor:9667,taxRate:20,dueMinor:58000,paidMinor:58000,status:'Paid',issuedAt:'2026-09-01T10:00:00Z',payments:[{amountMinor:58000,receivedAt:'2026-09-02'}],refunds:[]}];
 const expenses=[{projectId:'p1',spentOn:'2026-09-03',category:'Materials',amountMinor:12000,vatMinor:2000,currency:'GBP'}];
 const report=financeReport({invoices,expenses,projects:[{id:'p1',title:'Anniversary',client:'Ada'}],period:'12m',today:'2026-10-05'}),gbp=report.byCurrency[0];
 assert.equal(gbp.totals.collectedMinor,48333);assert.equal(gbp.totals.vatCollectedMinor,9667);
 assert.equal(gbp.totals.costsMinor,10000);assert.equal(gbp.totals.vatPaidMinor,2000);assert.equal(gbp.totals.vatDueMinor,7667);
 assert.equal(gbp.totals.profitMinor,38333);assert.equal(gbp.totals.invoicedMinor,48333);
 const row=gbp.projects[0];assert.deepEqual([row.collectedMinor,row.vatCollectedMinor,row.costsMinor,row.profitMinor,row.marginPercent],[48333,9667,10000,38333,79]);
 assert.match(monthlyReportCSV(gbp),/"VAT collected","VAT on costs"/);
 assert.match(monthlyReportCSV(gbp),/"2026-09","GBP","483.33","483.33","100.00","383.33","96.67","20.00"/);
});

test('studio VAT settings drive new estimates, invoice snapshots and cost VAT',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-vat-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me')).data.studios[0],q=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+q)).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 // Settings saved before the switch: a 20% usual rate reads as VAT registered.
 writeSetting(ws.db,studio.id,'billing_defaults',{currency:'GBP',taxRate:20,sellerAddress:'1 Studio Lane',sellerContact:'hi@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:100,due:{type:'on_issue',days:0}}]});
 let defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 assert.equal(defaults.vatRegistered,true);assert.equal(defaults.taxRate,20);
 // Switching VAT on with no rate uses 20%.
 defaults=(await call('/api/billing-defaults'+q,'POST',{...defaults,vatRegistered:true,taxRate:undefined,taxRegistration:'GB123456789'})).data.defaults;
 assert.equal(defaults.taxRate,20);assert.equal(defaults.taxRegistration,'GB123456789');
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...defaults,vatRegistered:'yes'})).status,400);
 // A new estimate with no rate given starts at the studio's VAT rate.
 let estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope',currency:'GBP',items:[{title:'Styling',quantity:1,unitAmount:100000}]})).data.project.estimates.at(-1);
 assert.equal(estimate.taxRate,20);assert.equal(estimate.tax,20000);assert.equal(estimate.vatRegistered,true);
 await call(`/api/projects/${project.id}/estimate-decision${q}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
 const issued=await call(`/api/projects/${project.id}/invoices${q}`,'POST',{estimateId:estimate.id,kind:'Full',dueDate:addDays(7),supplyDate:addDays(30),customerAddress:'2 Elm Row'});
 assert.equal(issued.status,201);assert.equal(issued.data.invoice.snapshot.vatRegistered,true);assert.equal(issued.data.invoice.snapshot.taxRegistration,'GB123456789');
 // Switching VAT off: new estimates have no tax.
 await call('/api/billing-defaults'+q,'POST',{...defaults,vatRegistered:false,taxRate:0});
 estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope 2',currency:'GBP',items:[{title:'Styling',quantity:1,unitAmount:100000}]})).data.project.estimates.at(-1);
 assert.equal(estimate.taxRate,0);assert.equal(estimate.vatRegistered,false);
 // Costs record the VAT paid, which must be less than the amount.
 const cost=await call('/api/expenses'+q,'POST',{action:'create',description:'Flowers',spentOn:'2026-09-12',amountMinor:12000,vatMinor:2000,currency:'GBP',category:'Materials',projectId:project.id});
 assert.equal(cost.status,201);assert.equal(cost.data.expense.vatMinor,2000);
 assert.equal((await call('/api/expenses'+q,'POST',{action:'create',description:'Bad',spentOn:'2026-09-12',amountMinor:1000,vatMinor:1000,currency:'GBP',category:'Materials'})).status,400);
 const report=(await call(`/api/finance-report${q}&period=12m&today=2026-10-05`)).data.report.byCurrency[0];
 assert.equal(report.totals.vatPaidMinor,2000);assert.equal(report.totals.costsMinor,10000);
});
