import {randomUUID,createHash} from 'node:crypto';
import {transaction,now} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';
import {getPlan,confirmedEstimate} from './payment-plans.mjs';
import {activeStripeCheckout,invoiceBalance} from './stripe-payments.mjs';
import {installBookingPayments} from './booking-payments.mjs';

// Autopay for payment plans. The client saves a card once through Stripe
// Checkout in setup mode, on the studio's connected account. When a plan
// payment has been issued as an invoice and its due date arrives, the hourly
// job charges the outstanding balance to that card. A failed charge is never
// retried on the same card; the client can pay by Checkout or save a new card.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const ACTIVE="'creating','processing'";

export function installPlanAutopay(db){installBookingPayments(db);db.exec(`
 CREATE TABLE IF NOT EXISTS plan_autopay(
  studio_id TEXT NOT NULL,project_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('off','active')),
  stripe_account_id TEXT,customer_id TEXT,payment_method_id TEXT,card_label TEXT NOT NULL DEFAULT '',
  pending_setup_id TEXT,pending_session_id TEXT,pending_url TEXT,enabled_at TEXT,enabled_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,
  PRIMARY KEY(studio_id,project_id),FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
 CREATE TABLE IF NOT EXISTS autopay_charges(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,project_id TEXT NOT NULL,invoice_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,payment_method_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('creating','processing','paid','failed','needs_review')),
  payment_intent_id TEXT,failure TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(invoice_id,studio_id) REFERENCES invoices(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS autopay_active_invoice ON autopay_charges(invoice_id) WHERE status IN (${ACTIVE});
 CREATE INDEX IF NOT EXISTS autopay_charges_project ON autopay_charges(studio_id,project_id,created_at);`);}

export function cardPaymentSettings(db,studioId){return {autopay:false,...readSetting(db,studioId,'card_payments',{})};}
export function saveCardPaymentSettings(db,studioId,body,{available}){
 if(typeof body.autopay!=='boolean')fail(400,'Choose whether to offer autopay.');
 if(body.autopay&&!available)fail(409,'Connect Stripe and switch on card payments before offering autopay.');
 return writeSetting(db,studioId,'card_payments',{autopay:body.autopay});
}

function autopayRow(db,studioId,projectId){return db.prepare('SELECT * FROM plan_autopay WHERE studio_id=? AND project_id=?').get(studioId,projectId)||null;}
function connectedAccount(db,studioId){return db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studioId)?.stripe_account_id||null;}

/** What Billing shows: whether autopay is on, the saved card and each charge. */
export function autopayView(db,studioId,projectId,{offered}){
 const row=autopayRow(db,studioId,projectId);
 const charges=db.prepare('SELECT * FROM autopay_charges WHERE studio_id=? AND project_id=? ORDER BY created_at').all(studioId,projectId)
  .map(charge=>({id:charge.id,invoiceId:charge.invoice_id,amountMinor:charge.amount_minor,currency:charge.currency,status:charge.status,failure:charge.failure,at:charge.updated_at}));
 return {offered,status:row?.status||'off',cardLabel:row?.status==='active'?row.card_label:'',enabledAt:row?.status==='active'?row.enabled_at:null,enabledBy:row?.status==='active'?row.enabled_by:'',charges};
}

function returnUrl(appOrigin,projectId,result){
 const url=new URL('/',appOrigin);url.searchParams.set('view','projects');url.searchParams.set('project',projectId);url.searchParams.set('tab','Billing');url.searchParams.set('autopay',result);return url.toString();
}

