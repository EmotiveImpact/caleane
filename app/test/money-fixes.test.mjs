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

test('the client can say they have paid, and recording the payment sends them a receipt',async t=>{
 const {call,q,issue,invoices}=await workspace(t);
 const invoice=(await call(invoices+q,'POST',{...issue,quick:true,kind:'Full',label:'Extra hours',currency:'GBP',taxRate:0,items:[{title:'Styling',quantity:1,unitAmount:27000}]})).data.invoice;
 const notice=`${invoices}/${invoice.id}/paid-notice${q}`;
 assert.equal((await call(notice,'POST',{paidOn:today(),method:'bank_transfer'})).status,403,'the studio does not tell itself');
 assert.equal((await call(notice,'POST',{paidOn:'2999-01-01',method:'bank_transfer'},'client')).status,400);
 let response=await call(notice,'POST',{paidOn:today(),method:'bank_transfer',reference:'AMELIA-EXTRA'},'client');
 assert.equal(response.status,200);
 assert.deepEqual([response.data.invoice.paidNotice.method,response.data.invoice.paidNotice.reference,response.data.invoice.status,response.data.invoice.balanceMinor],['bank_transfer','AMELIA-EXTRA','Issued',27000]);
 assert.equal((await call(notice,'POST',{paidOn:today(),method:'bank_transfer'},'client')).status,409);
 const ownerFeed=(await call('/api/notifications'+q)).data;
 assert.ok(JSON.stringify(ownerFeed).includes(`says they paid invoice ${invoice.number}`),'the studio is told');
 assert.equal((await call(`${invoices}/${invoice.id}${q}`)).data.invoice.paidNotice.paidOn,today());
 response=await call(`${invoices}/${invoice.id}/payments${q}`,'POST',{amountMinor:27000,method:'bank_transfer',reference:'AMELIA-EXTRA',receivedAt:today()});
 assert.equal(response.data.invoice.status,'Paid');assert.equal(response.data.invoice.paidNotice,null);
 const clientFeed=(await call('/api/notifications'+q,'GET',undefined,'client')).data;
 assert.ok(JSON.stringify(clientFeed).includes(`Payment of £270.00 received for invoice ${invoice.number}`),'the client gets a receipt');
 assert.equal((await call(notice,'POST',{paidOn:today(),method:'bank_transfer'},'client')).status,409,'nothing left to pay');
});

