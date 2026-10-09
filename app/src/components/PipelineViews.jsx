import React,{useEffect,useState} from 'react';
import {shortDay} from '../lib/dates';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Chip} from './PipelineDeal';

const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:0}).format((minor||0)/100);
const compact=(minor,currency='GBP')=>minor>=100000?new Intl.NumberFormat('en-GB',{style:'currency',currency,notation:'compact',maximumFractionDigits:1}).format(minor/100):money(minor,currency);
const weekday=value=>new Date(value+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const monthLabel=value=>new Date(value+'-01T12:00:00').toLocaleDateString('en-GB',{month:'short',year:'numeric'});
const ago=value=>{const days=Math.round((Date.now()-Date.parse(value))/864e5);return days<=0?'Today':days===1?'Yesterday':days+' days ago';};

// Four figures across the top: what is open, what needs the owner, what is likely to book and how full the dates are.
export function SummaryTiles({open,attention,dates,onAttention}){
 const tally=new Map();for(const o of open)if(o.amountMinor)tally.set(o.currency,(tally.get(o.currency)||0)+Math.round(o.amountMinor*(o.probability||0)/100));
 const likely=[...tally.entries()].sort((a,b)=>b[1]-a[1]);
 const asked=(dates||[]).filter(d=>d.asking.length||d.held.length),free=asked.filter(d=>d.state!=='full');
 return <div className="pl-summary">
  <div><strong>{open.length}</strong><small>open enquiries</small></div>
  <button type="button" onClick={onAttention}><strong>{attention}</strong><small>need you today</small></button>
  <div><span className="pl-kicker">From quotes and values</span><strong>{likely.length?likely.map(([c,v])=>money(v,c)).join(' · '):'Not estimated'}</strong><small>likely to book</small></div>
  <div><span className="pl-kicker">Dates</span><strong>{asked.length?`${free.length} of ${asked.length}`:'None yet'}</strong><small>{asked.length?'requested dates still free':'dates asked for'}</small></div>
 </div>;
}

// The right-hand column of Today: what Caleane did, and how fast the studio replies.
export function TodaySide({handled,replySpeed,labels,onOpen}){
 const speed=replySpeed?.hours;
 const speedText=speed===undefined||speed===null?'–':speed<1?Math.max(1,Math.round(speed*60))+'m':speed<48?`${Math.floor(speed)}h ${String(Math.round((speed%1)*60)).padStart(2,'0')}m`:Math.round(speed/24)+' days';
 return <aside className="pl-side">
  <div className="pl-panel"><span className="pl-label">Handled for you this week</span>{handled?.length?<ul>{handled.map((h,i)=><li key={i}>{h.opportunityId?<button type="button" onClick={e=>onOpen(h.opportunityId,e.currentTarget)}>{h.clientName}</button>:h.clientName}: {h.title.startsWith('Moved from ')?h.title.replace(/Discovery|Qualified|Proposal|Negotiation|Won|Lost/g,s=>(labels[s]||s).toLowerCase()):h.title}<small>{ago(h.at)}</small></li>)}</ul>:<p>Nothing yet. As quotes go out, proposals are accepted and deposits are paid, Caleane moves the enquiries and notes it here.</p>}</div>
  <div className="pl-panel"><span className="pl-label">Reply speed</span><p><span className="pl-big">{speedText}</span></p><p>{speed===undefined||speed===null?'Your median time to first reply appears once you have replied to new enquiries in their project space.':`Median time to your first reply over the last 90 days, across ${replySpeed.count} enquir${replySpeed.count===1?'y':'ies'}. A reply within a day keeps new clients talking to you first.`}</p></div>
 </aside>;
}

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
 return <div className="pl-dates"><p className="pl-legend"><span><i className="is-booked"/>Confirmed</span><span><i className="is-held"/>Held for a proposal</span><span><i className="is-asking"/>Asking about this date</span><span>Capacity: {capacity} event{capacity===1?'':'s'} a day (Automations)</span></p>
  {dates.map(d=>{const free=Math.max(0,d.capacity-d.booked.length-d.held.length);return <article key={d.date} className="pl-date-row"><header><strong>{weekday(d.date)}</strong><small>{d.date.slice(0,4)}</small></header>
   <div className="pl-slots">{d.booked.map(x=><Slot key={'b'+x.projectId} kind="booked" item={x} onOpen={onOpen}/>)}{d.held.map(x=><Slot key={'h'+x.projectId} kind="held" item={x} onOpen={onOpen}/>)}{d.asking.map(x=><Slot key={'a'+x.opportunityId} kind="asking" item={x} onOpen={onOpen}/>)}</div>
   <div className="pl-cap"><Chip tone={d.state==='full'?'bad':d.state==='held'?'warn':'good'}>{d.state==='full'?'Full':d.state==='held'?'Last place held':`${free} free`}</Chip><small><b>{d.booked.length}</b> booked · {d.held.length} held · {d.asking.length} asking</small></div></article>;})}</div>;
}
function Slot({kind,item,onOpen}){
 const label=item.title+(kind==='held'&&item.holdUntil?` · held to ${shortDay(item.holdUntil)}`:'');
 return item.opportunityId?<button type="button" className={'pl-slot is-'+kind} onClick={e=>onOpen(item.opportunityId,e.currentTarget)}>{label}</button>:<span className={'pl-slot is-'+kind}>{label}</span>;
}

