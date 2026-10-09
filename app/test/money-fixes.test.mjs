import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {getProjectOperations} from '../studio-operations.mjs';

const origin='http://127.0.0.1:4320';
const today=()=>new Date().toISOString().slice(0,10);

// A sample workspace with the studio owner and Amelia (the client approver) signed in.
async function workspace(t,options={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-money-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0,...options});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];
  const type=response.headers.get('content-type')||'';
  return {status:response.status,data:type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};
 }
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me')).data.studios[0].id,q=`?studio=${studio}`;
 const project=(await call('/api/projects'+q)).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 const issue={dueDate:today(),supplyDate:today(),sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',customerAddress:'2 Elm Row, London',paymentInstructions:'Bank transfer.'};
 async function confirmedEstimate(body={}){
  const estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope',currency:'GBP',taxRate:20,items:[{title:'Styling',quantity:1,unitAmount:100000}],...body})).data.project.estimates.at(-1);
  await call(`/api/projects/${project.id}/estimate-decision${q}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
  return estimate;
 }
 return {ws,call,studio,q,project,issue,confirmedEstimate,invoices:`/api/projects/${project.id}/invoices`};
}

test('studios can price and invoice in currencies beyond GBP, EUR and USD',async t=>{
 const {call,q,project,issue,confirmedEstimate,invoices}=await workspace(t);
 const defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...defaults,currency:'CHF'})).data.defaults.currency,'CHF');
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...defaults,currency:'XYZ'})).status,400);
 assert.equal((await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope',currency:'XYZ',items:[{title:'Styling',quantity:1,unitAmount:100}]})).status,400);
 const estimate=await confirmedEstimate({currency:'AUD'});
 const response=await call(invoices+q,'POST',{...issue,estimateId:estimate.id,kind:'Full'});
 assert.equal(response.status,201);assert.equal(response.data.invoice.currency,'AUD');
 assert.equal((await call('/api/catalogue'+q,'POST',{action:'create',item:{name:'Styling hour',unitAmount:9000,currency:'NZD',unit:'hour',category:'Styling'}})).status<300,true);
});

test('a quick invoice bills its own lines without an estimate and leaves the estimate share alone',async t=>{
 const {call,q,issue,confirmedEstimate,invoices}=await workspace(t);
 const quick={...issue,quick:true,kind:'Full',label:'Rush fee',currency:'EUR',taxRate:20,items:[{title:'Styling hours',quantity:3,unitAmount:8000,unit:'hour'},{title:'Courier',quantity:1,unitAmount:4000}]};
 assert.equal((await call(invoices+q,'POST',{...quick,label:''})).status,400);
 assert.equal((await call(invoices+q,'POST',{...quick,items:[{title:'Nothing',quantity:1,unitAmount:0}]})).status,400);
 assert.equal((await call(invoices+q,'POST',{...quick,kind:'Balance'})).status,400);
 let response=await call(invoices+q,'POST',quick);
 assert.equal(response.status,201);
 const extra=response.data.invoice;
 assert.deepEqual([extra.estimateId,extra.currency,extra.netMinor,extra.taxMinor,extra.amountMinor,extra.label],['','EUR',28000,5600,33600,'Rush fee']);
 assert.deepEqual(extra.snapshot.lines.items[0],{title:'Styling hours',quantity:3,unitAmount:8000,unit:'hour'});
 assert.equal(extra.snapshot.estimate,undefined);
 // The estimate can still be invoiced in full afterwards, because the quick invoice is not part of it.
 const estimate=await confirmedEstimate();
 response=await call(invoices+q,'POST',{...issue,estimateId:estimate.id,kind:'Full'});
 assert.equal(response.status,201);assert.equal(response.data.invoice.amountMinor,120000);
 response=await call(`${invoices}/${extra.id}/pdf${q}`);
 assert.equal(response.status,200);assert.equal(response.data.subarray(0,5).toString(),'%PDF-');
});

test('Delivery sees a paid deposit on a project that has no estimate',async t=>{
 const {ws,call,studio,q,project,issue,invoices}=await workspace(t);
 const owner=ws.db.prepare("SELECT id FROM users WHERE email='studio@example.test'").get().id;
 const deposit=()=>getProjectOperations(ws.db,{studioId:studio,projectId:project.id,userId:owner}).booking.deposit;
 assert.equal((project.estimates||[]).length,0);
 assert.equal(deposit().status,'No deposit invoice');
 const invoice=(await call(invoices+q,'POST',{...issue,quick:true,kind:'Deposit',label:'Booking deposit',currency:'GBP',taxRate:0,items:[{title:'Deposit to hold the date',quantity:1,unitAmount:50000}]})).data.invoice;
 assert.equal(deposit().status,'Unpaid');
 await call(`${invoices}/${invoice.id}/payments${q}`,'POST',{amountMinor:50000,method:'bank_transfer',reference:'DEP',receivedAt:today()});
 assert.deepEqual([deposit().status,deposit().invoiceId,deposit().paidMinor],['Paid',invoice.id,50000]);
});

test('estimate lines keep how a price list item is charged',async t=>{
 const {call,q,project}=await workspace(t);
 const saved=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope',currency:'EUR',taxRate:0,items:[{title:'Styling hours',quantity:3,unitAmount:8000,unit:'hour'},{title:'Arch',quantity:1,unitAmount:50000,unit:'each'},{title:'Odd',quantity:1,unitAmount:100,unit:'fortnight'}]})).data.project.estimates.at(-1);
 assert.deepEqual(saved.items.map(item=>item.unit),['hour',undefined,undefined]);
});

test('the studio chooses its invoice prefix, whether the year is included and the next number',async t=>{
 const {call,q,issue,invoices}=await workspace(t);
 const quick={...issue,quick:true,kind:'Full',label:'Extra hours',currency:'GBP',taxRate:0,items:[{title:'Styling',quantity:1,unitAmount:10000}]};
 let defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 assert.deepEqual([defaults.invoicePrefix,defaults.invoiceYear,defaults.nextInvoiceNumber],['INV',true,1]);
 assert.match((await call(invoices+q,'POST',quick)).data.invoice.number,new RegExp(`^INV-${new Date().getFullYear()}-0001$`));
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...defaults,invoicePrefix:'NAY '})).status,400);
 defaults=(await call('/api/billing-defaults'+q,'POST',{...defaults,invoicePrefix:'NAY',invoiceYear:false,nextInvoiceNumber:42})).data.defaults;
 assert.deepEqual([defaults.invoicePrefix,defaults.invoiceYear,defaults.nextInvoiceNumber],['NAY',false,42]);
 assert.equal((await call(invoices+q,'POST',quick)).data.invoice.number,'NAY-0042');
 assert.equal((await call(invoices+q,'POST',quick)).data.invoice.number,'NAY-0043');
 // Saving other settings leaves the counter where it is; moving it back skips numbers already used.
 const {nextInvoiceNumber:_skip,...rest}=(await call('/api/billing-defaults'+q)).data.defaults;
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...rest,paymentTermsDays:30})).data.defaults.nextInvoiceNumber,44);
 await call('/api/billing-defaults'+q,'POST',{...rest,nextInvoiceNumber:42});
 assert.equal((await call(invoices+q,'POST',quick)).data.invoice.number,'NAY-0044');
});

test('a fixed late fee keeps its currency and never lands on an invoice in another one',async t=>{
 const {ws,call,studio,q,issue,invoices}=await workspace(t);
 const {applyLateFees}=await import('../invoice-extras.mjs');
 const defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 assert.equal((await call('/api/billing-defaults'+q,'POST',{...defaults,lateFee:{enabled:true,type:'fixed',amountMinor:2500,currency:'XYZ',percent:5,afterDays:1}})).status,400);
 const saved=(await call('/api/billing-defaults'+q,'POST',{...defaults,lateFee:{enabled:true,type:'fixed',amountMinor:2500,percent:5,afterDays:1}})).data.defaults;
 assert.equal(saved.lateFee.currency,'GBP','a fee saved without a currency takes the usual currency');
 const line=currency=>({...issue,quick:true,kind:'Full',label:'Extra hours',currency,taxRate:0,items:[{title:'Styling',quantity:1,unitAmount:10000}]});
 const pounds=(await call(invoices+q,'POST',line('GBP'))).data.invoice,euros=(await call(invoices+q,'POST',line('EUR'))).data.invoice;
 assert.deepEqual(pounds.lateFeeRule,{type:'fixed',amountMinor:2500,currency:'GBP',percent:5,afterDays:1});
 assert.equal(euros.lateFeeRule,null,'£25 is not added to a euro invoice as €25');
 // An invoice issued before fees had a currency, in euros, with the old pound rule.
 ws.db.prepare('UPDATE invoices SET late_fee_rule=? WHERE id=?').run(JSON.stringify({type:'fixed',amountMinor:2500,percent:5,afterDays:1}),euros.id);
 const later=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 assert.deepEqual(applyLateFees(ws.db,{studioId:studio,today:later}).map(fee=>fee.number),[pounds.number]);
 // A percentage fee suits every currency.
 await call('/api/billing-defaults'+q,'POST',{...saved,lateFee:{...saved.lateFee,type:'percent'}});
 assert.equal((await call(invoices+q,'POST',line('EUR'))).data.invoice.lateFeeRule.type,'percent');
});
