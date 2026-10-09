import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarCheck,CalendarPlus,CalendarX,Clock,CreditCard,Mail,MapPin,Phone,RefreshCw,Video} from 'lucide-react';
import {bookingIcs,icsHref} from '../lib/booking-calendar';
import '../public-booking.css';

const dayKey=(iso,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const dayLabel=(key,zone)=>new Date(key+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const longDay=(iso,zone)=>new Date(iso).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:zone});
const time=(iso,zone)=>new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:zone});
const money=(minor,currency)=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);}catch{return `${(minor/100).toFixed(2)} ${currency}`;}};
const newKey=()=>crypto.randomUUID().replaceAll('-','');
const meeting={video:['Video call',Video],phone:['Phone call',Phone],in_person:['In person',MapPin]};
const zoneName=zone=>zone.replaceAll('_',' ');
const remember=(id,token)=>{try{sessionStorage.setItem('caleane-booking:'+id,token);}catch{/* The link still shows on this screen. */}};
const recall=id=>{try{return sessionStorage.getItem('caleane-booking:'+id)||'';}catch{return '';}};
const manageLink=(slug,token)=>token?`/book/${slug}/manage#${token}`:'';
// The booking in the visitor's own time zone, with the studio's time alongside when it differs.
function BookingWhen({start,durationMinutes,zone,studioZone}){
 return <><p><strong>{longDay(start,zone)}</strong> at <strong>{time(start,zone)}</strong> for {durationMinutes} minutes.</p><p className="booking-muted">Shown in your time zone, {zoneName(zone)}.{studioZone&&studioZone!==zone?` That is ${time(start,studioZone)} on ${longDay(start,studioZone)} for the studio (${zoneName(studioZone)}).`:''}</p></>;
}
function CalendarLink({booking,studioName,slug,token,durationMinutes=30}){
 const ics=bookingIcs({id:booking.bookingId||booking.reference,start:booking.start,end:booking.end||new Date(Date.parse(booking.start)+durationMinutes*60000).toISOString(),title:booking.title||'Consultation',studioName,location:booking.location?.detail||'',manageUrl:token?location.origin+manageLink(slug,token):''});
 return <a className="booking-secondary booking-link" href={icsHref(ics)} download={`${(booking.title||'consultation').toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`}><CalendarPlus size={16}/>Add to calendar</a>;
}

