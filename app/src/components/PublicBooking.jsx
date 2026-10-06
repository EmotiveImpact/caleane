import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarCheck,Clock,MapPin,Phone,Video} from 'lucide-react';
import '../public-booking.css';

const dayKey=(iso,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const dayLabel=(key,zone)=>new Date(key+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const longDay=(iso,zone)=>new Date(iso).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:zone});
const time=(iso,zone)=>new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:zone});
const meeting={video:['Video call',Video],phone:['Phone call',Phone],in_person:['In person',MapPin]};

// Public page where a prospective client books a consultation with a studio.
export function PublicBooking({slug}){
 const [page,setPage]=useState(null),[error,setError]=useState(''),[day,setDay]=useState(''),[slot,setSlot]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(null),[key]=useState(()=>crypto.randomUUID().replaceAll('-',''));
 const visitorZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 function load(){return fetch('/api/booking/'+slug).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setPage(d);}).catch(e=>setError(e.message));}
 useEffect(()=>{load();},[slug]);
 const zone=page?.booking.timezone||visitorZone;
 const days=useMemo(()=>{const map=new Map();for(const s of page?.slots||[]){const k=dayKey(s,zone);if(!map.has(k))map.set(k,[]);map.get(k).push(s);}return [...map.entries()];},[page,zone]);
 useEffect(()=>{if(days.length&&!days.some(([k])=>k===day))setDay(days[0][0]);},[days,day]);
 async function book(event){
  event.preventDefault();setBusy(true);setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  try{const r=await fetch('/api/booking/'+slug,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({...data,start:slot})});const d=await r.json();if(!r.ok){if(r.status===409){setSlot('');await load();}throw new Error(d.error);}setDone(d);}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 if(!page)return <div className="booking-page"><main className="booking-main"><p role={error?'alert':'status'}>{error||'Loading available times…'}</p></main></div>;
 const [meetingLabel,MeetingIcon]=meeting[page.booking.location.type]||meeting.video;
 return <div className="booking-page" style={{'--booking-accent':page.studio.accent}}>
  <aside className="booking-aside">
   {page.studio.logoUrl?<img src={page.studio.logoUrl} alt={page.studio.name}/>:<strong className="booking-studio">{page.studio.name}</strong>}
   <h1>{page.booking.title}</h1>
   {page.booking.description&&<p>{page.booking.description}</p>}
   <ul><li><Clock size={16}/>{page.booking.durationMinutes} minutes</li><li><MeetingIcon size={16}/>{meetingLabel}</li></ul>
   <small>Times are shown in {zone.replaceAll('_',' ')}{zone!==visitorZone?`, the studio’s time zone`:''}.</small>
  </aside>
  <main className="booking-main">
   {done?<div className="booking-done" role="status"><CalendarCheck size={32}/><p className="booking-kicker">BOOKED · {done.reference}</p><h2>You’re booked in.</h2><p><strong>{longDay(done.start,zone)}</strong> at <strong>{time(done.start,zone)}</strong> for {page.booking.durationMinutes} minutes.</p>{done.location?.detail&&<p>{meetingLabel}: {/^https:\/\//.test(done.location.detail)?<a href={done.location.detail} target="_blank" rel="noreferrer">{done.location.detail}</a>:done.location.detail}</p>}<p className="booking-muted">{page.studio.name} has your details. If you need to change the time, reply to them directly.</p></div>
   :slot?<form className="booking-form" onSubmit={book}>
    <button type="button" className="booking-back" onClick={()=>setSlot('')}><ArrowLeft size={16}/>Choose another time</button>
    <h2>{longDay(slot,zone)}, {time(slot,zone)}</h2>
    <label><span>Your name</span><input name="name" required maxLength="120" autoComplete="name"/></label>
    <label><span>Email</span><input name="email" type="email" required maxLength="254" autoComplete="email"/></label>
    <label><span>Phone (optional)</span><input name="phone" type="tel" maxLength="40" autoComplete="tel"/></label>
    <label><span>Anything you would like to share before the call? (optional)</span><textarea name="notes" rows="4" maxLength="2000" placeholder="Your date, venue or the idea in a few words"/></label>
    <input name="website" tabIndex="-1" autoComplete="off" className="booking-honeypot" aria-hidden="true"/>
    {error&&<p className="booking-error" role="alert">{error}</p>}
    <button className="booking-primary" disabled={busy}>{busy?'Booking…':'Confirm booking'}</button>
    <p className="booking-muted">Your details are shared only with {page.studio.name} so they can prepare for your call.</p>
   </form>
   :<>
    <h2>Choose a time</h2>
    {error&&<p className="booking-error" role="alert">{error}</p>}
    {days.length?<>
     <div className="booking-days" role="group" aria-label="Available days">{days.map(([k,list])=><button key={k} aria-pressed={k===day} onClick={()=>setDay(k)}><strong>{dayLabel(k,zone)}</strong><small>{list.length} time{list.length===1?'':'s'}</small></button>)}</div>
     <div className="booking-slots" role="group" aria-label={`Available times on ${day?dayLabel(day,zone):''}`}>{(days.find(([k])=>k===day)?.[1]||[]).map(s=><button key={s} onClick={()=>setSlot(s)}>{time(s,zone)}</button>)}</div>
    </>:<p className="booking-muted">There are no free times at the moment. Please get in touch with {page.studio.name} directly.</p>}
   </>}
  </main>
 </div>;
}
