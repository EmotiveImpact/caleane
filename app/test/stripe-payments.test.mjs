import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import {openStore} from '../store.mjs';
import {installStripePayments,connectStudioStripeAccount,createStripeCheckout,expireStripeCheckout,processStripeWebhook,activeStripeCheckout,listStripeCheckoutAttempts} from '../stripe-payments.mjs';

const account='acct_1234567890';
const secret='whsec_test_secret';
const verifier=new Stripe('sk_test_only_for_local_signature_tests');

async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-stripe-'));
 const db=openStore(path.join(dir,'db.sqlite'));
 const studioId='studio-one',projectId='project-one',invoiceId='invoice-one';
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'studio-one','Studio One','#000000','[]');
 db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(projectId,studioId,'client@example.test','{}');
 db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId,studioId,projectId,'INV-2026-0001','estimate-one',1,'Deposit','GBP',10000,10000,0,0,'2026-10-15','','Invoice payment','{}',new Date().toISOString(),'Studio One');
 return {db,studioId,projectId,invoiceId,async close(){db.close();await rm(dir,{recursive:true,force:true});}};
}
function fakeStripe(){
 const calls=[];
 const stripe={
  accounts:{async retrieve(id){return {id,charges_enabled:true};}},
  checkout:{sessions:{async create(params,options){calls.push({params,options});return {id:'cs_test_123456789',url:'https://checkout.stripe.com/c/pay/test',mode:'payment'};}}},
  webhooks:verifier.webhooks
 };
 return {stripe,calls};
}
function signedEvent(stripe,event){
 const rawBody=JSON.stringify(event);
 const signature=verifier.webhooks.generateTestHeaderString({payload:rawBody,secret});
 return processStripeWebhook(stripe.db,stripe.client,{rawBody,signature,webhookSecret:secret});
}
function eventFor(attempt,{id='evt_one',type='checkout.session.completed',paymentStatus='paid',amount=attempt.amountMinor,accountId=account,currency='gbp'}={}){
 return {id,object:'event',type,account:accountId,created:1790755200,
  data:{object:{id:attempt.sessionId,object:'checkout.session',mode:'payment',client_reference_id:attempt.id,
   metadata:{attemptId:attempt.id,studioId:'studio-one',projectId:'project-one',invoiceId:'invoice-one'},
   amount_total:amount,currency,payment_status:paymentStatus,payment_intent:'pi_test_123456789'}}};
}

