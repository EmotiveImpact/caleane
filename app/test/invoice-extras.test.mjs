import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {applyLateFees,dueLateFees} from '../invoice-extras.mjs';
import {runAllReminders} from '../reminders.mjs';
import {discountFor,invoiceFigures,lateFeeShort,lateFeeTerms} from '../src/lib/invoice-charges.js';

const origin='http://127.0.0.1:4320';
const addDays=(day,days)=>new Date(Date.parse(day+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

test('a discount comes off the price before tax and keeps the tax in proportion',()=>{
 assert.deepEqual(discountFor({type:'percent',percent:10},{shareMinor:12000,shareNetMinor:10000}),{netMinor:1000,grossMinor:1200,label:'10% off'});
 assert.deepEqual(discountFor({type:'amount',amountMinor:2500,reason:'Returning client'},{shareMinor:12000,shareNetMinor:10000}),{netMinor:2500,grossMinor:3000,label:'Returning client'});
 assert.equal(discountFor(null,{shareMinor:12000,shareNetMinor:10000}),null);
 assert.throws(()=>discountFor({type:'percent',percent:100},{shareMinor:12000,shareNetMinor:10000}),/below 100/);
 assert.throws(()=>discountFor({type:'amount',amountMinor:10000},{shareMinor:12000,shareNetMinor:10000}),/below the amount before tax/);
 assert.match(lateFeeTerms({type:'fixed',amountMinor:2500,percent:5,afterDays:7},'GBP'),/£25\.00 is added once, if this invoice is still unpaid 7 days after the due date/);
});

test('the issue form summary uses the same figures the server saves',()=>{
 // The deposit from the test below: a 10000 share, 8333 of it before tax, with 10.00 off before tax.
 const discount=discountFor({type:'amount',amountMinor:1000},{shareMinor:10000,shareNetMinor:8333});
 assert.deepEqual(invoiceFigures({shareMinor:10000,shareNetMinor:8333,discount}),{priceMinor:10000,priceNetMinor:8333,discountMinor:1200,discountNetMinor:1000,netMinor:7333,taxMinor:1467,amountMinor:8800});
 assert.deepEqual(invoiceFigures({shareMinor:12000,shareNetMinor:10000}),{priceMinor:12000,priceNetMinor:10000,discountMinor:0,discountNetMinor:0,netMinor:10000,taxMinor:2000,amountMinor:12000});
 assert.equal(lateFeeShort({type:'fixed',amountMinor:2500,percent:5,afterDays:7},'GBP'),'£25.00, 7 days after the due date');
 assert.equal(lateFeeShort({type:'percent',amountMinor:2500,percent:5,afterDays:1},'GBP'),'5% of the unpaid balance, 1 day after the due date');
 assert.equal(lateFeeShort(null,'GBP'),'');
});

test('discounts, late fees and tips on issued invoices',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-invoice-extras-'));
 const workspace=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>workspace.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${workspace.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
  await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id,suffix=`?studio=${studio}`;
  const project=(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail==='amelia@example.test');
  const route=`/api/projects/${project.id}/invoices`,today=new Date().toISOString().slice(0,10);

  // Late fees and tips are off until the studio turns them on.
  let defaults=(await call('/api/billing-defaults'+suffix,'GET',undefined,'owner')).data.defaults;
  assert.equal(defaults.lateFee.enabled,false);assert.equal(defaults.tips.enabled,false);
  assert.equal((await call('/api/billing-defaults'+suffix,'POST',{...defaults,lateFee:{...defaults.lateFee,enabled:true,percent:60}},'owner')).status,400);
  defaults=(await call('/api/billing-defaults'+suffix,'POST',{...defaults,lateFee:{enabled:true,type:'fixed',amountMinor:2500,percent:5,afterDays:7},tips:{enabled:true}},'owner')).data.defaults;
  assert.equal(defaults.lateFee.enabled,true);assert.equal(defaults.tips.enabled,true);

  let response=await call(`/api/projects/${project.id}/estimates${suffix}`,'POST',{title:'Project scope',currency:'GBP',items:[{title:'Creative direction',quantity:2,unitAmount:12550}],taxRate:20},'owner');
  const estimate=response.data.project.estimates.at(-1);
  await call(`/api/projects/${project.id}/estimate-decision${suffix}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
  const issue={estimateId:estimate.id,dueDate:today,supplyDate:today,sellerAddress:'Studio Lane, London',sellerContact:'studio@example.test',customerAddress:'Client Street, London',paymentInstructions:'Bank transfer.'};

  assert.equal((await call(route+suffix,'POST',{...issue,kind:'Deposit',amountMinor:10000,discount:{type:'amount',amountMinor:9000}},'owner')).status,400);
  response=await call(route+suffix,'POST',{...issue,kind:'Deposit',amountMinor:10000,discount:{type:'amount',amountMinor:1000,reason:'Returning client'}},'owner');
  assert.equal(response.status,201);
  const deposit=response.data.invoice;
  // 30120 total, 25100 before tax. The deposit's share is 10000, of which 8333 is before tax.
  assert.deepEqual([deposit.shareMinor,deposit.discountNetMinor,deposit.discountMinor,deposit.amountMinor,deposit.netMinor,deposit.taxMinor],[10000,1000,1200,8800,7333,1467]);
  assert.equal(deposit.discountLabel,'Returning client');
  assert.equal(deposit.tipsAllowed,false,'deposits never take tips');
  assert.deepEqual(deposit.lateFeeRule,{type:'fixed',amountMinor:2500,percent:5,afterDays:7});
  assert.equal(deposit.balanceMinor,8800);

  // The discounted deposit still covers its full share, so the balance is the rest of the estimate.
  response=await call(route+suffix,'POST',{...issue,kind:'Balance',lateFee:false},'owner');
  assert.equal(response.status,201);
  const balance=response.data.invoice;
  assert.deepEqual([balance.amountMinor,balance.netMinor,balance.taxMinor],[20120,16767,3353]);
  assert.equal(balance.lateFeeRule,null,'the owner left the late fee off this invoice');
  assert.equal(balance.tipsAllowed,true);
  assert.equal((await call(route+suffix,'POST',{...issue,kind:'Balance'},'owner')).status,409);

  // Only the client chooses a tip, and only on an invoice that takes one.
  assert.equal((await call(`${route}/${balance.id}/tip${suffix}`,'POST',{amountMinor:2000},'owner')).status,403);
  assert.equal((await call(`${route}/${deposit.id}/tip${suffix}`,'POST',{amountMinor:2000},'client')).status,409);
  assert.equal((await call(`${route}/${balance.id}/tip${suffix}`,'POST',{amountMinor:-5},'client')).status,400);
  response=await call(`${route}/${balance.id}/tip${suffix}`,'POST',{amountMinor:2000},'client');
  assert.equal(response.status,200);
  assert.equal(response.data.invoice.tipMinor,2000);assert.equal(response.data.invoice.balanceMinor,22120);
  response=await call(`${route}/${balance.id}/payments${suffix}`,'POST',{amountMinor:21000,method:'bank_transfer',reference:'BAL',receivedAt:today},'owner');
  assert.equal(response.status,200);assert.equal(response.data.invoice.status,'Partially paid');
  assert.equal((await call(`${route}/${balance.id}/tip${suffix}`,'POST',{amountMinor:0},'client')).status,409,'the tip cannot drop below what is already paid');
  response=await call(`${route}/${balance.id}/tip${suffix}`,'POST',{amountMinor:1000},'client');
  assert.equal(response.data.invoice.balanceMinor,120);

  // Late fees wait for the grace period, then apply once, without messaging anyone.
  const {db}=workspace,messages=()=>db.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,before=messages();
  assert.deepEqual(dueLateFees(db,studio,addDays(today,6)),[]);
  assert.equal(applyLateFees(db,{studioId:studio,today:addDays(today,7)}).length,1);
  assert.equal(applyLateFees(db,{studioId:studio,today:addDays(today,8)}).length,0);
  assert.equal(messages(),before);
  response=await call(`${route}/${deposit.id}${suffix}`,'GET',undefined,'client');
  assert.equal(response.data.invoice.lateFeeMinor,2500);assert.equal(response.data.invoice.balanceMinor,11300);
  assert.equal((await call(`${route}/${deposit.id}/late-fee${suffix}`,'POST',{action:'waive'},'client')).status,403);
  response=await call(`${route}/${deposit.id}/late-fee${suffix}`,'POST',{action:'waive'},'owner');
  assert.equal(response.status,200);assert.equal(response.data.invoice.lateFeeMinor,0);assert.equal(response.data.invoice.balanceMinor,8800);
  assert.ok(response.data.invoice.charges[0].waivedAt);
  assert.equal((await call(`${route}/${deposit.id}/late-fee${suffix}`,'POST',{action:'waive'},'owner')).status,409);
  assert.equal(applyLateFees(db,{studioId:studio,today:addDays(today,30)}).length,0,'a waived fee is not added again');

  // Turning late fees off stops new ones, even on invoices issued with the rule.
  response=await call(route+suffix,'GET',undefined,'owner');
  db.prepare("DELETE FROM invoice_charges WHERE kind='late_fee'").run();
  defaults=(await call('/api/billing-defaults'+suffix,'POST',{...defaults,lateFee:{...defaults.lateFee,enabled:false}},'owner')).data.defaults;
  runAllReminders(db,{today:addDays(today,30)});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM invoice_charges WHERE kind='late_fee'").get().n,0);
 }finally{
  await new Promise(resolve=>workspace.server.close(resolve));workspace.db.close();await rm(dir,{recursive:true,force:true});
 }
});
