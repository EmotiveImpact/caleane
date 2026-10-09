import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../store.mjs';
import {installStripePayments} from '../stripe-payments.mjs';
import {installStripeOnboarding,startStripeOnboarding,refreshStripeOnboarding,returnFromStripeOnboarding,stripeOnboardingStatus} from '../stripe-onboarding.mjs';

const origin='http://127.0.0.1:4321';
function stateFrom(url){return new URL(url).searchParams.get('state');}

async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-onboarding-'));
 const db=openStore(path.join(dir,'workspace.sqlite'));
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run('studio-one','studio-one','Studio One','#000000','[]');
 db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run('studio-two','studio-two','Studio Two','#000000','[]');
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('owner-one','owner@example.test','Owner','test-hash');
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('other-owner','other@example.test','Other Owner','test-hash');
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('client-one','client@example.test','Client','test-hash');
 db.prepare("INSERT INTO memberships VALUES('owner-one','studio-one','owner')").run();
 db.prepare("INSERT INTO memberships VALUES('other-owner','studio-two','owner')").run();
 db.prepare("INSERT INTO memberships VALUES('client-one','studio-one','client')").run();
 installStripePayments(db);
 installStripeOnboarding(db);
 return {db,async close(){db.close();await rm(dir,{recursive:true,force:true});}};
}

function fakeStripe(){
 const created=[],links=[];
 let chargesEnabled=false,failAccountCreate=false;
 const accountId='acct_1234567890';
 return {created,links,
  setChargesEnabled(value){chargesEnabled=value;},
  failNextAccountCreate(){failAccountCreate=true;},
  client:{
   accounts:{
    async create(params,options){created.push({params,options});if(failAccountCreate){failAccountCreate=false;throw new Error('temporary Stripe failure');}return {id:accountId,country:params.country,charges_enabled:false};},
    async retrieve(id){return {id,country:created[0]?.params.country||'GB',charges_enabled:chargesEnabled,details_submitted:chargesEnabled,payouts_enabled:chargesEnabled};}
   },
   accountLinks:{async create(params,options){links.push({params,options});return {url:`https://connect.stripe.com/setup/c/${accountId}/${links.length}`,expires_at:Math.floor(Date.now()/1000)+300};}}
  }
 };
}

test('onboarding binds an Express account and single-use links to the authenticated studio owner',async()=>{
 const f=await fixture();
 try{
  const stripe=fakeStripe();
  const args={studioId:'studio-one',ownerUserId:'owner-one',country:'GB',appOrigin:origin};
  await assert.rejects(startStripeOnboarding(f.db,stripe.client,{...args,ownerUserId:'client-one'}),{status:403});
  await assert.rejects(startStripeOnboarding(f.db,stripe.client,{...args,ownerUserId:'other-owner'}),{status:403});
  await assert.rejects(startStripeOnboarding(f.db,stripe.client,{...args,country:'FR'}),{status:400});
  await assert.rejects(startStripeOnboarding(f.db,stripe.client,{...args,appOrigin:'http://example.com'}),{status:500});
  assert.equal(stripe.created.length,0);
  const first=await startStripeOnboarding(f.db,stripe.client,args);
  assert.equal(first.status,'onboarding');
  assert.equal(stripe.created.length,1);
  assert.equal(stripe.created[0].params.type,'express');
  assert.equal(stripe.created[0].params.country,'GB');
  assert.equal(stripe.created[0].params.email,'owner@example.test');
  assert.equal(stripe.created[0].params.capabilities.card_payments.requested,true);
  assert.equal(stripe.created[0].params.capabilities.transfers.requested,true);
  assert.match(stripe.created[0].options.idempotencyKey,/^calenne-connect-account-/);
  assert.equal(stripe.links.length,1);
  assert.equal(new URL(stripe.links[0].params.return_url).origin,origin);
  const refreshState=stateFrom(stripe.links[0].params.refresh_url),returnState=stateFrom(stripe.links[0].params.return_url);
  const row=f.db.prepare('SELECT * FROM stripe_onboarding_links').get();
  assert.notEqual(row.return_state_hash,returnState);
  assert.notEqual(row.refresh_state_hash,refreshState);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stripe_studio_accounts').get().n,0);
  await assert.rejects(refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'client-one',state:refreshState,appOrigin:origin}),{status:403});
  await assert.rejects(refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'other-owner',state:refreshState,appOrigin:origin}),{status:403});
  await assert.rejects(refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:'bad',appOrigin:origin}),{status:403});
  await assert.rejects(refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:refreshState,appOrigin:'http://example.com'}),{status:500});
  const refreshed=await refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:refreshState,appOrigin:origin});
  assert.equal(refreshed.status,'onboarding');
  assert.equal(stripe.created.length,1);
  assert.equal(stripe.links.length,2);
  await assert.rejects(refreshStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:refreshState,appOrigin:origin}),{status:403});
  await assert.rejects(returnFromStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:returnState}),{status:403});
  const nextReturn=stateFrom(stripe.links[1].params.return_url);
  const pending=await returnFromStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state:nextReturn});
  assert.equal(pending.status,'pending');
  assert.equal(pending.studioId,'studio-one');
  assert.equal(pending.chargesEnabled,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stripe_studio_accounts').get().n,0);
 }finally{await f.close();}
});

