import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {createWorkspace} from '../server.mjs';
import {connectStudioStripeAccount} from '../stripe-payments.mjs';

const origin='http://127.0.0.1:4321';
const accountId='acct_1234567890';
const webhookSecret='whsec_local_integration';
const verifier=new Stripe('sk_test_only_for_local_signature_tests');

test('HTTP checkout, signed webhook, date holds and queued invitations respect project access',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-connected-routes-'));
 const calls=[];
 const stripe={
  accounts:{async retrieve(id){return {id,charges_enabled:true};}},
  checkout:{sessions:{async create(params,options){calls.push({params,options});return {id:`cs_test_routes_${calls.length}`,url:'https://checkout.stripe.com/c/pay/test',mode:'payment'};},async expire(id){return {id,status:'expired',payment_status:'unpaid'};}}},
  webhooks:verifier.webhooks
 };
 const workspace=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,stripeClient:stripe,stripeWebhookSecret:webhookSecret,enableStripeCollection:true,notificationKey:randomBytes(32).toString('base64')});
 await new Promise(resolve=>workspace.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${workspace.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id;
  const project=(await call(`/api/projects?studio=${studio}`,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail==='amelia@example.test');
  const suffix=`?studio=${studio}`;
  const statusRoute=`/api/studios/${studio}/stripe-status${suffix}`;
  assert.equal((await call(statusRoute,'GET',undefined,'client')).data.stripe.connected,false);
  const operationsRoute=`/api/projects/${project.id}/operations`;
  const initial=(await call(operationsRoute+suffix,'GET',undefined,'client')).data.operations;
  assert.equal(initial.revision,0);
  const today=new Date().toISOString().slice(0,10),nextWeek=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const hold={revision:0,startDate:nextWeek,holdUntil:today,location:'London'};
  assert.equal((await call(`${operationsRoute}/place-hold${suffix}`,'POST',hold,'client')).status,403);
  const held=await call(`${operationsRoute}/place-hold${suffix}`,'POST',hold,'owner');
  assert.equal(held.status,200);
  assert.equal(held.data.operations.booking.productionStatus,'Tentative hold');
  assert.equal((await call(`${operationsRoute}/place-hold${suffix}`,'POST',hold,'owner')).status,409);
  assert.equal((await call(operationsRoute+suffix,'GET',undefined,'client')).data.operations.holds.length,1);
  const invited=await call(`/api/projects/${project.id}/invite${suffix}`,'POST',{},'owner');
  assert.equal(invited.status,201);
  assert.equal(invited.data.delivery,'queued');
  const job=workspace.db.prepare("SELECT payload,state FROM notification_outbox WHERE kind='invitation' ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(job.state,'pending');
  assert.ok(!job.payload.includes(invited.data.url));

  const invoiceId=randomUUID(),invoiceRoute=`/api/projects/${project.id}/invoices/${invoiceId}`;
  workspace.db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId,studio,project.id,'INV-2026-0099','estimate-http',1,'Deposit','GBP',12500,12500,0,0,nextWeek,'','Bank transfer','{}',new Date().toISOString(),'NAY Studio');
  assert.equal((await call(`${invoiceRoute}/checkout${suffix}`,'POST',{},'client')).status,409);
  await connectStudioStripeAccount(workspace.db,stripe,{studioId:studio,stripeAccountId:accountId});
  assert.equal((await call(statusRoute,'GET',undefined,'client')).data.stripe.chargesEnabled,true);
  const checkout=await call(`${invoiceRoute}/checkout${suffix}`,'POST',{},'client');
  assert.equal(checkout.status,200);
  assert.equal(checkout.data.url,'https://checkout.stripe.com/c/pay/test');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.stripeAccount,accountId);
  assert.equal((await call(`${invoiceRoute}/checkout${suffix}`,'POST',{},'client')).status,200);
  assert.equal(calls.length,1);
  assert.equal((await call(`${invoiceRoute}/payments${suffix}`,'POST',{amountMinor:100,method:'bank_transfer',receivedAt:today},'owner')).status,409);
  assert.equal((await call(`${invoiceRoute}/cancel${suffix}`,'POST',{reason:'Changed scope'},'owner')).status,409);
  const attempt=checkout.data.attempt;
  const event={id:'evt_http_paid',object:'event',type:'checkout.session.completed',account:accountId,created:Math.floor(Date.now()/1000),data:{object:{id:attempt.sessionId,object:'checkout.session',mode:'payment',client_reference_id:attempt.id,metadata:{attemptId:attempt.id,studioId:studio,projectId:project.id,invoiceId},amount_total:12500,currency:'gbp',payment_status:'paid',payment_intent:'pi_http_paid'}}};
  const raw=JSON.stringify(event);
  const invalid=await fetch(base+'/api/webhooks/stripe',{method:'POST',headers:{'Stripe-Signature':'invalid','Content-Type':'text/plain'},body:raw});
  assert.equal(invalid.status,400);
  const signature=verifier.webhooks.generateTestHeaderString({payload:raw,secret:webhookSecret});
  const send=()=>fetch(base+'/api/webhooks/stripe',{method:'POST',headers:{'Stripe-Signature':signature,'Content-Type':'text/plain'},body:raw});
  assert.equal((await send()).status,200);
  assert.equal((await send()).status,200);
  const paid=(await call(invoiceRoute+suffix,'GET',undefined,'client')).data.invoice;
  assert.equal(paid.status,'Paid');
  assert.equal(paid.payments.length,1);
  assert.equal(paid.payments[0].source,'stripe_verified');
  assert.equal((await call(`${invoiceRoute}/attempts${suffix}`,'GET',undefined,'client')).status,403);
  assert.equal((await call(`${invoiceRoute}/attempts${suffix}`,'GET',undefined,'owner')).data.attempts[0].status,'paid');
  const secondId=randomUUID(),secondRoute=`/api/projects/${project.id}/invoices/${secondId}`;
  workspace.db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(secondId,studio,project.id,'INV-2026-0100','estimate-http',1,'Balance','GBP',5000,5000,0,0,nextWeek,'','Bank transfer','{}',new Date().toISOString(),'NAY Studio');
  assert.equal((await call(`${secondRoute}/checkout${suffix}`,'POST',{},'client')).status,200);
  assert.equal((await call(`${secondRoute}/checkout/expire${suffix}`,'POST',{},'client')).status,403);
  const expired=await call(`${secondRoute}/checkout/expire${suffix}`,'POST',{},'owner');
  assert.equal(expired.status,200);
  assert.equal(expired.data.attempt.status,'expired');
  assert.equal((await call(`${secondRoute}/payments${suffix}`,'POST',{amountMinor:5000,method:'bank_transfer',receivedAt:today},'owner')).status,200);
 }finally{
  await new Promise(resolve=>workspace.server.close(resolve));workspace.db.close();await rm(dir,{recursive:true,force:true});
 }
});

