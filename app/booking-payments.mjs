import {transaction,now} from './store.mjs';
import {bookingRow,confirmPaidBooking,releaseHeldBooking} from './consultations.mjs';

// Card payment when a client books a consultation. The booking is held as
// "Awaiting payment" while the client is on Stripe Checkout, and only a signed
// webhook from the studio's connected account confirms it. A return from
// Stripe alone never confirms anything.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const CHECKOUT_OPEN_SECONDS=31*60;

export function installBookingPayments(db){db.exec(`CREATE TABLE IF NOT EXISTS card_payment_events(
 event_id TEXT PRIMARY KEY,stripe_account_id TEXT NOT NULL,kind TEXT NOT NULL,type TEXT NOT NULL,result TEXT NOT NULL,processed_at TEXT NOT NULL);`);}

export function isBookingEvent(event){return ['checkout.session.completed','checkout.session.expired'].includes(event?.type)&&event.data?.object?.metadata?.kind==='booking';}

function returnUrl(appOrigin,slug,bookingId,result){
 const url=new URL(`/book/${slug}`,appOrigin);url.searchParams.set('booking',bookingId);url.searchParams.set('payment',result);return url.toString();
}

/** Creates, or resumes, the Checkout page for a held booking. */
export async function startBookingCheckout(db,stripe,{studio,bookingId,appOrigin,nowMs=Date.now()}){
 const row=bookingRow(db,studio.id,bookingId),data=JSON.parse(row.data);
 if(row.status!=='Awaiting payment'||!data.payment)fail(409,'This booking is not waiting for payment.');
 if(data.payment.sessionId&&data.payment.url)return {url:data.payment.url};
 // The Checkout page must close before the hold does.
 if(nowMs+CHECKOUT_OPEN_SECONDS*1000>Date.parse(data.payment.holdUntil)){transaction(db,()=>releaseHeldBooking(db,row,{reason:'expired'}));fail(409,'That time is no longer held. Please choose it again.');}
 const connected=db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studio.id);
 const account=connected&&await stripe.accounts.retrieve(connected.stripe_account_id).catch(()=>null);
 if(!account?.charges_enabled||account.id!==connected.stripe_account_id){transaction(db,()=>releaseHeldBooking(db,row,{reason:'unavailable'}));fail(409,'Card payment is not available for this studio right now. Please contact them directly.');}
 const metadata={kind:'booking',bookingId:row.id,studioId:studio.id};
 let session;
 try{
  session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],client_reference_id:row.id,customer_email:data.email,
   expires_at:Math.floor(nowMs/1000)+CHECKOUT_OPEN_SECONDS,
   line_items:[{price_data:{currency:data.payment.currency.toLowerCase(),unit_amount:data.payment.amountMinor,product_data:{name:`${data.payment.label}: ${data.title}`}},quantity:1}],
   metadata,payment_intent_data:{metadata},
   success_url:returnUrl(appOrigin,studio.slug,row.id,'done'),cancel_url:returnUrl(appOrigin,studio.slug,row.id,'cancelled')},
   {stripeAccount:connected.stripe_account_id,idempotencyKey:`caleane-booking-${row.id}`});
 }catch(error){
  transaction(db,()=>releaseHeldBooking(db,row,{reason:'failed'}));
  throw Object.assign(new Error('Payment could not be started. Please try again.'),{status:502,cause:error});
 }
 if(!session?.id||!session?.url||session.mode!=='payment')fail(502,'Stripe did not return a usable payment page.');
 transaction(db,()=>{
  const current=bookingRow(db,studio.id,row.id),next=JSON.parse(current.data);
  next.payment={...next.payment,sessionId:session.id,url:session.url,stripeAccountId:connected.stripe_account_id};
  db.prepare('UPDATE consultations SET data=? WHERE id=?').run(JSON.stringify(next),row.id);
 });
 return {url:session.url};
}

/** Public: the client came back from Checkout without paying, so the time is released straight away. */
export async function releaseBooking(db,stripe,{studio,bookingId}){
 const row=bookingRow(db,studio.id,bookingId),data=JSON.parse(row.data);
 if(row.status!=='Awaiting payment')return;
 if(data.payment?.sessionId){
  let session;
  try{session=await stripe.checkout.sessions.expire(data.payment.sessionId,{},{stripeAccount:data.payment.stripeAccountId});}
  catch{session=await stripe.checkout.sessions.retrieve(data.payment.sessionId,{},{stripeAccount:data.payment.stripeAccountId}).catch(()=>null);}
  // A completed session means the payment went through after all; the webhook will confirm it.
  if(session?.status!=='expired')return;
 }
 transaction(db,()=>{const current=bookingRow(db,studio.id,row.id);if(current.status==='Awaiting payment')releaseHeldBooking(db,current,{reason:'abandoned'});});
}

/** Applies a verified Connect webhook event for a booking payment. */
export function applyBookingEvent(db,event){
 const session=event.data.object;
 if(!event.id||!event.account||session.object!=='checkout.session')fail(400,'Malformed Stripe booking event.');
 return transaction(db,()=>{
  const duplicate=db.prepare('SELECT result FROM card_payment_events WHERE event_id=?').get(event.id);
  if(duplicate)return {handled:true,result:duplicate.result,duplicate:true};
  const row=db.prepare('SELECT * FROM consultations WHERE id=? AND studio_id=?').get(session.metadata?.bookingId,session.metadata?.studioId);
  const payment=row&&JSON.parse(row.data).payment;
  if(!row||!payment||payment.stripeAccountId!==event.account||payment.sessionId!==session.id||session.client_reference_id!==row.id||
   session.mode!=='payment'||session.amount_total!==payment.amountMinor||session.currency?.toUpperCase()!==payment.currency)fail(409,'Stripe booking event does not match its booking and connected account.');
  let result='ignored';
  if(event.type==='checkout.session.completed'&&session.payment_status==='paid'){
   const paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||'';
   if(row.status==='Awaiting payment'){confirmPaidBooking(db,row,{paymentIntentId,paidAt:now()});result='booked';}
   else if(payment.status==='paid')result='already_paid';
   else{releaseHeldBooking(db,row,{reason:'paid_late',review:`Paid after the time was released (${paymentIntentId}). Check the time with the client or refund the payment in Stripe.`});result='needs_review';}
  }else if(event.type==='checkout.session.expired'&&row.status==='Awaiting payment'){releaseHeldBooking(db,row,{reason:'expired'});result='released';}
  db.prepare('INSERT INTO card_payment_events VALUES(?,?,?,?,?,?)').run(event.id,event.account,'booking',event.type,result,now());
  return {handled:true,result,bookingId:row.id};
 });
}
