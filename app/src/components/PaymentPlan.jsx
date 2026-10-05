import React,{useEffect,useState} from 'react';
import {CalendarClock} from 'lucide-react';

const money=(minor,currency='GBP')=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}};
const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';

// Scheduled payments for a confirmed estimate. Owners start, adjust and issue
// them; the project approver sees the same schedule read-only.
export function PaymentPlan({p,studio,owner,request,run,busy,invoices,onIssued}){
 const [plan,setPlan]=useState(undefined),[defaults,setDefaults]=useState(null),[editing,setEditing]=useState(null),[issuing,setIssuing]=useState(''),[error,setError]=useState('');
 const url=`/api/projects/${p.id}/invoices/plan?studio=${studio.id}`;
 useEffect(()=>{let active=true;request(url).then(data=>{if(active){setPlan(data.plan);setDefaults(data.defaults||null);}}).catch(()=>{if(active)setPlan(null);});return()=>{active=false;};},[url,request,invoices.length]);
 const estimate=p.estimates?.at(-1),confirmed=estimate?.status==='Budget confirmed'&&estimate.briefRevision===p.briefRevision;
 const invoicedForEstimate=invoices.some(item=>item.estimateId===estimate?.id&&item.status!=='Cancelled');
 const lastAddress=invoices.find(item=>item.snapshot?.customerAddress)?.snapshot.customerAddress||'';
 async function act(body){setError('');const result=await run(()=>request(url,'POST',body));if(result){setPlan(result.plan);if(result.invoice)onIssued(result.invoice);}return result;}
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
  <div className="billing-plan-head"><div><p className="billing-kicker">PAYMENT PLAN</p><h3>{plan.steps.length} payment{plan.steps.length===1?'':'s'} · {money(plan.totalMinor,plan.currency)}</h3><p>{plan.current?owner?'Issue each payment when it is due. Reminders can prompt you on the date.':'The payments your studio has scheduled for this project.':'The confirmed estimate has changed since this plan was made.'}</p></div></div>
  {editing?<form onSubmit={async event=>{event.preventDefault();const steps=editing.map(step=>({id:step.id,label:step.label,dueDate:step.dueDate,amountMinor:Math.round(Number(step.amount)*100)}));if(await act({action:'update',revision:plan.revision,steps}))setEditing(null);}}>
   <ol className="billing-plan-steps billing-plan-edit">{editing.map((step,index)=><li key={step.id||index}><span>{index+1}</span>{step.locked?<><div><strong>{step.label}</strong><small>Issued, so it can no longer change</small></div><span className="billing-plan-amount">{money(Math.round(step.amount*100),plan.currency)}</span><span>{date(step.dueDate)}</span></>:<><input aria-label={`Name of payment ${index+1}`} value={step.label} maxLength="60" required onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,label:e.target.value}:s))}/><input aria-label={`Amount of payment ${index+1}`} type="number" min="0.01" step="0.01" value={step.amount} required onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,amount:e.target.value}:s))}/><input aria-label={`Due date of payment ${index+1}`} type="date" value={step.dueDate} required onChange={e=>setEditing(editing.map((s,i)=>i===index?{...s,dueDate:e.target.value}:s))}/></>}</li>)}</ol>
   <div className="billing-plan-total"><span>Total must equal {money(plan.totalMinor,plan.currency)}</span><span className={total!==plan.totalMinor?'is-error':''}>{money(total,plan.currency)}</span></div>
   {error&&<p className="billing-error" role="alert">{error}</p>}
   <div className="billing-plan-actions"><button className="billing-primary" disabled={busy||total!==plan.totalMinor}>Save plan</button><button type="button" className="billing-text-button" disabled={editing.length>=6} onClick={()=>setEditing([...editing,{label:'Further payment',amount:'',dueDate:new Date().toISOString().slice(0,10)}])}>Add a payment</button>{editing.length>1&&!editing.at(-1).locked&&<button type="button" className="billing-text-button" onClick={()=>setEditing(editing.slice(0,-1))}>Remove last payment</button>}<button type="button" className="billing-text-button" onClick={()=>setEditing(null)}>Cancel</button></div>
  </form>:<>
   <ol className="billing-plan-steps">{plan.steps.map((step,index)=>{const issued=step.invoice&&step.invoice.status!=='Cancelled';return <li key={step.id} className={issued?'is-issued':''}><span>{index+1}</span><div><strong>{step.label}</strong><small>{issued?`Invoice ${step.invoice.number} · ${step.invoice.status}`:`Due ${date(step.dueDate)}`}</small></div><span className="billing-plan-amount">{money(step.amountMinor,plan.currency)}</span>{owner&&plan.current&&index===nextIndex&&!issuing?<button className="billing-outline" onClick={()=>setIssuing(step.id)}>Issue invoice</button>:<span/>}</li>;})}</ol>
   {issuing&&<form className="billing-plan-issue" onSubmit={async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));if(await act({action:'issue',stepId:issuing,...data}))setIssuing('');}}>
    <strong>Issue “{plan.steps.find(step=>step.id===issuing)?.label}”</strong>
    <label><span>Client billing address</span><textarea name="customerAddress" rows="2" maxLength="500" required defaultValue={lastAddress}/></label>
    {(!defaults?.sellerAddress||!defaults?.sellerContact||!defaults?.paymentInstructions)&&<><p className="billing-clarifier">Save your studio address, contact and payment instructions in Settings, Pricing & billing, and they will fill in here automatically.</p><label><span>Studio address</span><textarea name="sellerAddress" rows="2" maxLength="500" required defaultValue={defaults?.sellerAddress||''}/></label><label><span>Studio contact</span><input name="sellerContact" maxLength="300" required defaultValue={defaults?.sellerContact||''}/></label><label><span>Payment instructions</span><textarea name="paymentInstructions" rows="2" maxLength="1000" required defaultValue={defaults?.paymentInstructions||''}/></label></>}
    {error&&<p className="billing-error" role="alert">{error}</p>}
    <div className="billing-plan-actions"><button className="billing-primary" disabled={busy}>Issue invoice</button><button type="button" className="billing-text-button" onClick={()=>setIssuing('')}>Cancel</button></div>
   </form>}
   {owner&&plan.current&&!issuing&&nextIndex>=0&&<div className="billing-plan-actions"><button className="billing-text-button" onClick={()=>setEditing(plan.steps.map(step=>({id:step.id,label:step.label,amount:(step.amountMinor/100).toFixed(2),dueDate:step.dueDate,locked:!!(step.invoice&&step.invoice.status!=='Cancelled')})))}>Adjust payments</button>{!plan.steps.some(step=>step.invoice)&&<button className="billing-text-button" onClick={()=>act({action:'delete'})}>Remove plan</button>}</div>}
   {owner&&!plan.current&&!plan.steps.some(step=>step.invoice)&&<div className="billing-plan-actions"><button className="billing-text-button" onClick={()=>act({action:'delete'})}>Remove this plan</button></div>}
  </>}
 </section>;
}