/** The project approver saves a card for autopay. Returns the Stripe setup page. */
export async function startAutopaySetup(db,stripe,{studioId,project,accessRole,user,appOrigin}){
 if(accessRole!=='Approver')fail(403,'Only the client who approves this project can set up autopay.');
 if(!cardPaymentSettings(db,studioId).autopay)fail(409,'The studio has not switched on autopay.');
 const plan=getPlan(db,studioId,project.id),estimate=confirmedEstimate(project);
 if(!plan||!estimate||estimate.id!==plan.estimateId)fail(409,'Autopay needs a current payment plan.');
 const accountId=connectedAccount(db,studioId);if(!accountId)fail(409,'The studio has not connected Stripe.');
 const account=await stripe.accounts.retrieve(accountId);
 if(!account?.charges_enabled||account.id!==accountId)fail(409,'The studio Stripe account cannot accept payments yet.');
 let row=autopayRow(db,studioId,project.id);
 // A card saved on a previous Stripe account cannot be charged on a new one.
 let customerId=row?.stripe_account_id===accountId?row.customer_id:null;
 if(!customerId){
  const customer=await stripe.customers.create({email:user.email,name:user.name,metadata:{studioId,projectId:project.id}},
   {stripeAccount:accountId,idempotencyKey:`caleane-autopay-customer-${studioId}-${project.id}-${accountId}`});
  if(!/^cus_/.test(customer?.id||''))fail(502,'Stripe did not return a customer.');
  customerId=customer.id;
 }
 const setupId=randomUUID(),metadata={kind:'autopay_setup',setupId,studioId,projectId:project.id};
 const session=await stripe.checkout.sessions.create({mode:'setup',customer:customerId,currency:plan.currency.toLowerCase(),payment_method_types:['card'],
  client_reference_id:setupId,metadata,setup_intent_data:{metadata},
  success_url:returnUrl(appOrigin,project.id,'saved'),cancel_url:returnUrl(appOrigin,project.id,'cancelled')},
  {stripeAccount:accountId,idempotencyKey:`caleane-autopay-setup-${setupId}`});
 if(!session?.id||!session?.url||session.mode!=='setup')fail(502,'Stripe did not return a usable card setup page.');
 transaction(db,()=>{
  row=autopayRow(db,studioId,project.id);
  if(!row)db.prepare(`INSERT INTO plan_autopay(studio_id,project_id,status,stripe_account_id,customer_id,pending_setup_id,pending_session_id,pending_url,enabled_by,updated_at) VALUES(?,?,'off',?,?,?,?,?,?,?)`)
   .run(studioId,project.id,accountId,customerId,setupId,session.id,session.url,user.name,now());
  else db.prepare('UPDATE plan_autopay SET customer_id=?,pending_setup_id=?,pending_session_id=?,pending_url=?,enabled_by=?,updated_at=?, stripe_account_id=CASE WHEN status=\'active\' THEN stripe_account_id ELSE ? END WHERE studio_id=? AND project_id=?')
   .run(customerId,setupId,session.id,session.url,user.name,now(),accountId,studioId,project.id);
 });
 return {url:session.url};
}

export function stopAutopay(db,{studioId,projectId}){
 transaction(db,()=>db.prepare("UPDATE plan_autopay SET status='off',payment_method_id=NULL,card_label='',pending_setup_id=NULL,pending_session_id=NULL,pending_url=NULL,updated_at=? WHERE studio_id=? AND project_id=?").run(now(),studioId,projectId));
}

export function isAutopayEvent(event){
 const object=event?.data?.object;
 return event?.type==='checkout.session.completed'&&object?.mode==='setup'&&object?.metadata?.kind==='autopay_setup'||
  ['payment_intent.succeeded','payment_intent.payment_failed'].includes(event?.type)&&object?.metadata?.kind==='autopay';
}

function seen(db,event){return db.prepare('SELECT result FROM card_payment_events WHERE event_id=?').get(event.id);}
function remember(db,event,result){db.prepare('INSERT INTO card_payment_events VALUES(?,?,?,?,?,?)').run(event.id,event.account,'autopay',event.type,result,now());}