function Bars({rows,max,format}){
 return <div className="pl-bars">{rows.map(r=><div key={r.label} className="pl-bar"><span>{r.label}</span><div className="pl-track"><i style={{width:`${Math.max(2,max?r.value/max*100:0)}%`}} className={r.muted?'is-muted':''}/></div><span>{format(r)}</span></div>)}</div>;
}

export function InsightsView({opportunities,labels,insights}){
 const i=insights||{winRate:[],byMonth:[],stageDays:[],lostReasons:[],overall:{},currency:'GBP'};
 const byStage=['Discovery','Qualified','Proposal','Negotiation','Won','Lost'].map(stage=>({label:labels[stage]||stage,value:opportunities.filter(o=>o.stage===stage).length}));
 const monthMax=Math.max(0,...i.byMonth.map(m=>Math.max(m.wonMinor,m.openMinor))),stageMax=Math.max(0,...i.stageDays.map(s=>s.days||0));
 const slowest=[...i.stageDays].filter(s=>s.days>0).sort((a,b)=>b.days-a.days)[0],best=i.winRate[0],worst=i.winRate.at(-1),topLoss=i.lostReasons[0];
 const decision=i.overall.decisionDays,decisionText=decision===null||decision===undefined?'':decision<1?'less than a day':decision===1?'a day':decision+' days';
 return <div className="pl-insights">
  <div className="pl-panel is-wide"><span className="pl-label">The last 12 months</span><p><span className="pl-big">{i.overall.rate===null||i.overall.rate===undefined?'–':i.overall.rate+'%'}</span></p><p>{i.overall.rate===null||i.overall.rate===undefined?'Win rates appear once enquiries are confirmed or closed.':`You won ${i.overall.won} of ${i.overall.won+i.overall.lost} decided enquiries${decisionText?`, taking ${decisionText} on average to reach a decision`:''}.`}</p></div>
  <div className="pl-panel"><span className="pl-label">Win rate by source</span>{i.winRate.length?<><Bars rows={i.winRate.map(r=>({label:r.source,value:r.rate}))} max={100} format={r=>r.value+'%'}/>{best&&worst&&best!==worst&&<p>{best.source} wins most often at {best.rate}%, against {worst.rate}% from {worst.source.toLowerCase()}.</p>}</>:<p>No decided enquiries in the last year yet.</p>}</div>
  <div className="pl-panel"><span className="pl-label">Booked value by event month</span>{i.byMonth.length?<><div className="pl-bars">{i.byMonth.map(m=><div key={m.month} className="pl-bar"><span>{monthLabel(m.month)}</span><div className="pl-track is-stacked"><i style={{width:`${monthMax?m.wonMinor/monthMax*100:0}%`}}/><i className="is-muted" style={{width:`${monthMax?m.openMinor/monthMax*100:0}%`}}/></div><span>{compact(m.wonMinor||m.openMinor,i.currency)}</span></div>)}</div><p>Dark bars are confirmed. Light bars are open quotes for that month, weighted by how likely they are to book.</p></>:<p>Add dates and values to enquiries to see the months ahead.</p>}</div>
  <div className="pl-panel"><span className="pl-label">Where enquiries stall</span>{i.stageDays.some(s=>s.days!==null)?<><Bars rows={i.stageDays.map(s=>({label:labels[s.stage]||s.stage,value:s.days||0}))} max={stageMax} format={r=>r.value?r.value+' days':'–'}/>{slowest&&<p>Enquiries wait longest at {(labels[slowest.stage]||slowest.stage).toLowerCase()}.</p>}</>:<p>Stage times appear once enquiries move between stages.</p>}</div>
  <div className="pl-panel"><span className="pl-label">Why you lose work</span>{i.lostReasons.length?<><Bars rows={i.lostReasons.map(r=>({label:r.reason,value:r.count}))} max={Math.max(...i.lostReasons.map(r=>r.count))} format={r=>r.value}/>{topLoss&&<p>{topLoss.reason} is the most common reason, {topLoss.count} time{topLoss.count===1?'':'s'}.</p>}</>:<p>No lost enquiries recorded in the last year.</p>}</div>
  <div className="pl-panel"><span className="pl-label">Enquiries by stage</span><Bars rows={byStage} max={Math.max(1,...byStage.map(r=>r.value))} format={r=>r.value}/></div>
 </div>;
}

