import React,{useEffect,useState} from 'react';
import {CalendarClock,CreditCard} from 'lucide-react';
import {todayISO,formatDay,shortDay} from '../lib/dates';
import {carriedDiscount,discountFor,invoiceFigures} from '../lib/invoice-charges';
import {WorkspaceSwitch} from './workspace/WorkspaceUI';

const money=(minor,currency='GBP')=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}};
const autopayReturn=()=>new URLSearchParams(window.location.search).get('autopay');
const date=value=>formatDay(value,'—');
// A payment tied to the event date has no due date until the project has one.
const dueLine=step=>step.dueDate?`Due ${date(step.dueDate)}`:'Due once the project date is set';

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

// With autopay on, what will happen to one issued plan invoice. Nothing for a
// payment not yet issued, or one settled some other way.
export function autopayChip(autopay,invoice){
 if(autopay?.status!=='active'||!invoice||invoice.status==='Cancelled')return null;
 const charge=autopay.charges.filter(item=>item.invoiceId===invoice.id).at(-1);
 if(charge?.status==='paid')return {label:'Charged by card',tone:'done'};
 if(charge&&['creating','processing'].includes(charge.status))return {label:'Card payment processing'};
 if(charge?.status==='needs_review')return {label:'Card charge needs checking',tone:'warn'};
 if(charge?.status==='failed')return {label:'Card declined',tone:'warn'};
 if(!(invoice.balanceMinor>0)||!invoice.dueDate)return null;
 return {label:invoice.dueDate<=today()?'Card charged today':`Card charged ${shortDay(invoice.dueDate)}`};
}

// Plan invoices go out with the studio's usual payment terms.
const termsText=defaults=>{const days=Number.isInteger(defaults?.paymentTermsDays)?defaults.paymentTermsDays:14;return days===0?'on the day':days===1?'1 day':`${days} days`;};

// Issuing one scheduled payment by hand. A discount covers this invoice only; a percentage taken off an
// earlier invoice for the same estimate starts here too, as on the main invoice form.
function PlanIssueForm({p,plan,step,invoices,defaults,lastAddress,busy,error,onCancel,onIssue}){
 const earlier=invoices.filter(item=>item.estimateId===plan.estimateId&&item.status!=='Cancelled'),carried=carriedDiscount(earlier);
 const [discountType,setDiscountType]=useState(carried?'percent':'none'),[discountValue,setDiscountValue]=useState(carried?carried.percent:''),[discountReason,setDiscountReason]=useState(carried?.reason||'');
 if(!step)return null;
 const estimate=p.estimates?.find(item=>item.id===plan.estimateId),index=plan.steps.indexOf(step),last=index===plan.steps.length-1;
 // The same share before tax the server works out: the rest of the estimate for the last payment, a pro rata share otherwise.
 const shareMinor=step.amountMinor,shareNetMinor=!estimate?0:last?estimate.subtotal-earlier.reduce((total,item)=>total+(item.netMinor||0)+(item.discountNetMinor||0),0):Math.round(estimate.subtotal*shareMinor/(estimate.total||1));
 const input=discountType==='percent'?{type:'percent',percent:Number(discountValue),reason:discountReason}:discountType==='amount'?{type:'amount',amountMinor:Math.round(Number(discountValue)*100),reason:discountReason}:null;
 let discount=null,discountError='';
 if(input&&discountValue!==''){try{discount=discountFor(input,{shareMinor,shareNetMinor});}catch(caught){discountError=caught.message;}}
 const figures=invoiceFigures({shareMinor,shareNetMinor,discount});
 return <form className="billing-plan-issue" onSubmit={event=>{event.preventDefault();if(discountError)return;onIssue({...Object.fromEntries(new FormData(event.currentTarget)),discount:discount?input:null});}}>
  <strong>Issue “{step.label}”</strong>
  <label><span>Client billing address</span><textarea name="customerAddress" rows="2" maxLength="500" required defaultValue={lastAddress}/></label>
  {!p.brief?.date&&<label><span>Service or supply date</span><input name="supplyDate" type="date" required/></label>}
  {!step.dueDate&&<label><span>Invoice due date</span><input name="dueDate" type="date" required min={todayISO()}/></label>}
  {(!defaults?.sellerAddress||!defaults?.sellerContact||!defaults?.paymentInstructions)&&<><p className="billing-clarifier">Save your studio address, contact and payment instructions in Settings, Invoices & payment plans, and they will fill in here automatically.</p><label><span>Studio address</span><textarea name="sellerAddress" rows="2" maxLength="500" required defaultValue={defaults?.sellerAddress||''}/></label><label><span>Studio contact</span><input name="sellerContact" maxLength="300" required defaultValue={defaults?.sellerContact||''}/></label><label><span>Payment instructions</span><textarea name="paymentInstructions" rows="2" maxLength="1000" required defaultValue={defaults?.paymentInstructions||''}/></label></>}
  <div className="billing-plan-discount">
   <label><span>Discount</span><select value={discountType} onChange={event=>{setDiscountType(event.target.value);setDiscountValue('');}}><option value="none">No discount</option><option value="percent">Percentage</option><option value="amount">Fixed amount</option></select></label>
   {discountType!=='none'&&<><label><span>{discountType==='percent'?'Percentage off':`Amount off before tax (${plan.currency})`}</span><input type="number" min="0.01" step="0.01" max={discountType==='percent'?'99.99':undefined} value={discountValue} onChange={event=>setDiscountValue(event.target.value)} placeholder={discountType==='percent'?'10':'0.00'} required/></label>
   <label><span>Shown as (optional)</span><input maxLength="60" value={discountReason} onChange={event=>setDiscountReason(event.target.value)} placeholder="For example, returning client"/></label></>}
  </div>
  {discountError?<p className="billing-error" role="alert">{discountError}</p>
   :discount?<p className="billing-clarifier">{carried&&discountType==='percent'&&Number(discountValue)===Number(carried.percent)?`Carried over from ${carried.number}. `:''}This invoice comes to {money(figures.amountMinor,plan.currency)} instead of {money(shareMinor,plan.currency)}. The plan still counts the full {money(shareMinor,plan.currency)} towards the project.</p>
   :<p className="billing-clarifier">Optional. A discount comes off the price before tax and only covers this invoice.</p>}
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-plan-actions"><button className="billing-primary" disabled={busy||!!discountError}>Issue invoice</button><button type="button" className="billing-text-button" onClick={onCancel}>Cancel</button></div>
 </form>;
}