// Public page where a prospective client books a consultation with a studio.
export function PublicBooking({slug}){
 const [page,setPage]=useState(null),[closed,setClosed]=useState(null),[error,setError]=useState(''),[day,setDay]=useState(''),[slot,setSlot]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(null),[key,setKey]=useState(newKey),[confirming,setConfirming]=useState(false),[notice,setNotice]=useState('');
 const visitorZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 function load(){return fetch('/api/booking/'+slug).then(async r=>{const d=await r.json();if(r.status===404&&d.studio){setClosed(d.studio);return;}if(!r.ok)throw new Error(d.error);setPage(d);}).catch(e=>setError(e.message));}
 useEffect(()=>{load();},[slug]);
 // Back from Stripe: a cancelled payment releases the held time; a finished one waits for Stripe's confirmation.
 useEffect(()=>{
  const params=new URLSearchParams(location.search),bookingId=params.get('booking'),payment=params.get('payment');
  if(!bookingId||!payment)return;
  history.replaceState(null,'',location.pathname);
  if(payment==='cancelled'){fetch(`/api/booking/${slug}/release`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId})}).finally(()=>{setNotice('Payment was not completed, so the time has not been booked. You can choose a time again.');load();});return;}
  let tries=0,timer;setConfirming(true);
  const check=()=>fetch(`/api/booking/${slug}/status?booking=${encodeURIComponent(bookingId)}`).then(r=>r.json()).then(d=>{
   if(d.status==='Booked'){setDone({...d,manageToken:recall(bookingId)});setConfirming(false);}
   else if(d.status==='Awaiting payment'&&++tries<20)timer=setTimeout(check,2000);
   else{setConfirming(false);setNotice(d.status==='Awaiting payment'?'Stripe is still confirming your payment. Please do not pay again; the studio will be in touch once it arrives.':'This booking was not completed. Please choose a time again.');}
  }).catch(()=>{setConfirming(false);setNotice('We could not check your booking. Please contact the studio before paying again.');});
  check();return()=>clearTimeout(timer);
 },[slug]);
 // Times are listed and confirmed in the visitor's own time zone.
 const zone=visitorZone,studioZone=page?.booking.timezone;
 const days=useMemo(()=>{const map=new Map();for(const s of page?.slots||[]){const k=dayKey(s,zone);if(!map.has(k))map.set(k,[]);map.get(k).push(s);}return [...map.entries()];},[page,zone]);
 useEffect(()=>{if(days.length&&!days.some(([k])=>k===day))setDay(days[0][0]);},[days,day]);
 async function book(event){
  event.preventDefault();setBusy(true);setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  try{const r=await fetch('/api/booking/'+slug,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({...data,start:slot})});const d=await r.json();if(!r.ok){if(r.status===409){setSlot('');await load();}throw new Error(d.error);}
   if(d.manageToken)remember(d.bookingId,d.manageToken);
   if(d.checkoutUrl){const destination=new URL(d.checkoutUrl);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error('Stripe did not return a secure payment page.');window.location.assign(destination.toString());return;}
   setDone(d);setBusy(false);}
  // Payment pages keep the button busy while the browser leaves for Stripe.
  catch(e){setError(e.message);setKey(newKey());setBusy(false);}
 }
 if(confirming)return <div className="booking-page"><main className="booking-main"><p role="status">Confirming your payment with Stripe…</p></main></div>;
 if(closed&&!page)return <div className="booking-page" style={{'--booking-accent':closed.accent}}>
  <aside className="booking-aside"><strong className="booking-studio">{closed.name}</strong><h1>Bookings are closed for now.</h1><p>{closed.name} is not taking online bookings at the moment.</p></aside>
  <main className="booking-main"><div className="booking-done"><Mail size={32}/><h2>You can still get in touch.</h2><p>Tell {closed.name} about your project and they will reply to arrange a time.</p><a className="booking-primary booking-link" href={'/intake/'+closed.slug}>Send an enquiry</a></div></main>
 </div>;
 if(!page)return <div className="booking-page"><main className="booking-main"><p role={error?'alert':'status'}>{error||'Loading available times…'}</p></main></div>;
 const [meetingLabel,MeetingIcon]=meeting[page.booking.location.type]||meeting.video,fee=page.booking.payment;
 return <div className="booking-page" style={{'--booking-accent':page.studio.accent}}>
  <aside className="booking-aside">
   {page.studio.logoUrl?<img src={page.studio.logoUrl} alt={page.studio.name}/>:<strong className="booking-studio">{page.studio.name}</strong>}
   <h1>{page.booking.title}</h1>
   {page.booking.description&&<p>{page.booking.description}</p>}
   <ul><li><Clock size={16}/>{page.booking.durationMinutes} minutes</li><li><MeetingIcon size={16}/>{meetingLabel}</li>{fee&&<li><CreditCard size={16}/>{money(fee.amountMinor,fee.currency)} {fee.label.toLowerCase()}, paid by card when you book</li>}</ul>
   <small>Times are shown in your time zone, {zoneName(zone)}.{studioZone&&studioZone!==zone?` The studio is in ${zoneName(studioZone)}.`:''}</small>
  </aside>
  <main className="booking-main">
   {done?<div className="booking-done" role="status"><CalendarCheck size={32}/><p className="booking-kicker">BOOKED · {done.reference}</p><h2>You’re booked in.</h2><BookingWhen start={done.start} durationMinutes={page.booking.durationMinutes} zone={zone} studioZone={studioZone}/>{done.location?.detail&&<p>{meetingLabel}: {/^https:\/\//.test(done.location.detail)?<a href={done.location.detail} target="_blank" rel="noreferrer">{done.location.detail}</a>:done.location.detail}</p>}{done.payment?.status==='paid'&&<p>{done.payment.label} of {money(done.payment.amountMinor,done.payment.currency)} paid. Stripe will email your receipt.</p>}<div className="booking-done-actions"><CalendarLink booking={{...done,title:done.title||page.booking.title}} durationMinutes={page.booking.durationMinutes} studioName={page.studio.name} slug={slug} token={done.manageToken}/>{done.manageToken&&<a className="booking-secondary booking-link" href={manageLink(slug,done.manageToken)}><RefreshCw size={16}/>Reschedule or cancel</a>}</div><p className="booking-muted">{page.studio.name} has your details. Keep this page’s reschedule link, or add the call to your calendar so the link is always to hand.</p></div>
   :slot?<form className="booking-form" onSubmit={book}>
    <button type="button" className="booking-back" onClick={()=>setSlot('')}><ArrowLeft size={16}/>Choose another time</button>
    <h2>{longDay(slot,zone)}, {time(slot,zone)}</h2>
    <label><span>Your name</span><input name="name" required maxLength="120" autoComplete="name"/></label>
    <label><span>Email</span><input name="email" type="email" required maxLength="254" autoComplete="email"/></label>
    <label><span>Phone (optional)</span><input name="phone" type="tel" maxLength="40" autoComplete="tel"/></label>
    <label><span>Anything you would like to share before the call? (optional)</span><textarea name="notes" rows="4" maxLength="2000" placeholder="Your date, venue or the idea in a few words"/></label>
    <input name="website" tabIndex="-1" autoComplete="off" className="booking-honeypot" aria-hidden="true"/>
    {error&&<p className="booking-error" role="alert">{error}</p>}
    <button className="booking-primary" disabled={busy}>{busy?(fee?'Opening secure payment…':'Booking…'):fee?`Continue to payment · ${money(fee.amountMinor,fee.currency)}`:'Confirm booking'}</button>
    {fee&&<p className="booking-muted">You will pay on Stripe’s secure page. We hold this time for you while you pay.</p>}
    <p className="booking-muted">Your details are shared only with {page.studio.name} so they can prepare for your call.</p>
   </form>
   :<>
    <h2>Choose a time</h2>
    {notice&&<p className="booking-notice" role="status">{notice}</p>}
    {error&&<p className="booking-error" role="alert">{error}</p>}
    {days.length?<>
     <div className="booking-days" role="group" aria-label="Available days">{days.map(([k,list])=><button key={k} aria-pressed={k===day} onClick={()=>setDay(k)}><strong>{dayLabel(k,zone)}</strong><small>{list.length} time{list.length===1?'':'s'}</small></button>)}</div>
     <div className="booking-slots" role="group" aria-label={`Available times on ${day?dayLabel(day,zone):''}`}>{(days.find(([k])=>k===day)?.[1]||[]).map(s=><button key={s} onClick={()=>setSlot(s)}>{time(s,zone)}</button>)}</div>
    </>:<p className="booking-muted">There are no free times at the moment. Please get in touch with {page.studio.name} directly.</p>}
   </>}
  </main>
 </div>;
}

// Reached from the private link on the confirmation screen, the calendar file or the email.
export function PublicBookingManage({slug}){
 const [token]=useState(()=>location.hash.slice(1)),[state,setState]=useState(null),[error,setError]=useState(''),[day,setDay]=useState(''),[slot,setSlot]=useState(''),[busy,setBusy]=useState(false),[cancelling,setCancelling]=useState(false),[notice,setNotice]=useState('');
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 async function send(body){const r=await fetch(`/api/booking/${slug}/manage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...body})});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d;}
 useEffect(()=>{send({action:'view'}).then(setState).catch(e=>setError(e.message));},[slug]);
 const days=useMemo(()=>{const map=new Map();for(const s of state?.slots||[]){const k=dayKey(s,zone);if(!map.has(k))map.set(k,[]);map.get(k).push(s);}return [...map.entries()];},[state,zone]);
 useEffect(()=>{if(days.length&&!days.some(([k])=>k===day))setDay(days[0][0]);},[days,day]);
 async function act(body,message){setBusy(true);setError('');try{const d=await send(body);setState(d);setSlot('');setCancelling(false);setNotice(message(d));}catch(e){setError(e.message);if(e.status===409)send({action:'view'}).then(setState).catch(()=>{});}finally{setBusy(false);}}
 if(!state)return <div className="booking-page"><main className="booking-main"><p role={error?'alert':'status'}>{error||'Finding your booking…'}</p></main></div>;
 const b=state.booking,cancelled=b.status==='Cancelled',[meetingLabel,MeetingIcon]=meeting[b.location?.type]||meeting.video;
 return <div className="booking-page" style={{'--booking-accent':state.studio.accent}}>
  <aside className="booking-aside"><strong className="booking-studio">{state.studio.name}</strong><h1>Your {b.title}</h1><ul><li><Clock size={16}/>{b.durationMinutes} minutes</li>{b.location?.detail&&<li><MeetingIcon size={16}/>{meetingLabel}</li>}</ul><small>Reference {b.reference}. Times are shown in your time zone, {zoneName(zone)}.</small></aside>
  <main className="booking-main">
   {notice&&<p className="booking-notice" role="status">{notice}</p>}
   {error&&<p className="booking-error" role="alert">{error}</p>}
   <div className="booking-done">{cancelled?<CalendarX size={32}/>:<CalendarCheck size={32}/>}<p className="booking-kicker">{cancelled?'CANCELLED':b.canChange?'BOOKED':b.status.toUpperCase()} · {b.reference}</p><h2>{cancelled?'This booking is cancelled.':'Your booking'}</h2>
    <BookingWhen start={b.start} durationMinutes={b.durationMinutes} zone={zone} studioZone={b.timezone}/>
    {!cancelled&&b.location?.detail&&<p>{meetingLabel}: {/^https:\/\//.test(b.location.detail)?<a href={b.location.detail} target="_blank" rel="noreferrer">{b.location.detail}</a>:b.location.detail}</p>}
    {cancelled?<a className="booking-primary booking-link" href={`/book/${slug}`}>Book another time</a>:<div className="booking-done-actions"><CalendarLink booking={b} studioName={state.studio.name} slug={slug} token={token}/></div>}
   </div>
   {b.canChange&&<>
    <section className="booking-manage" aria-labelledby="booking-move"><h2 id="booking-move">Choose a new time</h2>
     {days.length?<><div className="booking-days" role="group" aria-label="Available days">{days.map(([k,list])=><button key={k} aria-pressed={k===day} onClick={()=>{setDay(k);setSlot('');}}><strong>{dayLabel(k,zone)}</strong><small>{list.length} time{list.length===1?'':'s'}</small></button>)}</div>
      <div className="booking-slots" role="group" aria-label={`Available times on ${day?dayLabel(day,zone):''}`}>{(days.find(([k])=>k===day)?.[1]||[]).map(s=><button key={s} aria-pressed={s===slot} onClick={()=>setSlot(s)}>{time(s,zone)}</button>)}</div>
      {slot&&<button className="booking-primary" disabled={busy} onClick={()=>act({action:'reschedule',start:slot},d=>`Moved to ${longDay(d.booking.start,zone)} at ${time(d.booking.start,zone)}.`)}>{busy?'Moving…':`Move my booking to ${dayLabel(dayKey(slot,zone),zone)}, ${time(slot,zone)}`}</button>}</>
     :<p className="booking-muted">There are no other free times at the moment. Please get in touch with {state.studio.name} directly.</p>}
    </section>
    <section className="booking-manage" aria-labelledby="booking-cancel"><h2 id="booking-cancel">Cancel</h2>
     {cancelling?<><p>Cancel your {b.title} on {longDay(b.start,zone)} at {time(b.start,zone)}? {state.studio.name} will be told straight away.</p><div className="booking-done-actions"><button className="booking-primary" disabled={busy} onClick={()=>act({action:'cancel'},()=>'Your booking is cancelled.')}>{busy?'Cancelling…':'Cancel booking'}</button><button className="booking-secondary" disabled={busy} onClick={()=>setCancelling(false)}>Keep my booking</button></div></>
     :<button className="booking-secondary" onClick={()=>setCancelling(true)}><CalendarX size={16}/>Cancel this booking</button>}
    </section>
   </>}
  </main>
 </div>;
}
