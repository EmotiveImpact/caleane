import {installInvoiceAdjustments,invoiceCharges} from './invoice-adjustments.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {transaction,now} from './store.mjs';

const ACTIVE_STATES="'creating','open','processing'";
const CHECKOUT_EVENTS=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired']);

function fail(status,message){throw Object.assign(new Error(message),{status});}
function accountId(value){if(typeof value!=='string'||!/^acct_[A-Za-z0-9]{8,}$/.test(value))fail(400,'Invalid Stripe account ID.');return value;}
export function invoiceBalance(db,invoice){
 const paid=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS amount FROM invoice_payments WHERE studio_id=? AND invoice_id=?').get(invoice.studio_id,invoice.id).amount;
 const adjustments=db.prepare("SELECT (SELECT COALESCE(SUM(amount_minor),0) FROM invoice_credit_notes WHERE studio_id=? AND invoice_id=?) AS credited,(SELECT COALESCE(SUM(amount_minor),0) FROM invoice_refunds WHERE studio_id=? AND invoice_id=?) AS refunded").get(invoice.studio_id,invoice.id,invoice.studio_id,invoice.id);
 return invoice.amount_minor+invoiceCharges(db,invoice.studio_id,invoice.id).chargesMinor-adjustments.credited-(paid-adjustments.refunded);
}
function invoiceRow(db,{studioId,projectId,invoiceId}){
 const row=db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=? AND project_id=?').get(invoiceId,studioId,projectId);
 if(!row)fail(404,'Invoice not found.');
 return row;
}
function attemptDTO(row){return {id:row.id,invoiceId:row.invoice_id,projectId:row.project_id,amountMinor:row.amount_minor,currency:row.currency,status:row.status,url:row.checkout_url||null,sessionId:row.stripe_session_id||null,paymentIntentId:row.payment_intent_id||null,reviewReason:row.review_reason||''};}

