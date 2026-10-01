import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {transaction,now} from './store.mjs';
import {connectStudioStripeAccount} from './stripe-payments.mjs';

const COUNTRIES=new Set(['GB','US']);
const CALLBACK_LIFETIME_MS=24*60*60*1000;
const ACCOUNT_RETRY_MS=20*60*60*1000; // Stripe retains idempotency results for at least 24 hours.

function fail(status,message){throw Object.assign(new Error(message),{status});}
function token(){return randomBytes(32).toString('base64url');}
function digest(value){return createHash('sha256').update(value).digest('hex');}
function validState(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);}
function requireOwner(db,studioId,ownerUserId){
 if(!studioId||!ownerUserId||!db.prepare("SELECT 1 FROM memberships WHERE studio_id=? AND user_id=? AND role='owner'").get(studioId,ownerUserId))fail(403,'Only a studio owner can manage Stripe setup.');
 const user=db.prepare('SELECT email FROM users WHERE id=?').get(ownerUserId);
 if(!user)fail(403,'Only a studio owner can manage Stripe setup.');
 return user;
}
function callbackOrigin(appOrigin){
 let url;
 try{url=new URL(appOrigin);}catch{fail(500,'APP_ORIGIN must be a valid site origin.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||
  url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))fail(500,'Stripe onboarding requires an HTTPS app origin (or local test origin).');
 return url.origin;
}
function callbackUrl(origin,kind,state){
 const url=new URL(`/api/stripe/connect/${kind}`,origin);url.searchParams.set('state',state);return url.toString();
}
function onboardingRow(db,studioId){return db.prepare('SELECT * FROM stripe_onboarding_accounts WHERE studio_id=?').get(studioId)||null;}
function statusDTO(account,ready,studioId){return {studioId,status:ready?'connected':'pending',chargesEnabled:Boolean(account.charges_enabled),detailsSubmitted:Boolean(account.details_submitted),payoutsEnabled:Boolean(account.payouts_enabled),country:account.country||''};}

/** Install after the base store and Stripe payment tables open. Safe to call again. */
export function installStripeOnboarding(db){
 db.exec(`CREATE TABLE IF NOT EXISTS stripe_onboarding_accounts(
  studio_id TEXT PRIMARY KEY REFERENCES studios(id),owner_user_id TEXT NOT NULL REFERENCES users(id),
  country TEXT NOT NULL CHECK(country IN ('GB','US')),owner_email TEXT NOT NULL,
  account_create_key TEXT NOT NULL UNIQUE,stripe_account_id TEXT UNIQUE,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id,studio_id) REFERENCES memberships(user_id,studio_id));
 CREATE TABLE IF NOT EXISTS stripe_onboarding_links(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,return_state_hash TEXT NOT NULL UNIQUE,
  refresh_state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('creating','active','used','revoked')),
  expires_at INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(studio_id) REFERENCES stripe_onboarding_accounts(studio_id),
  FOREIGN KEY(owner_user_id,studio_id) REFERENCES memberships(user_id,studio_id));
 CREATE INDEX IF NOT EXISTS stripe_onboarding_links_studio ON stripe_onboarding_links(studio_id,status,created_at DESC);`);
}

async function ensureAccount(db,stripe,{studioId,ownerUserId,country}){
 const user=requireOwner(db,studioId,ownerUserId);
 if(!COUNTRIES.has(country))fail(400,'Choose the United Kingdom or United States for your Stripe account.');
 let row=transaction(db,()=>{
  const prior=onboardingRow(db,studioId);
  if(prior){
   if(prior.country!==country)fail(409,'This studio has already started Stripe setup in another country.');
   return prior;
  }
  const at=now(),key=randomUUID();
  db.prepare(`INSERT INTO stripe_onboarding_accounts(studio_id,owner_user_id,country,owner_email,account_create_key,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?)`).run(studioId,ownerUserId,country,user.email,key,at,at);
  return onboardingRow(db,studioId);
 });
 if(row.stripe_account_id)return row;
 if(Date.now()-Date.parse(row.created_at)>ACCOUNT_RETRY_MS)fail(409,'Stripe account creation needs review before it can be retried.');
 // Parameters come only from persisted studio/owner data and stay identical on retries.
 const account=await stripe.accounts.create({type:'express',country:row.country,email:row.owner_email,
  capabilities:{card_payments:{requested:true},transfers:{requested:true}},metadata:{calenne_studio_id:row.studio_id}},
  {idempotencyKey:`calenne-connect-account-${row.account_create_key}`});
 if(!/^acct_[A-Za-z0-9]{8,}$/.test(account?.id||'')||account.country!==row.country)fail(502,'Stripe did not return the expected connected account.');
 transaction(db,()=>{
  const current=onboardingRow(db,studioId);
  if(current.stripe_account_id&&current.stripe_account_id!==account.id)fail(409,'Stripe account setup changed unexpectedly.');
  db.prepare('UPDATE stripe_onboarding_accounts SET stripe_account_id=?,updated_at=? WHERE studio_id=? AND stripe_account_id IS NULL').run(account.id,now(),studioId);
 });
 return onboardingRow(db,studioId);
}