test('a plan payment can carry a discount, and a plan can issue its own payments when they fall due',async t=>{
 const {ws,call,studio,q,project,issue,confirmedEstimate,invoices}=await workspace(t);
 await confirmedEstimate();
 const plan=`${invoices}/plan${q}`,client=ws.db.prepare('SELECT id FROM users WHERE email=?').get('amelia@example.test').id;
 const [deposit,balance]=(await call(plan,'POST',{action:'create'})).data.plan.steps;
 assert.equal((await call(plan,'POST',{action:'auto-issue',on:true},'client')).status,403);
 // With nothing saved in Settings the deposit cannot go out on its own, so the studio gets a task and a notice instead.
 let response=await call(plan,'POST',{action:'auto-issue',on:true});
 assert.equal(response.status,200);assert.deepEqual(response.data.invoices,[]);assert.ok(response.data.plan.autoIssue.since);
 assert.equal(response.data.plan.steps[0].autoBlocked.reason,'Automatic issuing needs your studio address, your studio contact, payment instructions and the client billing address.');
 assert.equal((await call(plan,'GET',undefined,'client')).data.plan.steps[0].autoBlocked,undefined,'the client never sees why');
 assert.match(ws.db.prepare("SELECT detail FROM crm_tasks WHERE studio_id=? AND title LIKE 'Issue the deposit invoice%'").get(studio).detail,/needs your studio address/);
 assert.deepEqual(ws.db.prepare('SELECT user_id FROM notification_events WHERE source_key=?').all(`plan-auto:${deposit.id}`).map(row=>row.user_id).includes(client),false);
 assert.equal(ws.db.prepare('SELECT COUNT(*) AS n FROM notification_events WHERE source_key=?').get(`plan-auto:${deposit.id}`).n,1);
 // Issued by hand with 10% off. The plan still counts the full deposit towards the project.
 response=await call(plan,'POST',{action:'issue',stepId:deposit.id,...issue,discount:{type:'percent',percent:10,reason:'Returning client'}});
 assert.equal(response.status,201);
 const first=response.data.invoice;
 assert.deepEqual([first.discountLabel,first.amountMinor],['Returning client · 10% off',32400]);
 assert.equal(response.data.plan.steps[0].autoBlocked,undefined);
 const told=ws.db.prepare("SELECT title FROM notification_events WHERE user_id=? AND title=?").get(client,`Issued invoice ${first.number}`);
 assert.ok(told,'the client is told a new invoice is waiting');
 // With the studio details saved, the balance goes out on its own once it is within the payment terms.
 const defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 await call('/api/billing-defaults'+q,'POST',{...defaults,sellerAddress:issue.sellerAddress,sellerContact:issue.sellerContact,paymentInstructions:issue.paymentInstructions,paymentTermsDays:14});
 assert.equal(balance.dueDate,'2027-05-29');
 assert.deepEqual(await ws.issueDuePlanSteps({today:'2027-05-14'}),[],'15 days before is outside 14 day terms');
 const [auto]=await ws.issueDuePlanSteps({today:'2027-05-15'});
 assert.deepEqual([auto.kind,auto.due_date,auto.discount_label,auto.amount_minor,auto.issued_by],['Balance','2027-05-29','Returning client · 10% off',75600,'NAY Studio']);
 assert.equal(JSON.parse(auto.snapshot).customerAddress,issue.customerAddress);
 const activity=JSON.parse(ws.db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data).activity[0];
 assert.equal(activity.text,`Issued invoice ${auto.number} automatically from the payment plan`);
 assert.deepEqual(ws.db.prepare('SELECT user_id FROM notification_events WHERE source_key=?').all(`event:${activity.id}`).length,2,'the owner and the client are both told');
 const after=(await call(plan)).data.plan;
 assert.deepEqual(after.steps.map(step=>step.invoice?.number),[first.number,auto.number]);
 assert.deepEqual(await ws.issueDuePlanSteps({today:'2027-05-20'}),[],'nothing is issued twice');
 assert.equal((await call(plan,'POST',{action:'auto-issue',on:false})).data.plan.autoIssue,null);
});