// Records a verified Stripe charge against its invoice once, whichever of the API response or webhook arrives first.
function settleCharge(db,charge,paymentIntentId,onPaid){
 if(charge.status==='paid')return 'already_paid';
 const invoice=db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(charge.invoice_id,charge.studio_id);
 if(!invoice||invoice.cancelled_at||invoiceBalance(db,invoice)<charge.amount_minor){
  db.prepare("UPDATE autopay_charges SET status='needs_review',payment_intent_id=?,failure=?,updated_at=? WHERE id=?").run(paymentIntentId,'Charged after the invoice changed. Check it and refund in Stripe if needed.',now(),charge.id);
  return 'needs_review';
 }
 const key='stripe_'+createHash('sha256').update(paymentIntentId).digest('hex');
 if(!db.prepare('SELECT 1 FROM invoice_payments WHERE invoice_id=? AND client_key=?').get(invoice.id,key))
  db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source,client_key)
   VALUES(?,?,?,?,'stripe_external',?,?,'Autopay',?,'Stripe autopay','stripe_verified',?)`).run(randomUUID(),charge.studio_id,invoice.id,charge.amount_minor,paymentIntentId,now().slice(0,10),now(),key);
 db.prepare("UPDATE autopay_charges SET status='paid',payment_intent_id=?,failure='',updated_at=? WHERE id=?").run(paymentIntentId,now(),charge.id);
 onPaid?.(charge,invoice);
 return 'paid';
}
function failCharge(db,charge,message,paymentIntentId=null){
 if(charge.status==='paid')return 'already_paid';
 db.prepare("UPDATE autopay_charges SET status='failed',payment_intent_id=COALESCE(payment_intent_id,?),failure=?,updated_at=? WHERE id=?").run(paymentIntentId,message,now(),charge.id);
 return 'failed';
}

/** Applies a verified Connect webhook event for autopay. Async because a saved card is read back from Stripe. */
export async function applyAutopayEvent(db,stripe,event,{onPaid,onFailed,onSaved}={}){
 const object=event.data.object;
 if(!event.id||!event.account)fail(400,'Malformed Stripe autopay event.');
 if(event.type==='checkout.session.completed'){
  if(seen(db,event))return {handled:true,duplicate:true};
  const row=autopayRow(db,object.metadata.studioId,object.metadata.projectId);
  if(!row||row.pending_setup_id!==object.metadata.setupId||row.pending_session_id!==object.id||object.client_reference_id!==row.pending_setup_id||object.customer!==row.customer_id)
   fail(409,'Stripe autopay setup does not match its payment plan.');
  const intentId=typeof object.setup_intent==='string'?object.setup_intent:object.setup_intent?.id;
  const intent=await stripe.setupIntents.retrieve(intentId,{expand:['payment_method']},{stripeAccount:event.account});
  const method=intent?.payment_method;
  if(intent?.status!=='succeeded'||!method?.id)fail(409,'Stripe has not confirmed the saved card.');
  const label=method.card?`${method.card.brand?method.card.brand[0].toUpperCase()+method.card.brand.slice(1):'Card'} ending ${method.card.last4}`:'Saved card';
  return transaction(db,()=>{
   if(seen(db,event))return {handled:true,duplicate:true};
   db.prepare("UPDATE plan_autopay SET status='active',stripe_account_id=?,payment_method_id=?,card_label=?,enabled_at=?,pending_setup_id=NULL,pending_session_id=NULL,pending_url=NULL,updated_at=? WHERE studio_id=? AND project_id=?")
    .run(event.account,method.id,label,now(),now(),row.studio_id,row.project_id);
   remember(db,event,'saved');onSaved?.(row,label);
   return {handled:true,result:'saved'};
  });
 }
 return transaction(db,()=>{
  const prior=seen(db,event);if(prior)return {handled:true,result:prior.result,duplicate:true};
  const charge=db.prepare('SELECT * FROM autopay_charges WHERE id=?').get(object.metadata.chargeId);
  if(!charge||charge.stripe_account_id!==event.account||charge.studio_id!==object.metadata.studioId||charge.invoice_id!==object.metadata.invoiceId||
   object.amount!==charge.amount_minor||object.currency?.toUpperCase()!==charge.currency||charge.payment_intent_id&&charge.payment_intent_id!==object.id)
   fail(409,'Stripe autopay event does not match its invoice and connected account.');
  const result=event.type==='payment_intent.succeeded'?settleCharge(db,charge,object.id,onPaid)
   :(()=>{const r=failCharge(db,charge,object.last_payment_error?.message||'The card was declined.',object.id);if(r==='failed')onFailed?.(charge);return r;})();
  remember(db,event,result);
  return {handled:true,result,invoiceId:charge.invoice_id};
 });
}

// Issued plan invoices that autopay should charge today.
function dueCharges(db,today){
 const due=[];
 for(const row of db.prepare("SELECT * FROM plan_autopay WHERE status='active'").all()){
  if(!cardPaymentSettings(db,row.studio_id).autopay||connectedAccount(db,row.studio_id)!==row.stripe_account_id)continue;
  const plan=getPlan(db,row.studio_id,row.project_id);if(!plan)continue;
  for(const step of plan.steps){
   if(!step.invoiceId)continue;
   const invoice=db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=? AND project_id=?').get(step.invoiceId,row.studio_id,row.project_id);
   if(!invoice||invoice.cancelled_at||invoice.due_date>today)continue;
   const balance=invoiceBalance(db,invoice);if(balance<=0)continue;
   if(activeStripeCheckout(db,{studioId:row.studio_id,invoiceId:invoice.id}))continue;
   const charges=db.prepare('SELECT * FROM autopay_charges WHERE invoice_id=? ORDER BY created_at').all(invoice.id);
   const open=charges.find(charge=>['creating','processing'].includes(charge.status));
   if(open?.status==='processing'||charges.some(charge=>charge.status==='paid'||charge.status==='needs_review'))continue;
   // A declined card is not charged again until the client saves a card.
   if(!open&&charges.some(charge=>charge.status==='failed'&&charge.payment_method_id===row.payment_method_id))continue;
   due.push({row,invoice,balance,open});
  }
 }
 return due;
}

/** Hourly: charge each due plan invoice once. Returns what happened, for logs and tests. */
export async function runAutopay(db,stripe,{today=now().slice(0,10),onPaid,onFailed}={}){
 const outcomes=[];
 for(const {row,invoice,balance,open} of dueCharges(db,today)){
  // A charge left in 'creating' by a lost response is retried with the same idempotency key.
  const charge=open||transaction(db,()=>{
   const chargeId=randomUUID(),at=now();
   db.prepare(`INSERT INTO autopay_charges(id,studio_id,project_id,invoice_id,stripe_account_id,payment_method_id,amount_minor,currency,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'creating',?,?)`)
    .run(chargeId,row.studio_id,row.project_id,invoice.id,row.stripe_account_id,row.payment_method_id,balance,invoice.currency,at,at);
   return db.prepare('SELECT * FROM autopay_charges WHERE id=?').get(chargeId);
  });
  const metadata={kind:'autopay',chargeId:charge.id,studioId:charge.studio_id,projectId:charge.project_id,invoiceId:charge.invoice_id};
  let intent;
  try{
   intent=await stripe.paymentIntents.create({amount:charge.amount_minor,currency:charge.currency.toLowerCase(),customer:row.customer_id,payment_method:charge.payment_method_id,
    off_session:true,confirm:true,description:`Invoice ${invoice.number}`,metadata},{stripeAccount:charge.stripe_account_id,idempotencyKey:`caleane-autopay-${charge.id}`});
  }catch(error){
   // Card errors are final for this card. Anything else (network, Stripe outage) keeps the charge for a retry.
   if(error?.type==='StripeCardError'||error?.raw?.payment_intent){
    outcomes.push({invoiceId:invoice.id,result:transaction(db,()=>{const current=db.prepare('SELECT * FROM autopay_charges WHERE id=?').get(charge.id);const r=failCharge(db,current,error.message||'The card was declined.',error.raw?.payment_intent?.id||null);if(r==='failed')onFailed?.(current);return r;})});
   }else outcomes.push({invoiceId:invoice.id,result:'retry'});
   continue;
  }
  outcomes.push({invoiceId:invoice.id,result:transaction(db,()=>{
   const current=db.prepare('SELECT * FROM autopay_charges WHERE id=?').get(charge.id);
   if(intent?.status==='succeeded')return settleCharge(db,current,intent.id,onPaid);
   if(intent?.status==='processing'){db.prepare("UPDATE autopay_charges SET status='processing',payment_intent_id=?,updated_at=? WHERE id=? AND status='creating'").run(intent.id,now(),charge.id);return 'processing';}
   const r=failCharge(db,current,'The card needs the client to confirm this payment, so it was not charged.',intent?.id||null);if(r==='failed')onFailed?.(current);return r;
  })});
 }
 return outcomes;
}
