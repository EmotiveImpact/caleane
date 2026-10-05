import React,{useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {WorkspaceStatus,WorkspaceSwitch} from './workspace/WorkspaceUI';

const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:0}).format((minor||0)/100);
const weekday=value=>new Date(value+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const monthLabel=value=>new Date(value+'-01T12:00:00').toLocaleDateString('en-GB',{month:'short',year:'numeric'});

// Every stage stays visible as a count and value, so a narrow screen never hides part of the pipeline.
export function StageStrip({stages,labels,items,signals,current,onChange}){
 const index=stages.indexOf(current);
 return <div className="pipeline-stage-strip"><button type="button" className="pipeline-stage-arrow" aria-label="Previous stage" disabled={index<=0} onClick={()=>onChange(stages[index-1])}><ChevronLeft size={16}/></button>
  <div role="group" aria-label="Pipeline stages">{stages.map(stage=>{const list=items.filter(o=>o.stage===stage),flagged=list.some(o=>(signals[o.id]?.flags||[]).some(f=>['bad','warn'].includes(f.tone)));
   const totals=Object.entries(list.reduce((r,o)=>{if(o.amountMinor)r[o.currency]=(r[o.currency]||0)+o.amountMinor;return r;},{})).map(([c,v])=>money(v,c)).join(' · ');
   return <button type="button" key={stage} aria-pressed={stage===current} onClick={()=>onChange(stage)}><span>{labels[stage]}{flagged&&<i aria-label="needs attention"/>}</span><small>{list.length}{totals?' · '+totals:''}</small></button>;})}</div>
  <button type="button" className="pipeline-stage-arrow" aria-label="Next stage" disabled={index>=stages.length-1} onClick={()=>onChange(stages[index+1])}><ChevronRight size={16}/></button></div>;
}

export function DatesView({dates,capacity,onOpen}){
 if(!dates.length)return <div className="pipeline-empty"><h2>No dates yet</h2><p>Dates appear here once an enquiry has a date in its brief or a date is held.</p></div>;
 return <div className="pipeline-dates"><p className="pipeline-dates-legend"><span><i className="is-booked"/>Confirmed</span><span><i className="is-held"/>Held for a proposal</span><span><i className="is-asking"/>Asking for this date</span><span>Up to {capacity} event{capacity===1?'':'s'} a day. Change this in Automations.</span></p>
  {dates.map(d=><article key={d.date} className="pipeline-date-row"><header><strong>{weekday(d.date)}</strong><small>{d.date.slice(0,4)}</small></header>
   <div className="pipeline-date-slots">{d.booked.map(x=><Slot key={'b'+x.projectId} kind="booked" item={x} onOpen={onOpen}/>)}{d.held.map(x=><Slot key={'h'+x.projectId} kind="held" item={x} onOpen={onOpen}/>)}{d.asking.map(x=><Slot key={'a'+x.opportunityId} kind="asking" item={x} onOpen={onOpen}/>)}</div>
   <div className="pipeline-date-state"><WorkspaceStatus value={d.state==='full'?'Full':d.state==='held'?'Last place held':`${Math.max(0,d.capacity-d.booked.length-d.held.length)} free`} tone={d.state==='full'?'danger':d.state==='held'?'warning':'success'}/><small>{d.booked.length} booked · {d.held.length} held · {d.asking.length} asking</small></div></article>)}</div>;
}
function Slot({kind,item,onOpen}){
 const label=item.title+(kind==='held'&&item.holdUntil?` · held to ${new Date(item.holdUntil+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`:'');
 return item.opportunityId?<button type="button" className={'pipeline-date-slot is-'+kind} onClick={e=>onOpen(item.opportunityId,e.currentTarget)}>{label}</button>:<span className={'pipeline-date-slot is-'+kind}>{label}</span>;
}

function Bars({rows,max,format}){
 return <div className="pipeline-bars">{rows.map(r=><div key={r.label}><span>{r.label}</span><div><i style={{width:`${Math.max(2,max?r.value/max*100:0)}%`}} className={r.muted?'is-muted':''}/></div><strong>{format(r)}</strong></div>)}</div>;
}

export function InsightsView({opportunities,labels,insights}){
 const byStage=['Discovery','Qualified','Proposal','Negotiation','Won','Lost'].map(stage=>({label:labels[stage]||stage,value:opportunities.filter(o=>o.stage===stage).length}));
 const i=insights||{winRate:[],byMonth:[],stageDays:[],lostReasons:[],overall:{},currency:'GBP'};
 const monthMax=Math.max(0,...i.byMonth.map(m=>m.wonMinor+m.openMinor)),stageMax=Math.max(0,...i.stageDays.map(s=>s.days||0));
 const slowest=[...i.stageDays].filter(s=>s.days!==null).sort((a,b)=>b.days-a.days)[0];
 return <div className="crm-insights pipeline-insights">
  <header><h2>Know where the work stands.</h2><p>{i.overall.rate===null||i.overall.rate===undefined?'Win rates appear once enquiries are confirmed or closed.':`You won ${i.overall.won} of ${i.overall.won+i.overall.lost} decided enquiries in the last year (${i.overall.rate}%)${i.overall.decisionDays!==null?`, taking ${i.overall.decisionDays<1?'less than a day':i.overall.decisionDays===1?'a day':i.overall.decisionDays+' days'} on average to reach a decision`:''}.`}</p></header>
  <div className="pipeline-insight-grid">
   <section><h3>Win rate by source</h3>{i.winRate.length?<Bars rows={i.winRate.map(r=>({label:r.source,value:r.rate}))} max={100} format={r=>r.value+'%'}/>:<p className="pipeline-muted">No decided enquiries in the last year yet.</p>}</section>
   <section><h3>Booked value by event month</h3>{i.byMonth.length?<><div className="pipeline-bars">{i.byMonth.map(m=><div key={m.month}><span>{monthLabel(m.month)}</span><div><i style={{width:`${monthMax?m.wonMinor/monthMax*100:0}%`}}/><i className="is-muted" style={{width:`${monthMax?m.openMinor/monthMax*100:0}%`}}/></div><strong>{money(m.wonMinor,i.currency)}</strong></div>)}</div><p className="pipeline-muted">Dark is confirmed. Light is open work, weighted by how likely it is to book.</p></>:<p className="pipeline-muted">Add dates and values to enquiries to see the months ahead.</p>}</section>
   <section><h3>Average days in each stage</h3>{i.stageDays.some(s=>s.days!==null)?<><Bars rows={i.stageDays.map(s=>({label:labels[s.stage]||s.stage,value:s.days||0}))} max={stageMax} format={r=>r.value?r.value+' days':'–'}/>{slowest&&<p className="pipeline-muted">Enquiries wait longest at {(labels[slowest.stage]||slowest.stage).toLowerCase()}.</p>}</>:<p className="pipeline-muted">Stage times appear once enquiries move between stages.</p>}</section>
   <section><h3>Why work is lost</h3>{i.lostReasons.length?<Bars rows={i.lostReasons.map(r=>({label:r.reason,value:r.count}))} max={Math.max(...i.lostReasons.map(r=>r.count))} format={r=>r.value}/>:<p className="pipeline-muted">No lost enquiries recorded in the last year.</p>}</section>
   <section><h3>By stage</h3><Bars rows={byStage} max={Math.max(1,...byStage.map(r=>r.value))} format={r=>r.value}/></section>
  </div></div>;
}

const RULES=[
 ['autoStages','Move enquiries as things happen','Booked consultations, shared quotes and proposals, confirmed dates and paid deposits move the enquiry forward. Moving one back by hand is respected.'],
 ['holdOnProposal','Hold the date while a proposal is out','The client’s date is held until the proposal’s reply date.'],
 ['planOnAccept','Prepare payments when a proposal is accepted','Confirms the quoted amount, builds the payment plan from your billing defaults and adds a task to issue the deposit.'],
 ['confirmOnDeposit','Confirm the date when the deposit is paid','The held date becomes a confirmed booking and the enquiry is marked confirmed.'],
 ['followUps','Follow up on unanswered proposals','Posts a message in the client’s project space, emailed when email is set up. Stops as soon as they reply, accept or the proposal closes.']
];
export function AutomationsView({settings,onSave,busy}){
 const [draft,setDraft]=useState(settings),[saved,setSaved]=useState('');
 useEffect(()=>setDraft(settings),[settings]);
 if(!draft)return <p className="pipeline-empty" role="status">Opening automations…</p>;
 const set=patch=>{setDraft(d=>({...d,...patch}));setSaved('');};
 async function save(e){e.preventDefault();const ok=await onSave({...draft,followUpDays:String(draft.followUpDays).split(/[^\d]+/).filter(Boolean).map(Number)});if(ok)setSaved('Automations saved.');}
 return <form className="pipeline-automations" onSubmit={save}>
  <section><h2>What Caleane does for you</h2>{RULES.map(([key,label,description])=><WorkspaceSwitch key={key} label={label} description={description} checked={!!draft[key]} onCheckedChange={value=>set({[key]:value})}/>)}</section>
  {draft.followUps&&<section><h2>Follow-up messages</h2><label>Send on these days after the proposal<input value={Array.isArray(draft.followUpDays)?draft.followUpDays.join(', '):draft.followUpDays} onChange={e=>set({followUpDays:e.target.value})} placeholder="3, 7, 12" aria-describedby="follow-days-hint"/></label><small id="follow-days-hint">Up to three days, in order. Each message can use {'{client_first_name}'}, {'{project_title}'}, {'{expires_on}'} and {'{studio_name}'}.</small>
   {draft.followUpMessages.map((text,index)=><label key={index}>Message {index+1}<textarea rows="4" maxLength="3000" value={text} onChange={e=>set({followUpMessages:draft.followUpMessages.map((m,i)=>i===index?e.target.value:m)})}/></label>)}</section>}
  <section><h2>Fit checks for new enquiries</h2>
   <label>Events you can take on one day<input type="number" min="1" max="20" step="1" value={draft.dailyCapacity} onChange={e=>set({dailyCapacity:Number(e.target.value)})}/></label>
   <div className="crm-form-pair"><label>Minimum spend<input type="number" min="0" step="1" value={draft.minimumSpend} onChange={e=>set({minimumSpend:Number(e.target.value)})}/></label><label>Currency<select value={draft.minimumCurrency} onChange={e=>set({minimumCurrency:e.target.value})}>{['GBP','EUR','USD'].map(c=><option key={c}>{c}</option>)}</select></label></div>
   <label>Areas you cover<input maxLength="500" value={draft.serviceAreas} onChange={e=>set({serviceAreas:e.target.value})} placeholder="London, Surrey, Kent"/></label><small>Separate places with commas. An enquiry is flagged when its venue mentions none of them. Leave empty to skip this check.</small>
   <label>Flag a proposal with no reply after (days)<input type="number" min="1" max="60" step="1" value={draft.silentDays} onChange={e=>set({silentDays:Number(e.target.value)})}/></label></section>
  <div className="pipeline-automations-save"><button className="crm-primary" disabled={busy}>Save automations</button>{saved&&<span role="status">{saved}</span>}</div>
 </form>;
}