test('lines can be zero-rated, exempt or at the reduced rate, and the invoice shows VAT at each rate',async t=>{
 const {call,q,issue,confirmedEstimate,invoices}=await workspace(t);
 const {invoicePageHtml}=await import('../src/lib/invoice-design.js');
 const defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 await call('/api/billing-defaults'+q,'POST',{...defaults,vatRegistered:true,taxRate:20,taxRegistration:'GB123456789'});
 // A price list item keeps its own rate.
 const saved=(await call('/api/catalogue'+q,'POST',{action:'create',item:{name:'Printed menus',unitAmount:300,currency:'GBP',unit:'item',exempt:false,taxRate:0}})).data.items.find(item=>item.name==='Printed menus');
 assert.equal(saved.taxRate,0);
 assert.equal((await call('/api/catalogue'+q,'POST',{action:'create',item:{name:'Bad',unitAmount:300,currency:'GBP',taxRate:120}})).status,400);
 const items=[{title:'Styling',quantity:1,unitAmount:19500},{title:'Printed menus',quantity:100,unitAmount:300,taxRate:0},{title:'Venue hire',quantity:1,unitAmount:13500,exempt:true},{title:'Fuel',quantity:1,unitAmount:3000,taxRate:5}];
 const estimate=await confirmedEstimate({items});
 assert.deepEqual([estimate.subtotal,estimate.tax,estimate.total],[66000,4050,70050],'20% of £195, 5% of £30, nothing on the rest');
 assert.deepEqual(estimate.items.slice(1).map(item=>[item.taxRate,item.exempt]),[[0,undefined],[undefined,true],[5,undefined]]);
 // A deposit takes its share of each rate, and the parts add up to the invoice exactly.
 const deposit=(await call(invoices+q,'POST',{...issue,estimateId:estimate.id,kind:'Deposit',amountMinor:20000})).data.invoice;
 const parts=deposit.snapshot.vatBreakdown;
 assert.deepEqual(parts.map(part=>[part.rate,part.exempt]),[[20,false],[5,false],[0,false],[0,true]]);
 assert.equal(parts.reduce((sum,part)=>sum+part.netMinor,0),deposit.netMinor);
 assert.equal(parts.reduce((sum,part)=>sum+part.taxMinor,0),deposit.taxMinor);
 const page=invoicePageHtml(deposit,{estimate});
 assert.match(page,/VAT at 20% on £[\d.,]+/);assert.match(page,/Zero-rated on £/);assert.match(page,/Exempt on £/);assert.match(page,/VAT at 5% on £/);
 assert.match(page,/Project total including VAT/);
 // A quick invoice works the same way, and one all at a rate other than its own still names it.
 const quick=(await call(invoices+q,'POST',{...issue,quick:true,kind:'Full',label:'Extras',currency:'GBP',taxRate:20,items:[{title:'Hire',quantity:1,unitAmount:10000},{title:'Booklet',quantity:2,unitAmount:500,taxRate:0}]})).data.invoice;
 assert.deepEqual([quick.netMinor,quick.taxMinor],[11000,2000]);
 assert.deepEqual(quick.snapshot.lines.items[1],{title:'Booklet',quantity:2,unitAmount:500,taxRate:0});
 const exempt=(await call(invoices+q,'POST',{...issue,quick:true,kind:'Full',label:'Venue',currency:'GBP',taxRate:20,items:[{title:'Venue hire',quantity:1,unitAmount:5000,exempt:true}]})).data.invoice;
 assert.deepEqual([exempt.taxMinor,exempt.snapshot.vatBreakdown],[0,[{rate:0,exempt:true,netMinor:5000,taxMinor:0}]]);
 assert.match(invoicePageHtml(exempt,{}),/Exempt on £50\.00/);
 assert.doesNotMatch(invoicePageHtml(exempt,{}),/VAT \(20%\)/);
 assert.equal((await call(invoices+q,'POST',{...issue,quick:true,kind:'Full',label:'Bad',currency:'GBP',items:[{title:'Hire',quantity:1,unitAmount:100,taxRate:'zero'}]})).status,400);
});

test('a plan on a returning client’s new project issues itself with the address from their earlier invoice',async t=>{
 const {call,q,issue,invoices}=await workspace(t);
 const defaults=(await call('/api/billing-defaults'+q)).data.defaults;
 await call('/api/billing-defaults'+q,'POST',{...defaults,sellerAddress:issue.sellerAddress,sellerContact:issue.sellerContact,paymentInstructions:issue.paymentInstructions});
 assert.equal((await call(invoices+q,'POST',{...issue,quick:true,kind:'Full',label:'Extras',currency:'GBP',items:[{title:'Hire',quantity:1,unitAmount:5000}]})).status,201);
 const {project}=(await call('/api/projects'+q,'POST',{name:'Amelia Taylor',email:'amelia@example.test',occasion:'Anniversary dinner',date:'2027-03-14',venue:'The Garden Room',vision:'Dinner for twelve.',colours:['Ivory'],customColours:'',pinterest:'',budget:''})).data;
 // New projects stay private until shared, so share it before the client confirms.
 await call(`/api/projects/${project.id}/invite${q}`,'POST',{});
 const estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Dinner',currency:'GBP',taxRate:20,items:[{title:'Flowers',quantity:1,unitAmount:100000}]})).data.project.estimates.at(-1);
 await call(`/api/projects/${project.id}/estimate-decision${q}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
 const plan=`/api/projects/${project.id}/invoices/plan${q}`;
 await call(plan,'POST',{action:'create'});
 const response=await call(plan,'POST',{action:'auto-issue',on:true});
 assert.equal(response.data.invoices.length,1,response.data.plan?.steps?.[0]?.autoBlocked?.reason);
 assert.equal(response.data.invoices[0].snapshot.customerAddress,issue.customerAddress);
});
