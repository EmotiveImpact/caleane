import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import {createWorkspace} from '../server.mjs';
import {connectStudioStripeAccount} from '../stripe-payments.mjs';

// Payment at booking and plan autopay, against a fake Stripe client. No real Stripe calls are made.
const origin='http://127.0.0.1:4320';
const account='acct_1234567890';
const secret='whsec_card_payments';
const verifier=new Stripe('sk_test_only_for_local_signature_tests');

function fakeStripe(){
 const calls=[],intents=[];let declineNext=false;
 const stripe={
  calls,intents,decline(){declineNext=true;},
  accounts:{async retrieve(id){return {id,charges_enabled:true};}},
  customers:{async create(params,options){calls.push({kind:'customer',params,options});return {id:'cus_test_123'};}},
  checkout:{sessions:{
   async create(params,options){calls.push({kind:'session',params,options});return {id:`cs_test_${calls.length}`,url:'https://checkout.stripe.com/c/pay/test',mode:params.mode};},
   async expire(id){return {id,status:'expired',payment_status:'unpaid'};},
   async retrieve(id){return {id,status:'open'};}}},
  setupIntents:{async retrieve(id){return {id,status:'succeeded',payment_method:{id:'pm_test_visa',card:{brand:'visa',last4:'4242'}}};}},
  paymentIntents:{async create(params,options){
   intents.push({params,options});
   if(declineNext){declineNext=false;throw Object.assign(new Error('Your card was declined.'),{type:'StripeCardError',raw:{payment_intent:{id:`pi_declined_${intents.length}`}}});}
   return {id:`pi_test_${intents.length}`,status:'succeeded',amount:params.amount,currency:params.currency};}},
  webhooks:verifier.webhooks
 };
 return stripe;
}

async function workspace(t,{collection=true}={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-card-payments-'));
 const stripe=fakeStripe();
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0,stripeClient:stripe,stripeWebhookSecret:secret,enableStripeCollection:collection});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who='',headers={}){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 async function webhook(event){
  const raw=JSON.stringify(event),signature=verifier.webhooks.generateTestHeaderString({payload:raw,secret});
  const response=await fetch(base+'/api/webhooks/stripe',{method:'POST',headers:{'Stripe-Signature':signature,'Content-Type':'text/plain'},body:raw});
  return {status:response.status,data:await response.json()};
 }
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0];
 const suffix=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 return {ws,stripe,call,webhook,studio,suffix,project};
}

const everyDay=Object.fromEntries([0,1,2,3,4,5,6].map(day=>[day,[{start:'09:00',end:'12:00'}]]));
function sessionEvent(id,type,session,extra={}){return {id,object:'event',type,account,created:Math.floor(Date.now()/1000),data:{object:{object:'checkout.session',...session,...extra}}};}