test('return validates live charging status and persists a studio account without accepting an account ID from the browser',async()=>{
 const f=await fixture();
 try{
  const stripe=fakeStripe();
  const args={studioId:'studio-one',ownerUserId:'owner-one',country:'US',appOrigin:origin};
  const started=await startStripeOnboarding(f.db,stripe.client,args);
  assert.equal(started.country,'US');
  const state=stateFrom(stripe.links[0].params.return_url);
  stripe.setChargesEnabled(true);
  const result=await returnFromStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state});
  assert.equal(result.status,'connected');
  assert.equal(result.studioId,'studio-one');
  assert.equal(result.country,'US');
  assert.equal(f.db.prepare("SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id='studio-one'").get().stripe_account_id,'acct_1234567890');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM stripe_studio_accounts WHERE studio_id='studio-two'").get().n,0);
  await assert.rejects(returnFromStripeOnboarding(f.db,stripe.client,{ownerUserId:'owner-one',state}),{status:403});
  assert.equal((await stripeOnboardingStatus(f.db,stripe.client,{studioId:'studio-one',ownerUserId:'owner-one'})).status,'connected');
  await assert.rejects(stripeOnboardingStatus(f.db,stripe.client,{studioId:'studio-one',ownerUserId:'other-owner'}),{status:403});
  assert.equal((await startStripeOnboarding(f.db,stripe.client,args)).status,'connected');
  assert.equal(stripe.created.length,1);
  assert.equal(stripe.links.length,1);
  assert.equal(started.url.startsWith('https://connect.stripe.com/'),true);
 }finally{await f.close();}
});

test('an uncertain account-create response retries with the same persisted Stripe idempotency key',async()=>{
 const f=await fixture();
 try{
  const stripe=fakeStripe();stripe.failNextAccountCreate();
  const args={studioId:'studio-one',ownerUserId:'owner-one',country:'GB',appOrigin:origin};
  await assert.rejects(startStripeOnboarding(f.db,stripe.client,args),/temporary Stripe failure/);
  assert.equal(f.db.prepare("SELECT stripe_account_id FROM stripe_onboarding_accounts WHERE studio_id='studio-one'").get().stripe_account_id,null);
  assert.equal((await startStripeOnboarding(f.db,stripe.client,args)).status,'onboarding');
  assert.equal(stripe.created.length,2);
  assert.equal(stripe.created[0].options.idempotencyKey,stripe.created[1].options.idempotencyKey);
  assert.deepEqual(stripe.created[0].params,stripe.created[1].params);
 }finally{await f.close();}
});
