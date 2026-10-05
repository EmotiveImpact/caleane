import React,{useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {CalendarDays,FileText,Plus,Receipt,Send,Trash2,X} from 'lucide-react';
import {WorkspaceStatus} from './workspace/WorkspaceUI';

// The enquiry's quote, proposal, date hold and deposit, read from the linked
// project and driven from the enquiry so the owner never has to leave it.
const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:2}).format((minor||0)/100);
const day=value=>value?new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const isoIn=days=>{const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const readError=e=>e?.message||'Something went wrong. Please try again.';
export const toneFor={bad:'danger',warn:'warning',good:'success',info:'neutral'};

export function SignalChips({signal,limit=2}){
 const flags=(signal?.flags||[]).slice(0,limit);
 if(!flags.length)return null;
 return <span className="pipeline-signals">{flags.map(f=><WorkspaceStatus key={f.kind} value={f.label} tone={toneFor[f.tone]}/>)}</span>;
}

function Modal({open,onOpenChange,title,description,children,busy}){
 return <Dialog.Root open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><Dialog.Portal><Dialog.Overlay className="modal-backdrop"/><Dialog.Content className="modal crm-create-dialog pipeline-create pipeline-deal-dialog"><Dialog.Close asChild><button className="close" aria-label={'Close '+title.toLowerCase()}><X size={18}/></button></Dialog.Close><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function DealPanel({detail,signal,studio,request,run,busy,openProject,onChanged}){
 const [dialog,setDialog]=useState(null),[error,setError]=useState('');
 const q='?studio='+studio.id,pid=detail.projectId,s=signal||{};
 async function act(path,method,body){setError('');return run(async()=>{try{return await request(path,method,body);}catch(e){setError(readError(e));return null;}});}
 async function done(){setDialog(null);await onChanged?.();}
 const fit=s.fit||[],urgent=(s.flags||[]).filter(f=>f.rank<=2);
 if(!pid)return <section className="pipeline-deal"><header><h3>Quote and booking</h3></header><p className="pipeline-muted">Create a linked project to build a quote, send a proposal and hold the date from here.</p>{fit.length>0&&<FitList fit={fit}/>}</section>;
 const estimate=s.estimate,proposal=s.proposal,hold=s.hold,deposit=s.deposit;
 const canPropose=estimate&&['Awaiting review','Budget confirmed'].includes(estimate.status)&&proposal?.status!=='Awaiting response'&&proposal?.status!=='Scope accepted';
 const rows=[
  {key:'quote',label:'Quote',value:estimate?`${money(estimate.total,estimate.currency)} · version ${estimate.version}`:'Not started',status:estimate?.status,
   action:<button className={estimate?'pipeline-quiet':'crm-primary'} disabled={busy} onClick={()=>setDialog('quote')}><Plus size={14}/>{estimate?'New version':'Build quote'}</button>},
  {key:'proposal',label:'Proposal',value:proposal?(proposal.status==='Awaiting response'?`Open until ${day(proposal.expiresOn)}`:`Version ${proposal.version}`):estimate?'Ready to send':'Build the quote first',status:proposal?.status,
   action:canPropose?<button className="crm-primary" disabled={busy} onClick={()=>setDialog('proposal')}><Send size={14}/>Send proposal</button>:null},
  {key:'date',label:'Date',value:hold?(hold.status==='Confirmed'?`${day(hold.startDate)} confirmed`:`${day(hold.startDate)} held until ${day(hold.holdUntil)}`):s.eventDate?`${day(s.eventDate)} not held`:'No date in the brief',status:hold?.status==='Confirmed'?'Confirmed':hold?'Held':null,
   action:!hold&&s.eventDate?<button className="pipeline-quiet" disabled={busy} onClick={()=>setDialog('hold')}><CalendarDays size={14}/>Hold date</button>:null},
  {key:'deposit',label:'Deposit',value:deposit?(deposit.amountMinor?`${money(deposit.paidMinor||0,deposit.currency)} of ${money(deposit.amountMinor,deposit.currency)}`:deposit.status):proposal?.status==='Scope accepted'?'Ready to invoice':'After acceptance',status:deposit?.status,
   action:proposal?.status==='Scope accepted'&&deposit?.status!=='Paid'?<button className="pipeline-quiet" onClick={()=>openProject({id:pid},'Billing')}><Receipt size={14}/>Open billing</button>:null}
 ];
 return <section className="pipeline-deal" aria-label="Quote and booking"><header><h3>Quote and booking</h3>{s.productionStatus&&s.productionStatus!=='No date hold'&&<span>{s.productionStatus}</span>}</header>
  {error&&<p className="crm-alert" role="alert">{error}</p>}
  {urgent.map(f=><p key={f.kind} className={'pipeline-callout is-'+f.tone}>{calloutText(f,s)}</p>)}
  <dl className="pipeline-deal-steps">{rows.map(r=><div key={r.key}><dt>{r.label}</dt><dd><span>{r.value}</span>{r.status&&<WorkspaceStatus value={r.status}/>}</dd>{r.action&&<div className="pipeline-deal-action">{r.action}</div>}</div>)}</dl>
  {proposal?.status==='Awaiting response'&&<p className="pipeline-muted">{s.nextFollowUp?`Next follow-up ${day(s.nextFollowUp)}. It is skipped if they reply first.`:s.lastClientMessageAt&&s.lastClientMessageAt>proposal.sharedAt?'They have replied since the proposal was shared, so follow-ups have stopped.':'Automatic follow-ups are off. Switch them on in Automations.'}{!s.portalClient&&' Invite the client to their project space so they can accept online.'}</p>}
  {fit.length>0&&<FitList fit={fit}/>}
  {dialog==='quote'&&<QuoteDialog detail={detail} studio={studio} request={request} act={act} busy={busy} error={error} onClose={()=>setDialog(null)} onDone={done}/>}
  {dialog==='proposal'&&<ProposalDialog detail={detail} signal={s} studio={studio} request={request} act={act} busy={busy} error={error} onClose={()=>setDialog(null)} onDone={done}/>}
  {dialog==='hold'&&<HoldDialog detail={detail} signal={s} q={q} request={request} act={act} busy={busy} error={error} onClose={()=>setDialog(null)} onDone={done}/>}
 </section>;
}

function calloutText(flag,s){
 if(flag.kind==='clash')return `${day(s.eventDate)} is already ${flag.label==='Date full'?'fully booked':'held for another client'}. Offer another date or check you can take both.`;
 if(flag.kind==='hold-expired')return 'The date hold has expired. Hold it again or release the date.';
 if(flag.kind==='hold-ending')return `The date hold ends ${day(s.hold?.holdUntil)}.`;
 if(flag.kind==='proposal-expired')return 'The proposal has passed its reply date. Send a new version to keep going.';
 if(flag.kind==='proposal-ending')return `The proposal closes ${day(s.proposal?.expiresOn)}.`;
 if(flag.kind==='changes')return 'The client asked for changes. Update the quote and send a new version.';
 if(flag.kind==='deposit')return 'Accepted. Issue the deposit invoice; the date confirms itself once it is paid.';
 return flag.label;
}

function FitList({fit}){
 return <div className="pipeline-fit"><h4>Fit check</h4><ul>{fit.map(f=><li key={f.kind}><WorkspaceStatus value={f.ok?'Fits':'Check'} tone={f.ok?'success':'warning'}/>{f.label}</li>)}</ul></div>;
}

function QuoteDialog({detail,studio,request,act,busy,error,onClose,onDone}){
 const [catalogue,setCatalogue]=useState([]),[currency,setCurrency]=useState('GBP'),[lines,setLines]=useState([]),[pick,setPick]=useState(''),[note,setNote]=useState('');
 useEffect(()=>{let live=true;request('/api/catalogue?studio='+studio.id).then(d=>{if(!live)return;const items=(d.items||[]).filter(i=>!i.archived);setCatalogue(items);if(items[0])setCurrency(items[0].currency);}).catch(()=>{});return()=>{live=false;};},[studio.id]);
 const available=catalogue.filter(i=>i.currency===currency),total=lines.reduce((sum,l)=>sum+l.quantity*l.unitAmount,0);
 const update=(index,patch)=>setLines(list=>list.map((l,i)=>i===index?{...l,...patch}:l));
 function add(){const item=available.find(i=>i.id===pick);setLines(list=>[...list,item?{title:item.name,quantity:1,unitAmount:item.unitAmount}:{title:'',quantity:1,unitAmount:0}]);setPick('');}
 async function submit(e){e.preventDefault();const result=await act(`/api/projects/${detail.projectId}/estimates?studio=${studio.id}`,'POST',{title:('Quote · '+detail.title).slice(0,200),note,currency,taxRate:0,items:lines.map(l=>({title:l.title.trim(),quantity:Number(l.quantity),unitAmount:Math.round(Number(l.unitAmount))}))});if(result)await onDone();}
 return <Modal open onOpenChange={v=>{if(!v)onClose();}} busy={busy} title="Build quote" description={`Price the work for ${detail.clientName}. Sending it moves the enquiry to awaiting decision.`}>
  {error&&<p role="alert">{error}</p>}
  <form onSubmit={submit} className="pipeline-quote-form">
   <label>Currency<select value={currency} onChange={e=>{setCurrency(e.target.value);setLines([]);}}>{['GBP','EUR','USD'].map(c=><option key={c}>{c}</option>)}</select></label>
   <div className="pipeline-quote-add"><label className="sr-only" htmlFor="quote-pick">Add from your price list</label><select id="quote-pick" value={pick} onChange={e=>setPick(e.target.value)}><option value="">{available.length?'Choose from your price list…':'Custom line'}</option>{available.map(i=><option key={i.id} value={i.id}>{i.name} ({money(i.unitAmount,i.currency)} {i.unit})</option>)}</select><button type="button" className="crm-secondary" onClick={add}><Plus size={14}/>Add line</button></div>
   {lines.length>0?<table className="pipeline-quote-lines"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{lines.map((l,i)=><tr key={i}>
    <td><input aria-label={`Line ${i+1} description`} required maxLength="200" value={l.title} onChange={e=>update(i,{title:e.target.value})}/></td>
    <td><input aria-label={`Line ${i+1} quantity`} type="number" min="1" max="10000" step="1" required value={l.quantity} onChange={e=>update(i,{quantity:e.target.value})}/></td>
    <td><input aria-label={`Line ${i+1} price`} type="number" min="0" step="0.01" required value={l.unitAmount/100} onChange={e=>update(i,{unitAmount:Math.round(Number(e.target.value)*100)})}/></td>
    <td><button type="button" className="pipeline-quiet" aria-label={`Remove line ${i+1}`} onClick={()=>setLines(list=>list.filter((x,j)=>j!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>:<p className="pipeline-muted">Add the first line from your price list or as a custom line.</p>}
   <p className="pipeline-quote-total">Total <strong>{money(total,currency)}</strong></p>
   <label>Note for the client<textarea rows="2" maxLength="3000" value={note} onChange={e=>setNote(e.target.value)} placeholder="Anything that explains the pricing"/></label>
   <button className="crm-primary" disabled={busy||!lines.length}>Share quote</button>
  </form></Modal>;
}

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