test('payment at booking is off by default, and a paid booking is confirmed only by the signed webhook',async t=>{
 const {ws,stripe,call,webhook,studio,suffix}=await workspace(t);
 let response=await call('/api/consultations'+suffix,'GET',undefined,'owner');
 assert.equal(response.data.settings.payment.required,false,'off by default');
 assert.equal(response.data.paymentsAvailable,false,'Stripe is not connected yet');
 const settings={...response.data.settings,enabled:true,minNoticeHours:0,horizonDays:14,weekly:everyDay};
 const paid={...settings,payment:{required:true,amountMinor:5000,currency:'GBP',label:'Booking fee'}};
 assert.equal((await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:paid},'owner')).status,409,'cannot ask for payment before Stripe is connected');

 await connectStudioStripeAccount(ws.db,stripe,{studioId:studio.id,stripeAccountId:account});
 assert.equal((await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:{...paid,payment:{...paid.payment,amountMinor:50}}},'owner')).status,400);
 response=await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:paid},'owner');
 assert.equal(response.status,200);assert.equal(response.data.settings.payment.required,true);

 const page=(await call(`/api/booking/${studio.slug}`)).data;
 assert.deepEqual(page.booking.payment,{amountMinor:5000,currency:'GBP',label:'Booking fee'});
 const slot=page.slots.at(-1),booking={name:'Priya Shah',email:'priya@example.test',start:slot};
 response=await call(`/api/booking/${studio.slug}`,'POST',booking,'',{'Idempotency-Key':'paid-booking-1'});
 assert.equal(response.status,201,JSON.stringify(response.data));
 assert.equal(response.data.status,'Awaiting payment');
 assert.equal(response.data.checkoutUrl,'https://checkout.stripe.com/c/pay/test');
 const bookingId=response.data.bookingId,session=stripe.calls.at(-1);
 assert.equal(session.options.stripeAccount,account);
 assert.equal(session.params.line_items[0].price_data.unit_amount,5000);
 assert.ok(session.params.expires_at-Date.now()/1000>=30*60,'Stripe needs at least 30 minutes');
 assert.ok(!(await call(`/api/booking/${studio.slug}`)).data.slots.includes(slot),'the time is held while the client pays');
 assert.equal(ws.db.prepare("SELECT COUNT(*) AS n FROM crm_tasks WHERE studio_id=? AND title LIKE '%Priya Shah%'").get(studio.id).n,0,'no follow-up until paid');
 // A retried request resumes the same Checkout page.
 response=await call(`/api/booking/${studio.slug}`,'POST',booking,'',{'Idempotency-Key':'paid-booking-1'});
 assert.equal(response.status,200);assert.equal(response.data.checkoutUrl,'https://checkout.stripe.com/c/pay/test');
 assert.equal(stripe.calls.filter(call=>call.kind==='session').length,1);

 const sessionData={id:`cs_test_${stripe.calls.indexOf(session)+1}`,mode:'payment',client_reference_id:bookingId,metadata:{kind:'booking',bookingId,studioId:studio.id},amount_total:5000,currency:'gbp',payment_status:'paid',payment_intent:'pi_booking_1'};
 assert.equal((await webhook(sessionEvent('evt_wrong_amount','checkout.session.completed',sessionData,{amount_total:100}))).status,409);
 assert.equal((await call(`/api/booking/${studio.slug}/status?booking=${bookingId}`)).data.status,'Awaiting payment');
 response=await webhook(sessionEvent('evt_booking_paid','checkout.session.completed',sessionData));
 assert.equal(response.status,200);assert.equal(response.data.result,'booked');
 assert.equal((await webhook(sessionEvent('evt_booking_paid','checkout.session.completed',sessionData))).data.duplicate,true);
 const status=(await call(`/api/booking/${studio.slug}/status?booking=${bookingId}`)).data;
 assert.equal(status.status,'Booked');assert.equal(status.payment.status,'paid');
 assert.equal(ws.db.prepare("SELECT COUNT(*) AS n FROM crm_tasks WHERE studio_id=? AND title LIKE '%Priya Shah%'").get(studio.id).n,1);
 const listed=(await call('/api/consultations'+suffix,'GET',undefined,'owner')).data.consultations.find(item=>item.id===bookingId);
 assert.equal(listed.payment.paymentIntentId,'pi_booking_1');

 // Leaving Stripe without paying releases the time straight away.
 const second=page.slots.at(-2);
 response=await call(`/api/booking/${studio.slug}`,'POST',{...booking,email:'sam@example.test',start:second},'',{'Idempotency-Key':'paid-booking-2'});
 assert.equal(response.data.status,'Awaiting payment');
 assert.ok(!(await call(`/api/booking/${studio.slug}`)).data.slots.includes(second));
 response=await call(`/api/booking/${studio.slug}/release`,'POST',{bookingId:response.data.bookingId});
 assert.equal(response.data.status,'Unpaid');
 assert.ok((await call(`/api/booking/${studio.slug}`)).data.slots.includes(second),'a released time opens again');
});

