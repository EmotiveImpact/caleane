import React,{useState,useEffect,useRef} from 'react';
import {ChevronLeft,ChevronRight,CalendarDays,CheckSquare} from 'lucide-react';
import {WorkspaceDialog,WorkspaceButton,WorkspaceDate} from './workspace/WorkspaceUI';
import '../folio-operations.css';
import './calendar-workspace.css';

const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dayDate=day=>new Date(day+'T12:00:00');
const dateLabel=day=>dayDate(day).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

export function Calendar({projects,openProject,studio,request,openTasks}){
 const today=localDay(new Date()),detailsButton=useRef(null);
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [selected,setSelected]=useState(today),[open,setOpen]=useState(false),[filter,setFilter]=useState('All');
 const [crmTasks,setCrmTasks]=useState([]),[bookings,setBookings]=useState([]),[followUps,setFollowUps]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;setCrmTasks([]);setError('');
  if(!studio||!request){setLoading(false);return;}
  setLoading(true);
  Promise.all([request('/api/crm/tasks?studio='+studio.id).then(d=>{if(active)setCrmTasks(d.tasks||[]);}),request('/api/clients?studio='+studio.id).then(d=>{if(active)setFollowUps((d.clients||[]).filter(c=>c.followUp&&!c.archived));}),request('/api/consultations?studio='+studio.id).then(d=>{if(active)setBookings((d.consultations||[]).filter(c=>c.status!=='Cancelled'&&c.status!=='cancelled'));}).catch(()=>{})]).catch(()=>{if(active)setError('Follow-ups could not be loaded. Project dates are still available.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[studio?.id,request,retry]);
 const start=new Date(month);start.setDate(1-((start.getDay()+6)%7));
 const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return d;});
 const events=projects.filter(p=>p.status!=='Archived').flatMap(p=>[
  ...(p.brief.date?[{id:'project:'+p.id,date:p.brief.date,title:p.title,project:p,kind:'Project'}]:[]),
  ...(p.tasks||[]).filter(t=>t.due&&!t.completed).map(t=>({id:'project:'+p.id+':'+t.id,date:t.due,title:t.title,project:p,kind:'Task'}))
 ]).concat(crmTasks.filter(t=>t.dueDate&&!t.completed).map(t=>({id:'crm:'+t.id,date:t.dueDate,title:t.title,clientName:t.clientName,kind:'Task',crm:true})))
 .concat(followUps.map(c=>({id:'follow-up:'+c.id,date:c.followUp,title:c.followUpNote?`Follow up: ${c.followUpNote}`:`Follow up with ${c.name}`,clientName:c.name,kind:'Task',crm:true,static:true})))
 .concat(bookings.map(b=>({id:'booking:'+b.id,date:localDay(new Date(b.start)),time:new Date(b.start).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),title:b.title||'Consultation',clientName:b.name,kind:'Booking',static:true})))
 .filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&(filter==='All'||e.kind===filter));
 const chosen=events.filter(e=>e.date===selected),monthCount=events.filter(e=>e.date.slice(0,7)===localDay(month).slice(0,7)).length;
 const upcoming=events.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
 const showDay=day=>{const d=dayDate(day);setMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelected(day);setOpen(true);};
 const changeMonth=n=>{const next=new Date(month.getFullYear(),month.getMonth()+n,1);setMonth(next);setSelected(localDay(next));};
 const changeDay=n=>{const d=dayDate(selected);d.setDate(d.getDate()+n);showDay(localDay(d));};
 const openEvent=e=>{setOpen(false);if(e.kind==='Task'&&openTasks)openTasks(e.id);else if(e.project)openProject(e.project,e.kind==='Task'?'Plan':'Brief');};
 const fetchStatus=<>{loading&&<p className="calendar-load-note" role="status">Loading follow-ups…</p>}{error&&<div className="calendar-load-error" role="alert"><p>{error}</p><WorkspaceButton variant="secondary" onClick={()=>setRetry(n=>n+1)}>Retry follow-ups</WorkspaceButton></div>}</>;
 return <section className="folio-calendar calendar-workspace">
  <header className="folio-screen-heading workspace-page-heading"><div><h1>Calendar</h1><p>Project dates, consultations, deadlines and follow-ups. Select a day to see the details.</p></div><button className="button secondary" onClick={()=>showDay(today)}>Today</button></header>
  <div className="folio-calendar-toolbar">
   <div className="folio-month-controls"><h2>{month.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</h2><button aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={17}/></button><button aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={17}/></button></div>
   <div className="folio-segmented" role="group" aria-label="Schedule filter">{['All','Project','Booking','Task'].map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='All'?'All dates':f==='Project'?'Projects':f==='Booking'?'Bookings':'Tasks'}</button>)}</div>
   <div className="calendar-toolbar-end"><span className="folio-calendar-count">{monthCount} {monthCount===1?'item':'items'} this month</span><WorkspaceButton variant="secondary" ref={detailsButton} onClick={()=>showDay(selected)} aria-label={'Day details for '+dateLabel(selected)}><CalendarDays size={16}/><span>Day details</span></WorkspaceButton></div>
  </div>
  {!open&&fetchStatus}
  <section className="folio-month-grid" aria-label="Month calendar">
   <div className="folio-calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div>
   <div className="folio-calendar-days">{days.map(d=>{const key=localDay(d),list=events.filter(e=>e.date===key);return <button key={key} aria-label={dateLabel(key)+', '+list.length+' scheduled '+(list.length===1?'item':'items')} aria-pressed={selected===key} aria-haspopup="dialog" className={(d.getMonth()!==month.getMonth()?'outside ':'')+(selected===key?'selected':'')} onClick={()=>showDay(key)}>
    <span className={key===today?'today':''}>{d.getDate()}</span><div>{list.slice(0,2).map(e=><small key={e.id} className={e.kind==='Task'?'is-task':e.kind==='Booking'?'is-booking':''} title={e.title}>{e.time?e.time+' ':''}{e.title}</small>)}{list.length>2&&<small className="folio-more-dates">+{list.length-2} more</small>}</div>{list.length>0&&<i className="folio-mobile-event" aria-hidden="true"/>}
   </button>})}</div>
  </section>
  <WorkspaceDialog open={open} onOpenChange={setOpen} drawer returnFocusRef={detailsButton} className="calendar-day-drawer" title={dateLabel(selected)} description={`${chosen.length} ${chosen.length===1?'scheduled item':'scheduled items'}${filter==='All'?'':filter==='Project'?' · Project dates':filter==='Booking'?' · Consultations':' · Tasks & follow-ups'}`}>
   <div className="calendar-day-navigation"><WorkspaceButton variant="ghost" iconOnly aria-label="Previous day" onClick={()=>changeDay(-1)}><ChevronLeft size={18}/></WorkspaceButton><WorkspaceDate date={selected}/><WorkspaceButton variant="ghost" iconOnly aria-label="Next day" onClick={()=>changeDay(1)}><ChevronRight size={18}/></WorkspaceButton></div>
   {fetchStatus}
   {['Project','Booking','Task'].map(kind=>{const list=chosen.filter(e=>e.kind===kind);return list.length>0&&<section className="calendar-day-group" key={kind}><header><h3>{kind==='Project'?'Project dates':kind==='Booking'?'Consultations':'Tasks & follow-ups'}</h3><span>{list.length}</span></header>{list.map(e=>e.static?<div key={e.id} className="calendar-scheduled-item is-static"><span className="calendar-event-icon">{kind==='Booking'?<CalendarDays size={18}/>:<CheckSquare size={18}/>}</span><span className="calendar-event-copy"><strong>{e.time?`${e.time} · `:''}{e.title}</strong><small>{e.clientName}</small><span className="calendar-event-state">{kind==='Booking'?'Booked consultation':'Client follow-up'}</span></span></div>:<button key={e.id} className="calendar-scheduled-item" aria-label={`${kind==='Project'?'Open project brief':'Open task'}: ${e.title}`} onClick={()=>openEvent(e)}>
    <span className="calendar-event-icon">{kind==='Project'?<CalendarDays size={18}/>:<CheckSquare size={18}/>}</span><span className="calendar-event-copy"><strong>{e.title}</strong><small>{e.crm?e.clientName||'Studio follow-up':e.project.brief.name}</small>{kind==='Project'&&<span className="calendar-event-state">{e.project.status==='Enquiry'?'Tentative · Enquiry':e.project.status}</span>}<span className="calendar-event-action">{kind==='Project'?'Open project brief':'Open task'}</span></span>
   </button>)}</section>})}
   {!chosen.length&&<div className="calendar-clear-day"><CalendarDays size={28} strokeWidth={1.3}/><h3>{loading?'Your project dates are clear.':error?'No project dates on this day.':'A clear day.'}</h3><p>{error?'Retry to check the studio follow-ups.':`No ${filter==='Task'?'tasks or follow-ups':filter==='Project'?'project dates':filter==='Booking'?'consultations':'project dates, consultations, tasks or follow-ups'} scheduled.`}</p></div>}
   <details className="calendar-upcoming"><summary>Next on the calendar</summary>{upcoming.map(e=><button key={e.id} onClick={()=>showDay(e.date)}><WorkspaceDate date={e.date}/><span><strong>{e.title}</strong><small>{e.kind==='Project'?'Project date':e.kind==='Booking'?'Consultation':'Task or follow-up'}</small></span></button>)}{!upcoming.length&&<p>No upcoming dates in this view.</p>}</details>
   <p className="calendar-context-note">Dates stay connected to their project or task. Open the item to change its schedule. An enquiry date is tentative until the booking is confirmed.</p>
  </WorkspaceDialog>
 </section>;
}