async function newAccountLink(db,stripe,{studioId,ownerUserId,appOrigin}){
 requireOwner(db,studioId,ownerUserId);
 const row=onboardingRow(db,studioId);
 if(!row?.stripe_account_id||row.owner_user_id!==ownerUserId)fail(403,'Stripe setup belongs to the owner who started it.');
 const origin=callbackOrigin(appOrigin),returnState=token(),refreshState=token(),linkId=randomUUID(),at=now();
 db.prepare(`INSERT INTO stripe_onboarding_links(id,studio_id,owner_user_id,stripe_account_id,return_state_hash,refresh_state_hash,status,expires_at,created_at,updated_at)
  VALUES(?,?,?,?,?,?,'creating',?,?,?)`).run(linkId,studioId,ownerUserId,row.stripe_account_id,digest(returnState),digest(refreshState),Date.now()+CALLBACK_LIFETIME_MS,at,at);
 const params={account:row.stripe_account_id,type:'account_onboarding',
  refresh_url:callbackUrl(origin,'refresh',refreshState),return_url:callbackUrl(origin,'return',returnState)};
 const link=await stripe.accountLinks.create(params,{idempotencyKey:`calenne-connect-link-${linkId}`});
 let parsed;
 try{parsed=new URL(link?.url);}catch{fail(502,'Stripe did not return an account link.');}
 if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.stripe.com'))fail(502,'Stripe did not return a secure account link.');
 transaction(db,()=>{
  db.prepare("UPDATE stripe_onboarding_links SET status='revoked',updated_at=? WHERE studio_id=? AND status='active'").run(now(),studioId);
  db.prepare("UPDATE stripe_onboarding_links SET status='active',updated_at=? WHERE id=? AND status='creating'").run(now(),linkId);
 });
 // Account links grant access to sensitive information: return directly to the authenticated owner only.
 return {studioId,status:'onboarding',url:link.url,country:row.country};
}

/** Owner-authenticated route: POST /api/stripe/connect/start {country:'GB'|'US'}. */
export async function startStripeOnboarding(db,stripe,{studioId,ownerUserId,country,appOrigin}){
 callbackOrigin(appOrigin);
 const row=await ensureAccount(db,stripe,{studioId,ownerUserId,country});
 const account=await stripe.accounts.retrieve(row.stripe_account_id);
 if(account?.id!==row.stripe_account_id)fail(502,'Stripe account lookup did not match this studio.');
 if(account.charges_enabled){
  await connectStudioStripeAccount(db,stripe,{studioId,stripeAccountId:row.stripe_account_id});
  return statusDTO(account,true,studioId);
 }
 return newAccountLink(db,stripe,{studioId,ownerUserId,appOrigin});
}

function claimCallback(db,{ownerUserId,state,kind}){
 if(!validState(state))fail(403,'Stripe setup link is invalid or has expired.');
 return transaction(db,()=>{
  const column=kind==='return'?'return_state_hash':'refresh_state_hash';
  const link=db.prepare(`SELECT * FROM stripe_onboarding_links WHERE ${column}=?`).get(digest(state));
  if(!link||link.owner_user_id!==ownerUserId||link.status!=='active'||link.expires_at<Date.now())fail(403,'Stripe setup link is invalid or has expired.');
  requireOwner(db,link.studio_id,ownerUserId);
  const account=onboardingRow(db,link.studio_id);
  if(!account||account.owner_user_id!==ownerUserId||account.stripe_account_id!==link.stripe_account_id)fail(403,'Stripe setup link is invalid or has expired.');
  const result=db.prepare("UPDATE stripe_onboarding_links SET status='used',updated_at=? WHERE id=? AND status='active'").run(now(),link.id);
  if(result.changes!==1)fail(403,'Stripe setup link has already been used.');
  return {studioId:link.studio_id,stripeAccountId:link.stripe_account_id,country:account.country};
 });
}

/** Owner-authenticated GET callback; the state comes from the URL, never an account ID. */
export async function refreshStripeOnboarding(db,stripe,{ownerUserId,state,appOrigin}){
 callbackOrigin(appOrigin);
 const claim=claimCallback(db,{ownerUserId,state,kind:'refresh'});
 return newAccountLink(db,stripe,{studioId:claim.studioId,ownerUserId,appOrigin});
}

/** A return means the flow was left; Stripe account status decides whether payments can start. */
export async function returnFromStripeOnboarding(db,stripe,{ownerUserId,state}){
 const claim=claimCallback(db,{ownerUserId,state,kind:'return'});
 const account=await stripe.accounts.retrieve(claim.stripeAccountId);
 if(account?.id!==claim.stripeAccountId)fail(502,'Stripe account lookup did not match this studio.');
 if(account.charges_enabled)await connectStudioStripeAccount(db,stripe,{studioId:claim.studioId,stripeAccountId:claim.stripeAccountId});
 return statusDTO(account,Boolean(account.charges_enabled),claim.studioId);
}

/** Owner-authenticated status route. Useful after returning or revisiting Settings. */
export async function stripeOnboardingStatus(db,stripe,{studioId,ownerUserId}){
 requireOwner(db,studioId,ownerUserId);
 const row=onboardingRow(db,studioId);
 if(!row?.stripe_account_id)return {studioId,status:row?'creating':'not_started',chargesEnabled:false,detailsSubmitted:false,payoutsEnabled:false,country:row?.country||''};
 const account=await stripe.accounts.retrieve(row.stripe_account_id);
 if(account?.id!==row.stripe_account_id)fail(502,'Stripe account lookup did not match this studio.');
 if(account.charges_enabled)await connectStudioStripeAccount(db,stripe,{studioId,stripeAccountId:row.stripe_account_id});
 return statusDTO(account,Boolean(account.charges_enabled),studioId);
}
