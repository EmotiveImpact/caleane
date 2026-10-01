import React,{useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import '../folio-stripe-connect.css';

const setupUrl=`/api/stripe/connect`;
const countryName={GB:'United Kingdom',US:'United States'};

export function StripeConnectSettings({studio,request}){
 const [onboarding,setOnboarding]=useState(null),[country,setCountry]=useState('GB'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setLoading(true);setError('');try{const data=await request(`${setupUrl}/status?studio=${studio.id}`);setOnboarding(data.onboarding);if(countryName[data.onboarding?.country])setCountry(data.onboarding.country);}catch(cause){setError(cause.message||'Stripe status could not be loaded.');}finally{setLoading(false);}}
 useEffect(()=>{let active=true;setOnboarding(null);setLoading(true);setError('');request(`${setupUrl}/status?studio=${studio.id}`).then(data=>{if(!active)return;setOnboarding(data.onboarding);if(countryName[data.onboarding?.country])setCountry(data.onboarding.country);}).catch(cause=>{if(active)setError(cause.message||'Stripe status could not be loaded.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[studio.id,request]);
 async function start(){setBusy(true);setError('');try{const data=await request(`${setupUrl}/start?studio=${studio.id}`,'POST',{country});const next=data.onboarding;if(next?.status==='connected'){setOnboarding(next);return;}const destination=new URL(next?.url||'');if(destination.protocol!=='https:'||destination.hostname!=='connect.stripe.com')throw new Error('Stripe did not return a secure account setup link.');window.location.assign(destination.toString());}catch(cause){setError(cause.message||'Stripe setup could not be opened.');}finally{setBusy(false);}}
 const status=onboarding?.status;
 const ready=status==='connected'&&onboarding.chargesEnabled;
 const lockedCountry=Boolean(onboarding?.country&&status!=='not_started');
 return <section className="stripe-connect-settings" aria-labelledby="stripe-connect-title">
  <div className="stripe-connect-intro"><p className="eyebrow">PAYMENTS</p><h2 id="stripe-connect-title">Accept payments through Stripe.</h2><p>Connect your studio’s own Stripe account to let clients pay an invoice inside a secure Checkout. Bank transfer and other payment instructions remain available.</p></div>
  <div className="stripe-connect-control" aria-live="polite">
   {loading?<p className="stripe-connect-status">Checking account status…</p>:!onboarding?<p>Stripe account status could not be loaded.</p>:status==='unavailable'?<><span className="stripe-connect-tag">Unavailable</span><p>Online Checkout is not configured for this workspace yet.</p></>:ready?<><span className="stripe-connect-tag">Connected</span><h3>Ready to accept payments</h3><p>{countryName[onboarding.country]||onboarding.country} account connected. Clients with invoice access can open Stripe Checkout from Billing.</p>{!onboarding.payoutsEnabled&&<p>Stripe is still reviewing payouts. Check your Stripe dashboard for any remaining requirements.</p>}</>:<><span className="stripe-connect-tag">{status==='pending'?'Setup in progress':status==='creating'?'Account started':'Not connected'}</span><p>{status==='pending'?(onboarding.detailsSubmitted?'Stripe is reviewing your account. You can check the status or continue setup if Stripe asks for more details.':'Continue setup with Stripe to provide your business details.'):status==='creating'?'Continue setup to finish creating your studio’s Stripe account.':'Choose the country where your studio is registered, then continue to Stripe.'}</p><label className="stripe-connect-country">Studio country<select value={country} disabled={busy||lockedCountry} onChange={event=>setCountry(event.target.value)}><option value="GB">United Kingdom</option><option value="US">United States</option></select></label>{lockedCountry&&<small>The country is fixed once account setup begins.</small>}<button className="stripe-connect-primary" type="button" disabled={busy} onClick={start}>{busy?'Opening Stripe…':status==='pending'||status==='creating'?'Continue Stripe setup':'Connect with Stripe'} </button></>}
   <button className="stripe-connect-refresh" type="button" disabled={loading||busy} onClick={refresh}><RefreshCw size={14}/> Refresh status</button>
   {error&&<p className="stripe-connect-error" role="alert">{error}</p>}
  </div>
 </section>;
}