test('without Stripe collection switched on, booking stays free whatever the saved setting',async t=>{
 const {ws,stripe,call,studio,suffix}=await workspace(t,{collection:false});
 await connectStudioStripeAccount(ws.db,stripe,{studioId:studio.id,stripeAccountId:account});
 const settings=(await call('/api/consultations'+suffix,'GET',undefined,'owner')).data.settings;
 assert.equal((await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:{...settings,enabled:true,minNoticeHours:0,weekly:everyDay,payment:{...settings.payment,required:true}}},'owner')).status,409);
 // A setting saved while payments were on must not block bookings once they are off.
 await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:{...settings,enabled:true,minNoticeHours:0,weekly:everyDay}},'owner');
 ws.db.prepare("UPDATE studio_settings_kv SET data=json_set(data,'$.payment.required',json('true')) WHERE studio_id=? AND key='booking'").run(studio.id);
 const page=(await call(`/api/booking/${studio.slug}`)).data;
 assert.equal(page.booking.payment,null);
 const response=await call(`/api/booking/${studio.slug}`,'POST',{name:'Free Booker',email:'free@example.test',start:page.slots[0]},'',{'Idempotency-Key':'free-booking-1'});
 assert.equal(response.status,201);assert.equal(response.data.status,'Booked');assert.equal(response.data.checkoutUrl,undefined);
 assert.equal(stripe.calls.filter(call=>call.kind==='session').length,0);
 assert.equal((await call('/api/card-payments'+suffix,'POST',{autopay:true},'owner')).status,409,'autopay cannot be offered either');
});