const RULES=[
 ['autoStages','When a consultation is booked, a quote or proposal is shared or a deposit is paid','move the enquiry forward','Moving an enquiry back by hand is always respected.'],
 ['holdOnProposal','When a proposal is sent','hold the client’s date until its reply date','The hold lapses on its own if the date is not confirmed.'],
 ['planOnAccept','When a proposal is accepted','confirm the quote, build the payment plan and add a task to issue the deposit','Uses your billing defaults.'],
 ['confirmOnDeposit','When the deposit is paid','confirm the held date and mark the enquiry confirmed',''],
 ['followUps','When a proposal has no reply','post a follow-up on the days you choose','Stops the moment they reply, accept or the proposal closes.'],
 ['prepBeforeConsultation','When a client books a consultation','add a task to prepare the day before','Off until you switch it on.'],
 ['closeSilent','When a proposal has had no reply for a long time','mark the enquiry not proceeding with the reason “No response”','Off until you switch it on. Choose how many days below.'],
 ['nudgeOpened','When a client opens a proposal or contract but does not answer','add a task to check in with them personally','Off until you switch it on. Nothing is sent to the client.']
];
export function AutomationsView({settings,onSave,busy}){
 const [draft,setDraft]=useState(settings),[saved,setSaved]=useState('');
 useEffect(()=>setDraft(settings),[settings]);
 if(!draft)return <p className="pipeline-empty" role="status">Opening automations…</p>;
 const set=patch=>{setDraft(d=>({...d,...patch}));setSaved('');};
 async function save(e){e.preventDefault();const ok=await onSave({...draft,followUpDays:String(draft.followUpDays).split(/[^\d]+/).filter(Boolean).map(Number)});if(ok)setSaved('Automations saved.');}
 return <form className="pl-automations" onSubmit={save}>
  <div className="pl-rules">{RULES.map(([key,when,then,note])=><div className="pl-rule" key={key}><div><p><b>{when}</b>, {then}.</p>{note&&<small>{note}</small>}</div><button type="button" className="pl-switch" role="switch" aria-checked={!!draft[key]} aria-label={`${when}, ${then}`} onClick={()=>set({[key]:!draft[key]})}/></div>)}</div>
  {draft.followUps&&<section className="pl-panel"><span className="pl-label">Follow-up messages</span><label className="pl-field">Send on these days after the proposal<input value={Array.isArray(draft.followUpDays)?draft.followUpDays.join(', '):draft.followUpDays} onChange={e=>set({followUpDays:e.target.value})} placeholder="3, 7, 12" aria-describedby="follow-days-hint"/></label><small id="follow-days-hint">Up to three days, in order. Each message can use {'{client_first_name}'}, {'{project_title}'}, {'{expires_on}'} and {'{studio_name}'}.</small>
   {draft.followUpMessages.map((text,index)=><label className="pl-field" key={index}>Message {index+1}<textarea rows="4" maxLength="3000" value={text} onChange={e=>set({followUpMessages:draft.followUpMessages.map((m,i)=>i===index?e.target.value:m)})}/></label>)}</section>}
  <section className="pl-panel"><span className="pl-label">Fit checks for new enquiries</span>
   <label className="pl-field">Events you can take on one day<input type="number" min="1" max="20" step="1" value={draft.dailyCapacity} onChange={e=>set({dailyCapacity:Number(e.target.value)})}/></label>
   <div className="pl-pair"><label className="pl-field">Minimum spend<input type="number" min="0" step="1" value={draft.minimumSpend} onChange={e=>set({minimumSpend:Number(e.target.value)})}/></label><label className="pl-field">Currency<select value={draft.minimumCurrency} onChange={e=>set({minimumCurrency:e.target.value})}>{['GBP','EUR','USD'].map(c=><option key={c}>{c}</option>)}</select></label></div>
   <label className="pl-field">Areas you cover<input maxLength="500" value={draft.serviceAreas} onChange={e=>set({serviceAreas:e.target.value})} placeholder="London, Surrey, Kent"/></label><small>Separate places with commas. An enquiry is flagged when its venue mentions none of them. Leave empty to skip this check.</small>
   {draft.closeSilent&&<label className="pl-field">Close an enquiry with no reply after (days)<input type="number" min="7" max="120" step="1" value={draft.closeSilentDays} onChange={e=>set({closeSilentDays:Number(e.target.value)})}/></label>}{draft.nudgeOpened&&<label className="pl-field">Add the check-in task this many days after they open it<input type="number" min="1" max="30" step="1" value={draft.nudgeOpenedDays} onChange={e=>set({nudgeOpenedDays:Number(e.target.value)})}/></label>}<label className="pl-field">Flag a proposal with no reply after (days)<input type="number" min="1" max="60" step="1" value={draft.silentDays} onChange={e=>set({silentDays:Number(e.target.value)})}/></label></section>
  <div className="pl-acts"><button className="pl-btn" disabled={busy}>Save automations</button>{saved&&<span role="status">{saved}</span>}</div>
 </form>;
}