/** Run once when the SQLite store opens, before Checkout routes or invoice reads. */
export function installStripePayments(db){installInvoiceAdjustments(db);
 transaction(db,()=>{
  // Existing databases had a one-value CHECK on source. Preserve their payment IDs and
  // idempotency keys while allowing a distinct, verified provider source.
  const paymentSchema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_payments'").get()?.sql||'';
  if(!paymentSchema.includes('stripe_verified')){
   db.exec(`CREATE TABLE invoice_payments_stripe_migration(
    id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,invoice_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
    method TEXT NOT NULL CHECK(method IN ('bank_transfer','paypal_external','stripe_external','other_external')),
    reference TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
    recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'owner_recorded' CHECK(source IN ('owner_recorded','stripe_verified')),
    client_key TEXT,FOREIGN KEY(invoice_id,studio_id) REFERENCES invoices(id,studio_id),
    UNIQUE(invoice_id,client_key));
    INSERT INTO invoice_payments_stripe_migration SELECT * FROM invoice_payments;
    DROP TABLE invoice_payments;
    ALTER TABLE invoice_payments_stripe_migration RENAME TO invoice_payments;
    CREATE INDEX invoice_payments_invoice ON invoice_payments(studio_id,invoice_id,recorded_at);`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_studio_accounts(
   studio_id TEXT PRIMARY KEY REFERENCES studios(id),stripe_account_id TEXT NOT NULL UNIQUE,
   connected_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS stripe_checkout_attempts(
   id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,project_id TEXT NOT NULL,invoice_id TEXT NOT NULL,
   stripe_account_id TEXT NOT NULL,stripe_session_id TEXT UNIQUE,checkout_url TEXT,
   amount_minor INTEGER NOT NULL CHECK(amount_minor>0),currency TEXT NOT NULL,
   status TEXT NOT NULL CHECK(status IN ('creating','open','processing','paid','expired','failed','needs_review')),
   payment_intent_id TEXT,review_reason TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
   FOREIGN KEY(invoice_id,studio_id) REFERENCES invoices(id,studio_id),
   FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
   CREATE UNIQUE INDEX IF NOT EXISTS stripe_checkout_active_invoice
    ON stripe_checkout_attempts(invoice_id) WHERE status IN (${ACTIVE_STATES});
   CREATE INDEX IF NOT EXISTS stripe_checkout_invoice ON stripe_checkout_attempts(studio_id,invoice_id,created_at DESC);
   CREATE TABLE IF NOT EXISTS stripe_webhook_events(
    event_id TEXT PRIMARY KEY,stripe_account_id TEXT NOT NULL,attempt_id TEXT NOT NULL,
    type TEXT NOT NULL,result TEXT NOT NULL,processed_at TEXT NOT NULL,
    FOREIGN KEY(attempt_id) REFERENCES stripe_checkout_attempts(id));`);
 });
}

/** Only call after a trusted Connect onboarding callback confirms account ownership. */
export async function connectStudioStripeAccount(db,stripe,{studioId,stripeAccountId}){
 const id=accountId(stripeAccountId);
 if(!db.prepare('SELECT id FROM studios WHERE id=?').get(studioId))fail(404,'Studio not found.');
 const account=await stripe.accounts.retrieve(id);
 if(!account?.charges_enabled||account.id!==id)fail(409,'Finish Stripe account setup before accepting payments.');
 const previous=db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studioId);
 if(previous&&previous.stripe_account_id!==id){
  const unresolved=db.prepare(`SELECT 1 FROM stripe_checkout_attempts WHERE studio_id=? AND status IN (${ACTIVE_STATES}) LIMIT 1`).get(studioId);
  if(unresolved)fail(409,'Resolve open Checkout sessions before changing the Stripe account.');
 }
 db.prepare(`INSERT INTO stripe_studio_accounts(studio_id,stripe_account_id,connected_at) VALUES(?,?,?)
  ON CONFLICT(studio_id) DO UPDATE SET stripe_account_id=excluded.stripe_account_id,connected_at=excluded.connected_at`).run(studioId,id,now());
 return {studioId,stripeAccountId:id};
}

export function activeStripeCheckout(db,{studioId,invoiceId}){
 return db.prepare(`SELECT * FROM stripe_checkout_attempts WHERE studio_id=? AND invoice_id=? AND status IN (${ACTIVE_STATES})`).get(studioId,invoiceId)||null;
}

/** Owner-only escape hatch for a client who left an unpaid, still-open Checkout page. */
export async function expireStripeCheckout(db,stripe,{studioId,projectId,invoiceId,ownerUserId}){
 if(!ownerUserId||!db.prepare("SELECT 1 FROM memberships WHERE user_id=? AND studio_id=? AND role='owner'").get(ownerUserId,studioId))fail(403,'Only a studio owner can close a Checkout session.');
 invoiceRow(db,{studioId,projectId,invoiceId});
 const attempt=db.prepare(`SELECT * FROM stripe_checkout_attempts WHERE studio_id=? AND project_id=? AND invoice_id=? AND status IN (${ACTIVE_STATES})`).get(studioId,projectId,invoiceId);
 if(!attempt)fail(409,'There is no active Checkout session for this invoice.');
 if(attempt.status!=='open'||!attempt.stripe_session_id)fail(409,'This payment is being created or processed. Check its status before closing it.');
 let session;
 try{
  session=await stripe.checkout.sessions.expire(attempt.stripe_session_id,{},
   {stripeAccount:attempt.stripe_account_id,idempotencyKey:`caleane-expire-${attempt.id}`});
 }catch(error){
  // A retry after an uncertain provider response can find a session already expired.
  const current=await stripe.checkout.sessions.retrieve(attempt.stripe_session_id,{},
   {stripeAccount:attempt.stripe_account_id});
  if(current?.status!=='expired')throw error;
  session=current;
 }
 if(session?.id!==attempt.stripe_session_id||session.status!=='expired'||session.payment_status==='paid')fail(409,'Stripe has not confirmed that this Checkout session is closed.');
 return transaction(db,()=>{
  const changed=db.prepare("UPDATE stripe_checkout_attempts SET status='expired',checkout_url=NULL,updated_at=? WHERE id=? AND status='open'").run(now(),attempt.id);
  if(changed.changes!==1)fail(409,'The Checkout status changed while it was being closed.');
  return attemptDTO(db.prepare('SELECT * FROM stripe_checkout_attempts WHERE id=?').get(attempt.id));
 });
}

function checkoutReturnUrl(appOrigin,projectId,invoiceId,result){
 const base=new URL(appOrigin);
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)fail(500,'APP_ORIGIN must be a site origin.');
 const url=new URL('/',base);url.searchParams.set('view','projects');url.searchParams.set('project',projectId);url.searchParams.set('tab','Billing');url.searchParams.set('invoice',invoiceId);url.searchParams.set('checkout',result);
 if(result==='return')url.searchParams.set('session_id','{CHECKOUT_SESSION_ID}');
 return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D','{CHECKOUT_SESSION_ID}');
}

/** Caller passes a role calculated from the authenticated project membership. */
export async function createStripeCheckout(db,stripe,{studioId,projectId,invoiceId,accessRole,appOrigin}){
 if(!['Owner','Approver'].includes(accessRole))fail(403,'Only the project approver or studio owner can pay this invoice.');
 const invoice=invoiceRow(db,{studioId,projectId,invoiceId});
 if(invoice.cancelled_at)fail(409,'This invoice has been cancelled.');
 const balance=invoiceBalance(db,invoice);
 if(balance<=0)fail(409,'This invoice has already been paid.');
 const connected=db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studioId);
 if(!connected)fail(409,'The studio has not connected Stripe.');
 const account=await stripe.accounts.retrieve(connected.stripe_account_id);
 if(!account?.charges_enabled||account.id!==connected.stripe_account_id)fail(409,'The studio Stripe account cannot accept payments yet.');
 let attempt=transaction(db,()=>{
  const existing=activeStripeCheckout(db,{studioId,invoiceId});
  if(existing){if(existing.stripe_account_id!==connected.stripe_account_id||existing.amount_minor!==balance)fail(409,'The invoice balance changed while Checkout was open. Resolve the existing payment session first.');return existing;}
  const attemptId=randomUUID(),created=now();
  db.prepare(`INSERT INTO stripe_checkout_attempts(id,studio_id,project_id,invoice_id,stripe_account_id,amount_minor,currency,status,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,'creating',?,?)`).run(attemptId,studioId,projectId,invoiceId,connected.stripe_account_id,balance,invoice.currency,created,created);
  return db.prepare('SELECT * FROM stripe_checkout_attempts WHERE id=?').get(attemptId);
 });
 if(attempt.status==='open'&&attempt.stripe_session_id&&attempt.checkout_url)return attemptDTO(attempt);
 if(attempt.status==='processing')fail(409,'The payment is processing. Check its status before starting again.');
 const metadata={attemptId:attempt.id,studioId,projectId,invoiceId};
 const params={mode:'payment',client_reference_id:attempt.id,
  line_items:[{price_data:{currency:invoice.currency.toLowerCase(),unit_amount:balance,product_data:{name:`Invoice ${invoice.number}`}},quantity:1}],
  metadata,payment_intent_data:{metadata},
  success_url:checkoutReturnUrl(appOrigin,projectId,invoiceId,'return'),
  cancel_url:checkoutReturnUrl(appOrigin,projectId,invoiceId,'cancelled')};
 // The same persisted key and exact parameters make a retry safe after a lost response.
 const session=await stripe.checkout.sessions.create(params,{stripeAccount:attempt.stripe_account_id,idempotencyKey:`caleane-checkout-${attempt.id}`});
 if(!session?.id||!session?.url||session.mode!=='payment')fail(502,'Stripe did not return a usable Checkout session.');
 attempt=transaction(db,()=>{
  const current=db.prepare('SELECT * FROM stripe_checkout_attempts WHERE id=?').get(attempt.id);
  if(current.stripe_session_id&&current.stripe_session_id!==session.id)fail(409,'Checkout session mismatch.');
  db.prepare(`UPDATE stripe_checkout_attempts SET stripe_session_id=?,checkout_url=?,
   status=CASE WHEN status='creating' THEN 'open' ELSE status END,updated_at=? WHERE id=?`)
   .run(session.id,session.url,now(),attempt.id);
  return db.prepare('SELECT * FROM stripe_checkout_attempts WHERE id=?').get(attempt.id);
 });
 return attemptDTO(attempt);
}

/** Pass the unparsed raw HTTP body and Stripe-Signature header. */
export function verifyStripeEvent(stripe,{rawBody,signature,webhookSecret}){
 if(!webhookSecret||!signature||!(Buffer.isBuffer(rawBody)||typeof rawBody==='string'))fail(400,'Missing Stripe webhook signature or raw body.');
 try{return stripe.webhooks.constructEvent(rawBody,signature,webhookSecret);}catch{fail(400,'Invalid Stripe webhook signature.');}
}
export function processStripeWebhook(db,stripe,options){return applyInvoiceCheckoutEvent(db,verifyStripeEvent(stripe,options));}

/** Applies an already verified event to invoice Checkout attempts. */
export function applyInvoiceCheckoutEvent(db,event){
 if(!CHECKOUT_EVENTS.has(event.type))return {handled:false,result:'ignored'};
 const session=event.data?.object;
 if(!event.id||!session?.id||session.object!=='checkout.session'||!event.account)fail(400,'Malformed Stripe Checkout event.');
 return transaction(db,()=>{
  const duplicate=db.prepare('SELECT result FROM stripe_webhook_events WHERE event_id=?').get(event.id);
  if(duplicate)return {handled:true,result:duplicate.result,duplicate:true};
  const attempt=db.prepare('SELECT * FROM stripe_checkout_attempts WHERE id=?').get(session.metadata?.attemptId);
  if(!attempt||attempt.stripe_account_id!==event.account||attempt.stripe_session_id&&attempt.stripe_session_id!==session.id||
   session.client_reference_id!==attempt.id||session.metadata?.studioId!==attempt.studio_id||
   session.metadata?.projectId!==attempt.project_id||session.metadata?.invoiceId!==attempt.invoice_id||
   session.mode!=='payment'||session.amount_total!==attempt.amount_minor||
   session.currency?.toUpperCase()!==attempt.currency){
   fail(409,'Stripe Checkout event does not match its invoice and connected account.');
  }
  const invoice=invoiceRow(db,{studioId:attempt.studio_id,projectId:attempt.project_id,invoiceId:attempt.invoice_id});
  let result='ignored',status=attempt.status,reviewReason=attempt.review_reason,paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
   if(session.payment_status==='paid'){
    if(attempt.status==='paid'){result='already_paid';}
    else if(invoice.cancelled_at||invoiceBalance(db,invoice)<attempt.amount_minor){status='needs_review';reviewReason=invoice.cancelled_at?'Invoice was cancelled after Checkout began.':'Invoice balance changed after Checkout began.';result='needs_review';}
    else{
     const receivedAt=new Date((Number(event.created)||Math.floor(Date.now()/1000))*1000).toISOString().slice(0,10);
     const paymentKey='stripe_'+createHash('sha256').update(session.id).digest('hex');
     db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source,client_key)
      VALUES(?,?,?,?,'stripe_external',?,?,'',?,'Stripe','stripe_verified',?)`).run(randomUUID(),attempt.studio_id,attempt.invoice_id,attempt.amount_minor,paymentIntentId||session.id,receivedAt,now(),paymentKey);
     status='paid';result='paid';
    }
   }else if(attempt.status!=='paid'){status='processing';result='processing';}
  }else if(event.type==='checkout.session.async_payment_failed'&&attempt.status!=='paid'){
   status='failed';result='failed';
  }else if(event.type==='checkout.session.expired'&&attempt.status!=='paid'){
   status='expired';result='expired';
  }
  db.prepare(`UPDATE stripe_checkout_attempts SET stripe_session_id=COALESCE(stripe_session_id,?),status=?,payment_intent_id=COALESCE(payment_intent_id,?),review_reason=?,updated_at=? WHERE id=?`)
   .run(session.id,status,paymentIntentId,reviewReason,now(),attempt.id);
  db.prepare('INSERT INTO stripe_webhook_events VALUES(?,?,?,?,?,?)').run(event.id,event.account,attempt.id,event.type,result,now());
  return {handled:true,result,attemptId:attempt.id,invoiceId:attempt.invoice_id};
 });
}

export function listStripeCheckoutAttempts(db,{studioId,invoiceId}){
 return db.prepare('SELECT * FROM stripe_checkout_attempts WHERE studio_id=? AND invoice_id=? ORDER BY created_at DESC').all(studioId,invoiceId).map(attemptDTO);
}