// Scheduled payments for a confirmed estimate. Owners start, adjust and issue
// them; the project approver sees the same schedule read-only.
export function PaymentPlan({p,studio,owner,request,run,busy,invoices,onIssued}){
 const [plan,setPlan]=useState(undefined),[defaults,setDefaults]=useState(null),[editing,setEditing]=useState(null),[issuing,setIssuing]=useState(''),[error,setError]=useState('');
 const url=`/api/projects/${p.id}/invoices/plan?studio=${studio.id}`;
 useEffect(()=>{let active=true;request(url).then(data=>{if(active){setPlan(data.plan);setDefaults(data.defaults||null);}}).catch(()=>{if(active)setPlan(null);});return()=>{active=false;};},[url,request,invoices.length]);
 const estimate=p.estimates?.at(-1),confirmed=estimate?.status==='Budget confirmed'&&estimate.briefRevision===p.briefRevision;
 const invoicedForEstimate=invoices.some(item=>item.estimateId===estimate?.id&&item.status!=='Cancelled');
 const lastAddress=invoices.find(item=>item.snapshot?.customerAddress)?.snapshot.customerAddress||'';
 async function act(body){setError('');const result=await run(()=>request(url,'POST',body));if(result?.plan!==undefined){setPlan(result.plan);for(const invoice of [result.invoice,...(result.invoices||[])].filter(Boolean))onIssued(invoice);}return result;}
 if(plan===undefined)return null;
 if(!plan){
  if(!owner||!confirmed||invoicedForEstimate)return null;
  const template=defaults?.plan||[];
  return <section className="billing-plan" aria-label="Payment plan">
   <div className="billing-plan-head"><div><p className="billing-kicker">PAYMENT PLAN</p><h3>Split {money(estimate.total,estimate.currency)} into scheduled payments.</h3><p>Starts from your default plan: {template.map(step=>`${step.label} ${step.percent}%`).join(', ')}. You can change amounts and dates before anything is issued.</p></div><CalendarClock size={26} aria-hidden="true"/></div>
   {error&&<p className="billing-error" role="alert">{error}</p>}
   <div className="billing-plan-actions"><button className="billing-primary" disabled={busy} onClick={()=>act({action:'create'})}>Start payment plan</button></div>
  </section>;
 }
 const nextIndex=plan.steps.findIndex(step=>!step.invoice||step.invoice.status==='Cancelled');
 const total=editing?editing.reduce((sum,step)=>sum+(Math.round(Number(step.amount)*100)||0),0):0;
 return <section className="billing-plan" aria-label="Payment plan">
  <div className="billing-plan-head"><div><p className="billing-kicker">PAYMENT PLAN</p><h3>{plan.steps.length} payment{plan.steps.length===1?'':'s'} · {money(plan.totalMinor,plan.currency)}</h3><p>{plan.current?owner?plan.autoIssue?`Each payment is issued automatically ${termsText(defaults)} before it is due.`:'Issue each payment when it is due. Reminders can prompt you on the date.':'The payments your studio has scheduled for this project.':'The confirmed estimate has changed since this plan was made.'}</p></div></div>
  {editing?<form onSubmit={async event=>{event.preventDefault();const steps=editing.map(step=>({id:step.id,label:step.label,dueDate:step.dueDate,amountMinor:Math.round(Number(step.amount)*100)}));if(await act({action:'update',revision:plan.revision,steps}))setEditing(null);}}>
   <ol className="billing-plan-steps billing-plan-edit">{editing.map((step,index)=><li key={step.id||index}><span>{index+1}</span>{step.locked?<><div><strong>{step.label}</strong><small>Issued, so it can no longer change</small></div><span className="billing-plan-amount">{money(Math.round(step.amount*100),plan.currency)}</span><span>{date(step.dueDate)}</span></>:<><input aria-label={`Name of payment ${index+1}`} value={step.label} maxLength="60" required onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,label:e.target.value}:s))}/><input aria-label={`Amount of payment ${index+1}`} type="number" min="0.01" step="0.01" value={step.amount} required onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,amount:e.target.value}:s))}/><input aria-label={`Due date of payment ${index+1}`} type="date" value={step.dueDate} required={!step.undated} title={step.undated&&!step.dueDate?'Leave empty to fall due once the project date is set':undefined} onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,dueDate:e.target.value}:s))}/></>}</li>)}</ol>
   {editing.some(step=>step.undated&&!step.dueDate)&&<p className="billing-clarifier">A payment left without a date falls due once the project date is set.</p>}
   <div className="billing-plan-total"><span>Total must equal {money(plan.totalMinor,plan.currency)}</span><span className={total!==plan.totalMinor?'is-error':''}>{money(total,plan.currency)}</span></div>
   {error&&<p className="billing-error" role="alert">{error}</p>}
   <div className="billing-plan-actions"><button className="billing-primary" disabled={busy||total!==plan.totalMinor}>Save plan</button><button type="button" className="billing-text-button" disabled={editing.length>=6} onClick={()=>setEditing([...editing,{label:'Further payment',amount:'',dueDate:todayISO()}])}>Add a payment</button>{editing.length>1&&!editing.at(-1).locked&&<button type="button" className="billing-text-button" onClick={()=>setEditing(editing.slice(0,-1))}>Remove last payment</button>}<button type="button" className="billing-text-button" onClick={()=>setEditing(null)}>Cancel</button></div>
  </form>:<>
   <ol className="billing-plan-steps">{plan.steps.map((step,index)=>{const issued=step.invoice&&step.invoice.status!=='Cancelled';return <li key={step.id} className={issued?'is-issued':''}><span>{index+1}</span><div><strong>{step.label}</strong><small>{issued?`Invoice ${step.invoice.number} · ${step.invoice.status}`:dueLine(step)}</small>{owner&&!issued&&step.autoBlocked&&<small className="billing-plan-blocked">{step.autoBlocked.reason}</small>}{(()=>{const chip=autopayChip(plan.autopay,issued&&invoices.find(item=>item.id===step.invoice.id));return chip&&<span className={`billing-plan-chip${chip.tone?' is-'+chip.tone:''}`}><CreditCard size={12} aria-hidden="true"/>{chip.label}</span>;})()}</div><span className="billing-plan-amount">{money(step.amountMinor,plan.currency)}</span>{owner&&plan.current&&index===nextIndex&&!issuing?<button className="billing-outline" onClick={()=>setIssuing(step.id)}>Issue invoice</button>:<span/>}</li>;})}</ol>
   {issuing&&<PlanIssueForm p={p} plan={plan} step={plan.steps.find(step=>step.id===issuing)} invoices={invoices} defaults={defaults} lastAddress={lastAddress} busy={busy} error={error} onCancel={()=>setIssuing('')} onIssue={async data=>{if(await act({action:'issue',stepId:issuing,...data}))setIssuing('');}}/>}
   {owner&&plan.current&&!issuing&&nextIndex>=0&&<div className="billing-plan-actions"><button className="billing-text-button" onClick={()=>setEditing(plan.steps.map(step=>({id:step.id,label:step.label,amount:(step.amountMinor/100).toFixed(2),dueDate:step.dueDate,undated:!step.dueDate,locked:!!(step.invoice&&step.invoice.status!=='Cancelled')})))}>Adjust payments</button>{!plan.steps.some(step=>step.invoice)&&<button className="billing-text-button" onClick={()=>act({action:'delete'})}>Remove plan</button>}</div>}
   {owner&&!plan.current&&!plan.steps.some(step=>step.invoice)&&<div className="billing-plan-actions"><button className="billing-text-button" onClick={()=>act({action:'delete'})}>Remove this plan</button></div>}
   {owner&&plan.current&&!issuing&&(nextIndex>=0||plan.autoIssue)&&<div className="billing-plan-auto"><WorkspaceSwitch label="Issue each payment automatically" description={plan.autoIssue?`On since ${date(plan.autoIssue.since)}. Each invoice goes out ${termsText(defaults)} before its due date with your saved studio details and the client's last billing address. A percentage discount on the earlier invoices carries over. If anything is missing you get a task instead.`:`Each invoice goes out ${termsText(defaults)} before its due date, so you don't have to remember. If anything is missing you get a task instead.`} checked={!!plan.autoIssue} disabled={busy} onCheckedChange={on=>act({action:'auto-issue',on})}/></div>}
  </>}
  {!editing&&<Autopay plan={plan} owner={owner} busy={busy} act={act}/>}
 </section>;
}

