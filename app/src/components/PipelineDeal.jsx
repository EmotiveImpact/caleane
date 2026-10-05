import React,{useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {CalendarDays,FileText,Plus,Receipt,Send,Trash2,X} from 'lucide-react';

// The enquiry's quote, proposal, date hold, deposit and follow-ups, read from the
// linked project and driven from the enquiry so the owner never has to leave it.
const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:2}).format((minor||0)/100);
const day=value=>value?new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const longDay=value=>value?new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'';
const isoIn=days=>{const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const readError=e=>e?.message||'Something went wrong. Please try again.';

export function Chip({tone,children}){return <span className={'pl-chip'+(tone?' is-'+tone:'')}>{children}</span>;}

export function SignalChips({signal,limit=2}){
 const flags=(signal?.flags||[]).slice(0,limit);
 if(!flags.length)return null;
 return <span className="pl-chips">{flags.map(f=><Chip key={f.kind} tone={f.tone}>{f.label}</Chip>)}</span>;
}

// One plain sentence on why an enquiry is in Today.
export function whyFor(o,signal,issue){
 const s=signal||{},parts=[];
 for(const f of s.flags||[]){
  if(f.kind==='clash')parts.push(`Asks for ${day(s.eventDate)}, which is ${f.label==='Date full'?'full':'held for another client'}.`);
  else if(f.kind==='budget')parts.push('Their budget is under your minimum spend.');
  else if(f.kind==='area')parts.push(`${s.venue||'The venue'} is outside the areas you cover.`);
  else if(f.kind==='hold-expired')parts.push('The date hold has expired.');
  else if(f.kind==='hold-ending')parts.push(`The date hold ends ${day(s.hold?.holdUntil)}.`);
  else if(f.kind==='proposal-expired')parts.push('The proposal has passed its reply date.');
  else if(f.kind==='proposal-ending')parts.push(`The proposal closes ${day(s.proposal?.expiresOn)}.`);
  else if(f.kind==='silent')parts.push(`${f.label}.${s.nextFollowUp?` The next follow-up goes on ${day(s.nextFollowUp)}.`:''}`);
  else if(f.kind==='changes')parts.push('They asked for changes to the quote.');
  else if(f.kind==='deposit')parts.push('Accepted. Issue the deposit invoice and the date confirms itself once it is paid.');
  else if(f.kind==='waiting')parts.push(`${f.label}. Waiting on their reply.`);
  else if(f.kind==='fit')parts.push('The date is free and the budget and area fit.');
 }
 if(issue?.kind==='review')parts.unshift('New enquiry. Review their request and reply.');
 else if(issue&&!parts.length)parts.push(issue.label+'.');
 if(!parts.length)parts.push(o.projectId&&!s.estimate&&['Qualified','Proposal'].includes(o.stage)?'Ready for a quote.':'Set a next step to keep this enquiry moving.');
 return parts.slice(0,2).join(' ');
}

// The one action that moves this enquiry on, named for the owner.
export function primaryFor(o,signal,issue){
 const s=signal||{},kinds=(s.flags||[]).map(f=>f.kind);
 if(issue?.kind==='review')return {label:'Review request',tab:'overview'};
 if(kinds.includes('deposit'))return {label:'Open billing',billing:true};
 if(kinds.includes('changes')||o.projectId&&!s.estimate&&['Qualified','Proposal'].includes(o.stage))return {label:s.estimate?'Update quote':'Build quote',tab:'quote'};
 if(kinds.includes('silent')||kinds.includes('proposal-ending'))return {label:'See follow-ups',tab:'follow'};
 return {label:'Open',tab:'overview'};
}

function Modal({open,onOpenChange,title,description,children,busy}){
 return <Dialog.Root open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><Dialog.Portal><Dialog.Overlay className="modal-backdrop"/><Dialog.Content className="modal crm-create-dialog pipeline-create pipeline-deal-dialog"><Dialog.Close asChild><button className="close" aria-label={'Close '+title.toLowerCase()}><X size={18}/></button></Dialog.Close><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function useDeal({studio,request,run,onChanged}){
 const [dialog,setDialog]=useState(null),[error,setError]=useState('');
 async function act(path,method,body){setError('');return run(async()=>{try{return await request(path,method,body);}catch(e){setError(readError(e));return null;}});}
 async function done(){setDialog(null);await onChanged?.();}
 return {dialog,setDialog,error,act,done,q:'?studio='+studio.id};
}

// Overview: what needs attention, the fit check and the date.
export function DealOverview({detail,signal,studio,request,run,busy,openProject,onChanged,onTab}){
 const deal=useDeal({studio,request,run,onChanged}),s=signal||{},fit=s.fit||[],hold=s.hold,proposal=s.proposal;
 const urgent=(s.flags||[]).filter(f=>f.rank<=2&&f.kind!=='deposit');
 return <div className="pl-overview" aria-label="Quote and booking" role="region">
  {deal.error&&<p className="crm-alert" role="alert">{deal.error}</p>}
  {urgent.map(f=><div key={f.kind} className={'pl-callout is-'+(f.tone==='bad'?'bad':'warn')}><strong>{calloutTitle(f,s)}</strong><span>{calloutText(f)}</span>{f.kind==='clash'&&<div className="pl-acts"><button type="button" className="pl-btn is-small is-ghost" onClick={()=>detail.projectId&&openProject({id:detail.projectId},'Brief')}>Change the date in the brief</button></div>}{['hold-expired','hold-ending'].includes(f.kind)&&detail.projectId&&<div className="pl-acts"><button type="button" className="pl-btn is-small is-ghost" disabled={busy} onClick={()=>deal.setDialog('hold')}>Hold again</button></div>}{['proposal-expired','changes'].includes(f.kind)&&<div className="pl-acts"><button type="button" className="pl-btn is-small is-ghost" onClick={()=>onTab('quote')}>Open the quote</button></div>}</div>)}
  {hold?.status==='Held'&&!urgent.some(f=>f.kind.startsWith('hold'))&&<div className="pl-callout is-info"><strong>Date held until {new Date(hold.holdUntil+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long'})}.</strong><span>The hold lapses on its own if the date is not confirmed by then.</span></div>}
  {proposal?.status==='Scope accepted'&&s.deposit?.status!=='Paid'&&<div className="pl-callout is-good"><strong>Accepted.</strong><span>The quote is confirmed and the payment plan is ready. Issue the deposit invoice and the date confirms itself once it is paid.</span><div className="pl-acts"><button type="button" className="pl-btn is-small" onClick={()=>openProject({id:detail.projectId},'Billing')}><Receipt size={13}/>Open billing</button></div></div>}
  {hold?.status==='Confirmed'&&<div className="pl-callout is-good"><strong>Confirmed.</strong><span>{longDay(hold.startDate)} is booked{s.deposit?.status==='Paid'?' and the deposit is paid':''}.</span></div>}
  {!detail.projectId&&<div className="pl-callout is-info"><span>Create a linked project to build a quote, send a proposal and hold the date from here.</span></div>}
  {(fit.length>0||s.eventDate||detail.source)&&<div className="pl-fit"><span className="pl-label">Fit check</span>
   {fit.map(f=><div key={f.kind}><span>{f.kind==='date'?longDay(s.eventDate):f.kind==='budget'?'Budget '+(s.budget||''):s.venue||'Venue'}</span><Chip tone={f.ok?'good':f.kind==='date'?'bad':'warn'}>{fitChip(f)}</Chip></div>)}
   {s.eventDate&&!fit.some(f=>f.kind==='date')&&<div><span>{longDay(s.eventDate)}</span>{hold?<Chip tone={hold.status==='Confirmed'?'good':'warn'}>{hold.status==='Confirmed'?'Confirmed':'Held'}</Chip>:<span className="pl-muted">Not held</span>}</div>}
   {s.eventDate&&!hold&&detail.projectId&&<div><span>Hold this date while you talk</span><button type="button" className="pl-btn is-small is-ghost" disabled={busy} onClick={()=>deal.setDialog('hold')}><CalendarDays size={13}/>Hold date</button></div>}
   <div><span>Source</span><span>{detail.source||'Direct enquiry'}</span></div>
  </div>}
  {deal.dialog==='hold'&&<HoldDialog detail={detail} signal={s} q={deal.q} request={request} act={deal.act} busy={busy} error={deal.error} onClose={()=>deal.setDialog(null)} onDone={deal.done}/>}
 </div>;
}

function fitChip(f){
 if(f.kind==='date')return f.ok?'Available':f.label.includes('fully')?'Full':'Held for another client';
 if(f.kind==='budget')return f.ok?'Above minimum':'Under minimum';
 return f.ok?'Within your area':'Outside your area';
}
function calloutTitle(f,s){
 if(f.kind==='clash')return `${longDay(s.eventDate)} is ${f.label==='Date full'?'full':'held for another client'}.`;
 if(f.kind==='hold-expired')return 'The date hold has expired.';
 if(f.kind==='hold-ending')return `The date hold ends ${day(s.hold?.holdUntil)}.`;
 if(f.kind==='proposal-expired')return 'The proposal has passed its reply date.';
 if(f.kind==='proposal-ending')return `The proposal closes ${day(s.proposal?.expiresOn)}.`;
 if(f.kind==='changes')return 'The client asked for changes.';
 return f.label;
}
function calloutText(f){
 if(f.kind==='clash')return 'Offer another date, or check you can take both before you quote.';
 if(f.kind.startsWith('hold'))return 'Hold it again or let the date go.';
 if(f.kind==='proposal-expired')return 'Send a new version to keep going.';
 if(f.kind==='proposal-ending')return 'A short call often settles it.';
 if(f.kind==='changes')return 'Update the quote and send a new version.';
 return '';
}

// Quote: built inline from the price list, then sent as a proposal.
export function DealQuote({detail,signal,studio,request,run,busy,openProject,onChanged}){
 const deal=useDeal({studio,request,run,onChanged}),s=signal||{},pid=detail.projectId;
 const [project,setProject]=useState(null),[catalogue,setCatalogue]=useState([]),[editing,setEditing]=useState(false),[currency,setCurrency]=useState('GBP'),[lines,setLines]=useState([]),[pick,setPick]=useState(''),[note,setNote]=useState('');
 useEffect(()=>{if(!pid)return;let live=true;request(`/api/projects/${pid}?studio=${studio.id}`).then(d=>{if(live)setProject(d.project);}).catch(()=>{});request('/api/catalogue?studio='+studio.id).then(d=>{if(!live)return;const items=(d.items||[]).filter(i=>!i.archived);setCatalogue(items);if(items[0])setCurrency(c=>c||items[0].currency);}).catch(()=>{});return()=>{live=false;};},[pid,studio.id,s.estimate?.id,s.estimate?.status]);
 const estimate=project?.estimates?.at(-1)||null,proposal=s.proposal;
 useEffect(()=>{if(!estimate&&catalogue[0])setCurrency(catalogue[0].currency);},[catalogue.length,!!estimate]);
 if(!pid)return <div className="pl-callout is-info"><span>Create a linked project first. The quote lives with the project so the client can accept it in their space.</span></div>;
 const building=editing||!estimate;
 const available=catalogue.filter(i=>i.currency===currency),total=lines.reduce((sum,l)=>sum+Number(l.quantity)*l.unitAmount,0);
 const update=(index,patch)=>setLines(list=>list.map((l,i)=>i===index?{...l,...patch}:l));
 function add(){const item=available.find(i=>i.id===pick);setLines(list=>[...list,item?{title:item.name,quantity:1,unitAmount:item.unitAmount}:{title:'',quantity:1,unitAmount:0}]);setPick('');}
 function newVersion(){setCurrency(estimate.currency);setLines(estimate.items.map(i=>({title:i.title,quantity:i.quantity,unitAmount:i.unitAmount})));setNote(estimate.note||'');setEditing(true);}
 async function share(e){e.preventDefault();const result=await deal.act(`/api/projects/${pid}/estimates?studio=${studio.id}`,'POST',{title:('Quote · '+detail.title).slice(0,200),note,currency,taxRate:0,items:lines.map(l=>({title:l.title.trim(),quantity:Number(l.quantity),unitAmount:Math.round(Number(l.unitAmount))}))});if(result){setEditing(false);setLines([]);await deal.done();}}
 const canPropose=estimate&&['Awaiting review','Budget confirmed'].includes(estimate.status)&&!['Awaiting response','Scope accepted'].includes(proposal?.status);
 return <div className="pl-quote">
  {deal.error&&<p className="crm-alert" role="alert">{deal.error}</p>}
  {building?<form onSubmit={share}>
   <div className="pl-callout is-info"><span>Built from your price list. When the client accepts, the deposit and balance follow your billing defaults.</span></div>
   {lines.length>0?<table className="pl-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{lines.map((l,i)=><tr key={i}>
    <td><input aria-label={`Line ${i+1} description`} required maxLength="200" value={l.title} onChange={e=>update(i,{title:e.target.value})}/></td>
    <td><input className="is-qty" aria-label={`Line ${i+1} quantity`} type="number" min="1" max="10000" step="1" required value={l.quantity} onChange={e=>update(i,{quantity:e.target.value})}/></td>
    <td><input className="is-price" aria-label={`Line ${i+1} price`} type="number" min="0" step="0.01" required value={l.unitAmount/100} onChange={e=>update(i,{unitAmount:Math.round(Number(e.target.value)*100)})}/></td>
    <td>{money(Number(l.quantity)*l.unitAmount,currency)}</td>
    <td><button type="button" className="pl-icon" aria-label={`Remove line ${i+1}`} onClick={()=>setLines(list=>list.filter((x,j)=>j!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>:<p className="pl-muted">Add the first line from your price list or as a custom line.</p>}
   <div className="pl-addrow"><label className="sr-only" htmlFor="quote-pick">Add from your price list</label><select id="quote-pick" value={pick} onChange={e=>setPick(e.target.value)}><option value="">{available.length?'Choose from your price list…':'Custom line'}</option>{available.map(i=><option key={i.id} value={i.id}>{i.name} ({money(i.unitAmount,i.currency)} {i.unit})</option>)}</select><button type="button" className="pl-btn is-small is-ghost" onClick={add}><Plus size={13}/>Add line</button><label className="pl-currency">Currency<select value={currency} onChange={e=>{setCurrency(e.target.value);setLines([]);}}>{['GBP','EUR','USD'].map(c=><option key={c}>{c}</option>)}</select></label></div>
   <div className="pl-totals"><span>Total <strong>{money(total,currency)}</strong></span></div>
   <label className="pl-field">Note for the client<textarea rows="2" maxLength="3000" value={note} onChange={e=>setNote(e.target.value)} placeholder="Anything that explains the pricing"/></label>
   <div className="pl-acts"><button className="pl-btn" disabled={busy||!lines.length}>Share quote</button>{editing&&<button type="button" className="pl-btn is-ghost" onClick={()=>setEditing(false)}>Cancel</button>}</div>
  </form>:<>
   <table className="pl-table"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{estimate.items.map((i,n)=><tr key={n}><td>{i.title}<small>{money(i.unitAmount,estimate.currency)} each</small></td><td>{i.quantity}</td><td>{money(i.quantity*i.unitAmount,estimate.currency)}</td></tr>)}</tbody></table>
   <div className="pl-totals"><span>Total <strong>{money(estimate.total,estimate.currency)}</strong></span><span>Version {estimate.version} · shared {day(estimate.at)}</span>{proposal&&<span>Proposal {proposal.status==='Awaiting response'?`open until ${day(proposal.expiresOn)}`:proposal.status.toLowerCase()}</span>}</div>
   <div className="pl-acts">{canPropose&&<button type="button" className="pl-btn" disabled={busy} onClick={()=>deal.setDialog('proposal')}><Send size={13}/>Send proposal</button>}{proposal?.status==='Scope accepted'&&s.deposit?.status!=='Paid'&&<button type="button" className="pl-btn" onClick={()=>openProject({id:pid},'Billing')}><Receipt size={13}/>Open billing</button>}{proposal?.status!=='Scope accepted'&&<button type="button" className="pl-btn is-ghost" disabled={busy} onClick={newVersion}><Plus size={13}/>New version</button>}<button type="button" className="pl-btn is-ghost" onClick={()=>openProject({id:pid},proposal?'Proposal':'Estimate')}><FileText size={13}/>See it in the project</button>
    <Chip tone={estimate.status==='Budget confirmed'?'good':estimate.status==='Changes requested'?'warn':'info'}>Quote {estimate.status.toLowerCase()}</Chip>{proposal&&<Chip tone={proposal.status==='Scope accepted'?'good':proposal.status==='Awaiting response'?'info':'warn'}>Proposal {proposal.status.toLowerCase()}</Chip>}</div>
   {!s.portalClient&&proposal?.status!=='Scope accepted'&&<p className="pl-muted">Invite the client to their project space so they can accept online.</p>}
  </>}
  {deal.dialog==='proposal'&&<ProposalDialog detail={detail} signal={s} studio={studio} request={request} act={deal.act} busy={busy} error={deal.error} onClose={()=>deal.setDialog(null)} onDone={deal.done}/>}
 </div>;
}

// Follow-ups: the sequence for the open proposal and where it stands.
export function DealFollowUps({detail,signal,settings,onOpenAutomations}){
 const s=signal||{},proposal=s.proposal,first=(detail.clientName||'the client').split(/\s+/)[0];
 if(!settings?.followUps)return <div className="pl-follow"><div className="pl-callout is-info"><span>Automatic follow-ups are off. When they are on, Caleane posts each message in {first}’s project space and stops as soon as they reply or accept.</span><div className="pl-acts"><button type="button" className="pl-btn is-small" onClick={onOpenAutomations}>Set up follow-ups</button></div></div></div>;
 if(!proposal||proposal.status!=='Awaiting response')return <div className="pl-follow"><div className="pl-callout is-info"><span>Posts in {first}’s project space as you, and stops as soon as they reply or accept.</span></div><p className="pl-muted">{proposal?.status==='Scope accepted'?'The proposal is accepted, so follow-ups have stopped.':'Follow-ups start when you send the proposal.'}</p></div>;
 const replied=s.lastClientMessageAt&&s.lastClientMessageAt>proposal.sharedAt,sent=s.followUpsSent||0,days=settings.followUpDays||[];
 const steps=[{when:'Day 0',title:'Proposal sent',state:'sent',note:day(proposal.sharedAt)},...days.map((d,i)=>({when:'Day '+d,title:firstLine(settings.followUpMessages?.[i])||'Follow-up '+(i+1),state:i<sent?'sent':!replied&&i===sent?'next':'',note:i<sent?'sent':!replied&&i===sent&&s.nextFollowUp?'sends automatically on '+day(s.nextFollowUp):''}))];
 return <div className="pl-follow"><div className="pl-callout is-info"><span>{replied?`${first} has replied since the proposal was shared, so follow-ups have stopped.`:`Posts in ${first}’s project space as you. Stops as soon as they reply or accept.`}</span></div>
  {!s.portalClient&&<p className="pl-muted">{first} has no access to their project space yet, so follow-ups wait until they are invited.</p>}
  <ol className="pl-steps">{steps.map((step,i)=><li key={i} className={step.state?'is-'+step.state:''}><span className="pl-dot"/><div><strong>{step.title}</strong><small>{step.when}{step.note?' · '+step.note:''}</small></div></li>)}</ol>
  <button type="button" className="pl-btn is-small is-ghost" onClick={onOpenAutomations}>Edit messages and timing</button></div>;
}
const firstLine=text=>{const line=String(text||'').split(/\n/).map(l=>l.trim()).filter(Boolean).find(l=>!/^hi\b|^hello\b|^dear\b/i.test(l));return line?line.replace(/\{[a-z_]+\}/g,'…').slice(0,80):'';};

function ProposalDialog({detail,signal,studio,request,act,busy,error,onClose,onDone}){
 const [project,setProject]=useState(null),[loadError,setLoadError]=useState('');
 useEffect(()=>{let live=true;request(`/api/projects/${detail.projectId}?studio=${studio.id}`).then(d=>{if(live)setProject(d.project);}).catch(e=>{if(live)setLoadError(readError(e));});return()=>{live=false;};},[detail.projectId]);
 const estimate=project?.estimates?.at(-1),date=signal.eventDate;
 const reply=[isoIn(14),date&&date>isoIn(0)?date:null].filter(Boolean).sort()[0];
 async function submit(e){e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));const result=await act(`/api/projects/${detail.projectId}/proposals?studio=${studio.id}`,'POST',{...raw,briefRevision:project.briefRevision,previousId:project.proposals?.at(-1)?.id||null,estimateId:estimate.id});if(result)await onDone();}
 return <Modal open onOpenChange={v=>{if(!v)onClose();}} busy={busy} title="Send proposal" description={`${detail.clientName} can accept it in their project space.${date?' The date is held until they reply.':''}`}>
  {(error||loadError)&&<p role="alert">{error||loadError}</p>}
  {project&&estimate?<form onSubmit={submit}>
   <label>Title<input name="title" required maxLength="200" defaultValue={detail.title}/></label>
   <label>What is included<textarea name="scope" rows="5" required maxLength="10000" defaultValue={estimate.items.map(i=>`${i.quantity} × ${i.title}`).join('\n')}/></label>
   <label>Delivery<textarea name="delivery" rows="2" required maxLength="5000" defaultValue={date?`Delivered and set up on ${day(date)}${project.brief?.venue?' at '+project.brief.venue:''}.`:'Delivery details to be agreed.'}/></label>
   <label>Not included <small>(optional)</small><textarea name="exclusions" rows="2" maxLength="5000"/></label>
   <label>Reply by<input name="expiresOn" type="date" required min={isoIn(0)} defaultValue={reply}/></label>
   <p className="pipeline-quote-total">Investment <strong>{money(estimate.total,estimate.currency)}</strong></p>
   <button className="crm-primary" disabled={busy}><FileText size={14}/>Send proposal</button>
  </form>:!loadError&&<p className="pipeline-muted">Opening the latest quote…</p>}
 </Modal>;
}

function HoldDialog({detail,signal,q,request,act,busy,error,onClose,onDone}){
 const date=signal.eventDate,until=[isoIn(14),date].filter(Boolean).sort()[0];
 async function submit(e){e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));let revision=0;try{revision=(await request(`/api/projects/${detail.projectId}/operations${q}`)).operations.revision;}catch{/* The save reports any problem. */}
  const result=await act(`/api/projects/${detail.projectId}/operations/place-hold${q}`,'POST',{revision,startDate:raw.startDate,endDate:raw.startDate,holdUntil:raw.holdUntil,location:signal.venue||'',note:'Held from the pipeline.'});if(result)await onDone();}
 return <Modal open onOpenChange={v=>{if(!v)onClose();}} busy={busy} title="Hold the date" description="A hold pencils the date in for this client. It lapses on its own if the date is not confirmed by then.">
  {error&&<p role="alert">{error}</p>}
  <form onSubmit={submit}><label>Date<input name="startDate" type="date" required min={isoIn(0)} defaultValue={date}/></label><label>Hold until<input name="holdUntil" type="date" required min={isoIn(0)} max={date} defaultValue={until}/></label><button className="crm-primary" disabled={busy}><CalendarDays size={14}/>Hold date</button></form>
 </Modal>;
}