async function issuedPlan(call,suffix,project){
 await call('/api/billing-defaults'+suffix,'POST',{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:50,due:{type:'on_issue',days:0}},{label:'Balance',percent:50,due:{type:'days_after_confirm',days:30}}]},'owner');
 let response=await call(`/api/projects/${project.id}/estimates${suffix}`,'POST',{title:'Scope',currency:'GBP',items:[{title:'Styling',quantity:1,unitAmount:100000}],taxRate:0},'owner');
 const estimate=response.data.project.estimates.at(-1);
 await call(`/api/projects/${project.id}/estimate-decision${suffix}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
 const route=`/api/projects/${project.id}/invoices/plan${suffix}`;
 response=await call(route,'POST',{action:'create'},'owner');assert.equal(response.status,200);
 return {route,plan:response.data.plan};
}

test('autopay saves a card through Stripe and charges each issued plan invoice once on its due date',async t=>{
 const {ws,stripe,call,webhook,studio,suffix,project}=await workspace(t);
 await connectStudioStripeAccount(ws.db,stripe,{studioId:studio.id,stripeAccountId:account});
 const {route,plan}=await issuedPlan(call,suffix,project);
 assert.equal((await call(route,'GET',undefined,'client')).data.plan.autopay.offered,false,'off until the studio offers it');
 assert.equal((await call(route,'POST',{action:'autopay-setup'},'client')).status,409);
 assert.equal((await call('/api/card-payments'+suffix,'POST',{autopay:true},'client')).status,403);
 assert.equal((await call('/api/card-payments'+suffix,'POST',{autopay:true},'owner')).data.settings.autopay,true);
 assert.equal((await call(route,'GET',undefined,'client')).data.plan.autopay.offered,true);
 assert.equal((await call(route,'POST',{action:'autopay-setup'},'owner')).status,403,'only the paying client saves a card');

 let response=await call(route,'POST',{action:'autopay-setup'},'client');
 assert.equal(response.status,200);assert.equal(response.data.url,'https://checkout.stripe.com/c/pay/test');
 const setup=stripe.calls.find(call=>call.kind==='session'&&call.params.mode==='setup');
 assert.equal(setup.options.stripeAccount,account);assert.equal(setup.params.customer,'cus_test_123');
 const setupSession={id:`cs_test_${stripe.calls.indexOf(setup)+1}`,mode:'setup',status:'complete',customer:'cus_test_123',client_reference_id:setup.params.client_reference_id,metadata:setup.params.metadata,setup_intent:'seti_test_1'};
 assert.equal((await webhook(sessionEvent('evt_setup_forged','checkout.session.completed',{...setupSession,customer:'cus_other'}))).status,409);
 response=await webhook(sessionEvent('evt_setup','checkout.session.completed',setupSession));
 assert.equal(response.status,200,JSON.stringify(response.data));
 let autopay=(await call(route,'GET',undefined,'owner')).data.plan.autopay;
 assert.equal(autopay.status,'active');assert.equal(autopay.cardLabel,'Visa ending 4242');assert.equal(autopay.enabledBy,'Amelia Taylor');

 // Nothing is charged until an invoice is issued and due.
 assert.deepEqual(await ws.collectAutopay(),[]);
 response=await call(route,'POST',{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.status,201,JSON.stringify(response.data));
 const deposit=response.data.invoice;
 assert.deepEqual(await ws.collectAutopay(),[{invoiceId:deposit.id,result:'paid'}]);
 assert.equal(stripe.intents[0].params.amount,50000);assert.equal(stripe.intents[0].params.off_session,true);assert.equal(stripe.intents[0].options.stripeAccount,account);
 assert.deepEqual(await ws.collectAutopay(),[],'a paid invoice is never charged again');
 let invoice=(await call(`/api/projects/${project.id}/invoices/${deposit.id}${suffix}`,'GET',undefined,'client')).data.invoice;
 assert.equal(invoice.status,'Paid');assert.equal(invoice.payments[0].source,'stripe_verified');
 // The webhook for the same charge does not record it twice.
 const charge=ws.db.prepare('SELECT * FROM autopay_charges WHERE invoice_id=?').get(deposit.id);
 const succeeded={id:'evt_pi_ok',object:'event',type:'payment_intent.succeeded',account,created:1,data:{object:{id:charge.payment_intent_id,object:'payment_intent',amount:50000,currency:'gbp',metadata:{kind:'autopay',chargeId:charge.id,studioId:studio.id,projectId:project.id,invoiceId:deposit.id}}}};
 assert.equal((await webhook(succeeded)).data.result,'already_paid');
 assert.equal(ws.db.prepare('SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id=?').get(deposit.id).n,1);

 // A declined card is not retried until the client saves another card.
 response=await call(route,'POST',{action:'issue',stepId:plan.steps[1].id,customerAddress:'Client Street, London',dueDate:new Date().toISOString().slice(0,10)},'owner');
 const balance=response.data.invoice;
 ws.db.prepare('UPDATE invoices SET due_date=? WHERE id=?').run(new Date().toISOString().slice(0,10),balance.id);
 stripe.decline();
 assert.deepEqual(await ws.collectAutopay(),[{invoiceId:balance.id,result:'failed'}]);
 assert.deepEqual(await ws.collectAutopay(),[]);
 autopay=(await call(route,'GET',undefined,'client')).data.plan.autopay;
 assert.equal(autopay.charges.at(-1).status,'failed');assert.match(autopay.charges.at(-1).failure,/declined/);
 invoice=(await call(`/api/projects/${project.id}/invoices/${balance.id}${suffix}`,'GET',undefined,'client')).data.invoice;
 assert.equal(invoice.balanceMinor,50000,'the invoice stays open for another way to pay');

 // Switching autopay off, by the client or the studio, stops further charges.
 response=await call(route,'POST',{action:'autopay-off'},'client');
 assert.equal(response.data.plan.autopay.status,'off');
 ws.db.prepare("DELETE FROM autopay_charges WHERE status='failed'").run();
 assert.deepEqual(await ws.collectAutopay(),[]);
});

test('a live Stripe key keeps booking payments and autopay off unless live use is explicitly allowed',async t=>{
 const previous=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY='sk_live_not_a_real_key';
 t.after(()=>{if(previous===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=previous;});
 const {ws,stripe,call,studio,suffix}=await workspace(t);
 await connectStudioStripeAccount(ws.db,stripe,{studioId:studio.id,stripeAccountId:account});
 assert.equal((await call('/api/card-payments'+suffix,'GET',undefined,'owner')).data.available,false);
 assert.equal((await call('/api/consultations'+suffix,'GET',undefined,'owner')).data.paymentsAvailable,false);
});