// Autopay: the client saves a card once and each issued payment is charged on its due date.
function Autopay({plan,owner,busy,act}){
 const autopay=plan.autopay,[starting,setStarting]=useState(false),[error,setError]=useState(''),[returned]=useState(autopayReturn);
 if(!autopay||!plan.current||(!autopay.offered&&autopay.status!=='active'))return null;
 const failed=autopay.charges.filter(charge=>charge.status==='failed'),on=autopay.status==='active';
 async function setup(){setError('');setStarting(true);const result=await act({action:'autopay-setup'});if(!result?.url){setStarting(false);return;}
  try{const destination=new URL(result.url);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error();window.location.assign(destination.toString());}catch{setError('Stripe did not return a secure card page.');setStarting(false);}}
 return <div className={`billing-autopay${on?' is-on':''}`}>
  <CreditCard size={20} aria-hidden="true"/>
  <div>
   <strong>{on?`Autopay is on · ${autopay.cardLabel}`:'Autopay'}</strong>
   <p>{on?(owner?`Set up by ${autopay.enabledBy||'your client'}. Each payment is charged to this card on its due date once you have issued its invoice.`:'Each payment is charged to this card on its due date, once the studio has issued its invoice.')
    :owner?'Offered on this plan. Your client can save a card here to pay each instalment automatically.':'Save a card and each payment is taken automatically on its due date. You can switch it off at any time.'}</p>
   {failed.map(charge=><p key={charge.id} className="billing-autopay-failed">Autopay could not take {money(charge.amountMinor,charge.currency)}: {charge.failure}{!owner&&' Save a different card or pay the invoice below.'}</p>)}
   {returned==='saved'&&!on&&<p role="status">Card saved. Autopay switches on as soon as Stripe confirms it.</p>}
   {returned==='cancelled'&&!on&&<p role="status">No card was saved, so autopay is still off.</p>}
   {error&&<p className="billing-error" role="alert">{error}</p>}
   <div className="billing-plan-actions">
    {!owner&&<button className={on?'billing-text-button':'billing-primary'} disabled={busy||starting} onClick={setup}>{starting?'Opening Stripe…':on?'Use a different card':'Set up autopay'}</button>}
    {on&&<button className="billing-text-button" disabled={busy} onClick={()=>act({action:'autopay-off'})}>Switch off autopay</button>}
   </div>
  </div>
 </div>;
}