test('Stripe Checkout retries safely and a signed connected-account payment credits the existing invoice once',async()=>{
 const f=await fixture();
 try{
  // An existing manual receipt survives migration and reduces the Checkout amount.
  f.db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source,client_key)
   VALUES('manual-one',?,?,2000,'bank_transfer','BANK-1','2026-09-30','',?,'Studio One','owner_recorded','manual-key')`).run(f.studioId,f.invoiceId,new Date().toISOString());
  installStripePayments(f.db);
  installStripePayments(f.db);
  assert.equal(f.db.prepare("SELECT source FROM invoice_payments WHERE id='manual-one'").get().source,'owner_recorded');
  const {stripe,calls}=fakeStripe();
  await connectStudioStripeAccount(f.db,stripe,{studioId:f.studioId,stripeAccountId:account});
  const args={studioId:f.studioId,projectId:f.projectId,invoiceId:f.invoiceId,accessRole:'Approver',appOrigin:'http://127.0.0.1:4321'};
  await assert.rejects(createStripeCheckout(f.db,stripe,{...args,accessRole:'Viewer'}),{status:403});
  const first=await createStripeCheckout(f.db,stripe,args);
  const again=await createStripeCheckout(f.db,stripe,args);
  assert.equal(first.url,again.url);
  assert.equal(calls.length,1);
  assert.equal(calls[0].params.line_items[0].price_data.unit_amount,8000);
  assert.equal(calls[0].options.stripeAccount,account);
  assert.match(calls[0].params.success_url,/session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.equal(activeStripeCheckout(f.db,args)?.id,first.id);
  const ctx={db:f.db,client:stripe};
  const paid=eventFor(first);
  assert.equal(signedEvent(ctx,paid).result,'paid');
  assert.equal(signedEvent(ctx,paid).duplicate,true);
  assert.equal(signedEvent(ctx,eventFor(first,{id:'evt_replayed'})).result,'already_paid');
  const rows=f.db.prepare('SELECT amount_minor,method,source,recorded_by FROM invoice_payments WHERE invoice_id=? ORDER BY amount_minor').all(f.invoiceId).map(row=>({...row}));
  assert.deepEqual(rows,[{amount_minor:2000,method:'bank_transfer',source:'owner_recorded',recorded_by:'Studio One'},
   {amount_minor:8000,method:'stripe_external',source:'stripe_verified',recorded_by:'Stripe'}]);
  assert.equal(activeStripeCheckout(f.db,args),null);
  assert.equal(listStripeCheckoutAttempts(f.db,args)[0].status,'paid');
 }finally{await f.close();}
});

test('invalid signatures, foreign accounts and altered amounts cannot credit an invoice',async()=>{
 const f=await fixture();
 try{
  installStripePayments(f.db);
  const {stripe}=fakeStripe();
  await connectStudioStripeAccount(f.db,stripe,{studioId:f.studioId,stripeAccountId:account});
  const attempt=await createStripeCheckout(f.db,stripe,{studioId:f.studioId,projectId:f.projectId,invoiceId:f.invoiceId,accessRole:'Owner',appOrigin:'http://127.0.0.1:4321'});
  const ctx={db:f.db,client:stripe};
  assert.throws(()=>processStripeWebhook(f.db,stripe,{rawBody:JSON.stringify(eventFor(attempt)),signature:'bad',webhookSecret:secret}),{status:400});
  assert.throws(()=>signedEvent(ctx,eventFor(attempt,{accountId:'acct_other12345'})),{status:409});
  assert.throws(()=>signedEvent(ctx,eventFor(attempt,{amount:1})),{status:409});
  assert.throws(()=>signedEvent(ctx,eventFor(attempt,{currency:'usd'})),{status:409});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invoice_payments').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stripe_webhook_events').get().n,0);
 }finally{await f.close();}
});

test('delayed success waits for payment and concurrent manual receipt sends a real charge to review',async()=>{
 const f=await fixture();
 try{
  installStripePayments(f.db);
  const {stripe}=fakeStripe();
  await connectStudioStripeAccount(f.db,stripe,{studioId:f.studioId,stripeAccountId:account});
  const args={studioId:f.studioId,projectId:f.projectId,invoiceId:f.invoiceId,accessRole:'Approver',appOrigin:'http://127.0.0.1:4321'};
  const attempt=await createStripeCheckout(f.db,stripe,args);
  const ctx={db:f.db,client:stripe};
  assert.equal(signedEvent(ctx,eventFor(attempt,{paymentStatus:'unpaid'})).result,'processing');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invoice_payments').get().n,0);
  await assert.rejects(createStripeCheckout(f.db,stripe,args),{status:409});
  f.db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source)
   VALUES('manual-late',?,?,1000,'bank_transfer','BANK-LATE','2026-09-30','',?,'Studio One','owner_recorded')`).run(f.studioId,f.invoiceId,new Date().toISOString());
  assert.equal(signedEvent(ctx,eventFor(attempt,{id:'evt_async',type:'checkout.session.async_payment_succeeded'})).result,'needs_review');
  assert.equal(f.db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_payments').get().n,1000);
  assert.match(listStripeCheckoutAttempts(f.db,args)[0].reviewReason,/balance changed/);
 }finally{await f.close();}
});

test('only a studio owner can close an open Checkout session after Stripe confirms expiry',async()=>{
 const f=await fixture();
 try{
  f.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('studio-owner','owner@example.test','Owner','test-hash');
  f.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('studio-client','client@example.test','Client','test-hash');
  f.db.prepare("INSERT INTO memberships VALUES('studio-owner','studio-one','owner')").run();
  f.db.prepare("INSERT INTO memberships VALUES('studio-client','studio-one','client')").run();
  installStripePayments(f.db);
  const {stripe}=fakeStripe();
  await connectStudioStripeAccount(f.db,stripe,{studioId:f.studioId,stripeAccountId:account});
  const args={studioId:f.studioId,projectId:f.projectId,invoiceId:f.invoiceId,accessRole:'Approver',appOrigin:'http://127.0.0.1:4321'};
  const attempt=await createStripeCheckout(f.db,stripe,args);
  let providerStatus='complete',expireOptions;
  stripe.checkout.sessions.expire=async(id,params,options)=>{expireOptions=options;return {id,status:providerStatus,payment_status:providerStatus==='expired'?'unpaid':'paid'};};
  stripe.checkout.sessions.retrieve=async id=>({id,status:providerStatus,payment_status:providerStatus==='expired'?'unpaid':'paid'});
  await assert.rejects(expireStripeCheckout(f.db,stripe,{...args,ownerUserId:'studio-client'}),{status:403});
  await assert.rejects(expireStripeCheckout(f.db,stripe,{...args,projectId:'other-project',ownerUserId:'studio-owner'}),{status:404});
  await assert.rejects(expireStripeCheckout(f.db,stripe,{...args,ownerUserId:'studio-owner'}),{status:409});
  assert.equal(activeStripeCheckout(f.db,args)?.id,attempt.id);
  providerStatus='expired';
  const closed=await expireStripeCheckout(f.db,stripe,{...args,ownerUserId:'studio-owner'});
  assert.equal(closed.status,'expired');
  assert.equal(closed.url,null);
  assert.equal(activeStripeCheckout(f.db,args),null);
  assert.equal(expireOptions.stripeAccount,account);
  await assert.rejects(expireStripeCheckout(f.db,stripe,{...args,ownerUserId:'studio-owner'}),{status:409});
 }finally{await f.close();}
});