test('HTTP Stripe setup accepts only owner-bound single-use callbacks',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-connect-routes-'));
 let chargesEnabled=false,accountsCreated=0;
 const links=[];
 const stripe={
  accounts:{async create(){accountsCreated++;return {id:accountId,country:'GB'};},async retrieve(id){return {id,charges_enabled:chargesEnabled,details_submitted:chargesEnabled,payouts_enabled:chargesEnabled,country:'GB'};}},
  accountLinks:{async create(params){links.push(params);return {url:`https://connect.stripe.com/setup/test/${links.length}`};}}
 };
 const workspace=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,stripeClient:stripe});
 await new Promise(resolve=>workspace.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${workspace.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who=''){
  const response=await fetch(base+route,{method,redirect:'manual',headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,location:response.headers.get('location'),data:response.status===303?null:await response.json()};
 }
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id;
  const status=`/api/stripe/connect/status?studio=${studio}`,start=`/api/stripe/connect/start?studio=${studio}`;
  assert.equal((await call(status,'GET',undefined,'owner')).data.onboarding.status,'not_started');
  assert.equal((await call(status,'GET',undefined,'client')).status,403);
  assert.equal((await call(start,'POST',{country:'GB'},'client')).status,403);
  assert.equal((await call(start,'POST',{country:'FR'},'owner')).status,400);
  const first=await call(start,'POST',{country:'GB'},'owner');
  assert.equal(first.status,200);
  assert.equal(first.data.onboarding.status,'onboarding');
  assert.equal(accountsCreated,1);
  const firstReturn=new URL(links[0].return_url);
  assert.equal((await call(firstReturn.pathname+firstReturn.search,'GET',undefined,'client')).status,403);
  const pending=await call(firstReturn.pathname+firstReturn.search,'GET',undefined,'owner');
  assert.equal(pending.status,303);
  assert.match(pending.location,/stripe=pending/);
  assert.equal((await call(firstReturn.pathname+firstReturn.search,'GET',undefined,'owner')).status,403);
  const second=await call(start,'POST',{country:'GB'},'owner');
  assert.equal(second.status,200);
  assert.equal(accountsCreated,1);
  chargesEnabled=true;
  const secondReturn=new URL(links[1].return_url);
  const connected=await call(secondReturn.pathname+secondReturn.search,'GET',undefined,'owner');
  assert.equal(connected.status,303);
  assert.match(connected.location,/stripe=connected/);
  assert.equal((await call(status,'GET',undefined,'owner')).data.onboarding.status,'connected');
  assert.equal(workspace.db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studio).stripe_account_id,accountId);
  assert.equal((await call(`/api/studios/${studio}/stripe-status?studio=${studio}`,'GET',undefined,'owner')).data.stripe.chargesEnabled,false);
 }finally{
  await new Promise(resolve=>workspace.server.close(resolve));workspace.db.close();await rm(dir,{recursive:true,force:true});
 }
});
