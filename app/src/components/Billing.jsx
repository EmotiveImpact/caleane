import {CollectionFilter} from './CollectionFilter';
import {AgreementPages,printAgreement} from './AgreementDocument';
import {invoiceDocumentHtml} from '../lib/document-format';
import React,{useEffect,useMemo,useState} from 'react';
import {Check,Copy,Download,FileText,Plus} from 'lucide-react';
import '../folio-billing.css';

const money=(minor,currency='GBP')=>{
 try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}
 catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}
};
const date=value=>value?new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const dueDefault=()=>new Date(Date.now()+14*86400000).toISOString().slice(0,10);
const minorFromInput=value=>Math.round(Number(value)*100);
const isOpen=invoice=>invoice.status==='Issued'||invoice.status==='Partially paid';
const statusText=invoice=>invoice.status==='Paid'?'Paid':invoice.status==='Partially paid'?'Partially paid':invoice.status;
const paymentName={bank_transfer:'Bank transfer',paypal_external:'PayPal outside Caleane',stripe_external:'Stripe',other_external:'Other external payment'};

function Status({invoice}){return <span className={`billing-status billing-status-${invoice.status.toLowerCase().replaceAll(' ','-')}`}>{statusText(invoice)}</span>}

function InvoiceList({invoices,selected,onSelect}){
 return <div className="billing-invoice-list" role="group" aria-label="Project invoices">{invoices.map(invoice=><button key={invoice.id} className={selected===invoice.id?'selected':''} onClick={()=>onSelect(invoice.id)} aria-pressed={selected===invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.kind} · Issued {date(invoice.issuedAt)}</small></span><span className="billing-list-end"><strong>{money(invoice.amountMinor,invoice.currency)}</strong><Status invoice={invoice}/></span></button>)}</div>;
}

function IssueForm({p,invoices,mutate,busy,onIssued,onCancel}){
 const latestEstimate=p.estimates?.at(-1);
 const confirmed=latestEstimate?.status==='Budget confirmed'&&latestEstimate.briefRevision===p.briefRevision?[latestEstimate]:[];
 const [estimateId,setEstimateId]=useState(confirmed.at(-1)?.id||'');
 const estimate=confirmed.find(item=>item.id===estimateId);
 const alreadyInvoiced=invoices.filter(item=>item.status!=='Cancelled').reduce((total,item)=>total+item.amountMinor,0);
 const remaining=Math.max(0,(estimate?.total||0)-alreadyInvoiced);
 const hasPrior=alreadyInvoiced>0;
 const hasOlderInvoice=invoices.some(item=>item.status!=='Cancelled'&&item.estimateId!==estimateId);
 const [kind,setKind]=useState(hasPrior?'Balance':'Deposit');
 const [amount,setAmount]=useState('');
 const [formError,setFormError]=useState('');
 useEffect(()=>{setKind(hasPrior?'Balance':'Deposit');setAmount('');setFormError('');},[estimateId,hasPrior]);
 if(!confirmed.length)return <div className="billing-empty billing-empty-form"><FileText size={26}/><h3>Agree the latest budget direction first.</h3><p>Share an estimate based on the current brief and ask the client to confirm its budget direction. That estimate remains separate from the invoice and payment record.</p><button className="billing-text-button" onClick={onCancel}>Close</button></div>;
 if(hasOlderInvoice)return <div className="billing-empty billing-empty-form"><FileText size={26}/><h3>Review the earlier invoices first.</h3><p>Active invoices refer to a different estimate version. Settle or cancel those records before issuing against the new estimate.</p><button className="billing-text-button" onClick={onCancel}>Close</button></div>;
 return <form className="billing-issue-form" onSubmit={async event=>{
  event.preventDefault();setFormError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const amountMinor=minorFromInput(data.amount);
  if(kind==='Deposit'&&(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>=remaining)){setFormError('Enter a deposit above zero and below the remaining estimate total.');return;}
  const body={estimateId,kind,dueDate:data.dueDate,note:data.note,paymentInstructions:data.paymentInstructions,sellerAddress:data.sellerAddress,sellerContact:data.sellerContact,customerAddress:data.customerAddress,supplyDate:data.supplyDate,taxRegistration:data.taxRegistration};
  if(kind==='Deposit')body.amountMinor=amountMinor;
  const result=await mutate('invoices',body);
  if(result?.invoice)onIssued(result.invoice);
 }}>
  <div className="billing-form-heading"><div><h3>Issue an invoice</h3><p>This appears in the client’s private project. No email or payment request is sent elsewhere.</p></div><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
  <div className="billing-form-grid"><label><span>Confirmed estimate</span><select name="estimateId" value={estimateId} onChange={event=>setEstimateId(event.target.value)}>{confirmed.map(item=><option key={item.id} value={item.id}>{item.title} · version {item.version}</option>)}</select></label><label><span>Invoice type</span><select name="kind" value={kind} onChange={event=>setKind(event.target.value)}>{!hasPrior&&<><option value="Deposit">Deposit</option><option value="Full">Full amount</option></>}{hasPrior&&remaining>0&&<><option value="Balance">Remaining balance</option><option value="Deposit">Further deposit</option></>}</select></label></div>
  {estimate&&<div className="billing-scope-line"><span>Estimate total <strong>{money(estimate.total,estimate.currency)}</strong></span><span>Available to invoice <strong>{money(remaining,estimate.currency)}</strong></span></div>}
  {kind==='Deposit'&&<label className="billing-amount-field"><span>Deposit amount ({estimate?.currency||'GBP'})</span><input name="amount" type="number" min="0.01" max={Math.max(0,(remaining-1)/100).toFixed(2)} step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required placeholder="0.00"/></label>}
  <div className="billing-form-grid"><label><span>Due date</span><input name="dueDate" type="date" defaultValue={dueDefault()} required/></label><label><span>Internal note or payment context (optional)</span><input name="note" maxLength="2000" placeholder="For example, first instalment"/></label></div>
  <div className="billing-issue-details"><h4>Details shown on the invoice</h4><p>These are saved with this issued version. Check them before sharing the invoice with your client.</p><div className="billing-form-grid"><label><span>Studio address</span><textarea name="sellerAddress" rows="2" maxLength="500" required placeholder="Business address"/></label><label><span>Client billing address</span><textarea name="customerAddress" rows="2" maxLength="500" required placeholder="Client or company address"/></label><label><span>Studio contact</span><input name="sellerContact" maxLength="300" required placeholder="Email or phone number"/></label><label><span>Service or supply date</span><input name="supplyDate" type="date" required/></label><label><span>Tax registration number (if applicable)</span><input name="taxRegistration" maxLength="100" placeholder="VAT or other tax number"/></label></div></div>
  <label><span>Bank transfer or alternative payment instructions</span><textarea name="paymentInstructions" rows="3" maxLength="1000" required placeholder="Include the bank or external payment details and the reference the client should use."/><small>Check these details before issuing. They are shown separately from any Stripe Checkout option.</small></label>
  {formError&&<p className="billing-error" role="alert">{formError}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy||remaining<=0}>Issue invoice </button><p>An invoice is a request for payment. Its status changes only when the studio records money received.</p></div>
 </form>;
}

function PaymentForm({invoice,request,run,studio,p,onSaved,onCancel,busy}){
 const balance=Math.max(0,invoice.amountMinor-(invoice.paidMinor||0));
 const [error,setError]=useState('');
 const [clientPaymentId]=useState(()=>crypto.randomUUID());
 return <form className="billing-payment-form" onSubmit={async event=>{
  event.preventDefault();setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const amountMinor=minorFromInput(data.amount);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>balance){setError('Enter an amount above zero and no more than the outstanding balance.');return;}
  const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/payments?studio=${studio.id}`,'POST',{amountMinor,method:data.method,reference:data.reference,receivedAt:data.receivedAt,note:data.note,clientPaymentId}));
  if(result?.invoice)onSaved(result.invoice);
 }}>
  <div className="billing-form-heading"><div><h3>Record a payment</h3><p>Only enter a payment you have confirmed in your bank or payment provider.</p></div><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
  <div className="billing-form-grid"><label><span>Amount received ({invoice.currency})</span><input name="amount" type="number" min="0.01" max={(balance/100).toFixed(2)} step="0.01" defaultValue={(balance/100).toFixed(2)} required/></label><label><span>Received on</span><input name="receivedAt" type="date" defaultValue={today()} required/></label><label><span>Where it was received</span><select name="method"><option value="bank_transfer">Bank transfer</option><option value="paypal_external">PayPal outside Caleane</option><option value="stripe_external">Stripe outside Caleane</option><option value="other_external">Other external payment</option></select></label><label><span>Transaction reference (optional)</span><input name="reference" maxLength="160" placeholder="From your bank or provider"/></label></div>
  <label><span>Note for the payment record (optional)</span><textarea name="note" rows="2" maxLength="1000"/></label>
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy}>Record received payment <Check size={16}/></button><p>This is a studio-entered record, not a provider verification.</p></div>
 </form>;
}

function InvoiceDetail({invoice,p,studio,owner,request,run,busy,onChanged,stripeReady,checkoutReturn}){
 const [recording,setRecording]=useState(false),[cancelling,setCancelling]=useState(false),[expiring,setExpiring]=useState(false),[copy,setCopy]=useState(false),[linkCopied,setLinkCopied]=useState(false),[linkError,setLinkError]=useState(''),[cancelReason,setCancelReason]=useState(''),[checkoutBusy,setCheckoutBusy]=useState(false),[checkoutError,setCheckoutError]=useState('');
 const balance=Math.max(0,invoice.amountMinor-(invoice.paidMinor||0));
 const checkoutStatus=invoice.checkout?.status;
 const checkoutActive=['creating','open','processing'].includes(checkoutStatus);
 const canRecord=owner&&isOpen(invoice)&&balance>0&&!checkoutActive;
 const canCancel=owner&&invoice.status==='Issued'&&!(invoice.paidMinor||0)&&!checkoutActive;
 const canCheckout=stripeReady&&isOpen(invoice)&&balance>0&&checkoutStatus!=='processing';
 const canExpire=owner&&checkoutStatus==='open';
 const stripePaid=invoice.status==='Paid'&&invoice.payments?.some(payment=>payment.source==='stripe_verified');
 const snapshot=invoice.snapshot||{};
 const [documentView,setDocumentView]=useState(false);
 const invoiceDocument={id:invoice.id,revision:1,title:`Invoice ${invoice.number}`,version:invoice.estimateVersion,status:invoice.status,bodyHasTitle:true,termsHtml:invoiceDocumentHtml(invoice)};
 async function cancelInvoice(event){event.preventDefault();const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/cancel?studio=${studio.id}`,'POST',{reason:cancelReason}));if(result?.invoice){onChanged(result.invoice);setCancelling(false);setCancelReason('');}}
 async function expireCheckout(){const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/checkout/expire?studio=${studio.id}`,'POST',{}));if(result?.invoice){onChanged(result.invoice);setExpiring(false);}}
 async function startCheckout(){setCheckoutError('');setCheckoutBusy(true);try{const result=await request(`/api/projects/${p.id}/invoices/${invoice.id}/checkout?studio=${studio.id}`,'POST',{});const destination=new URL(result.url);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error('Stripe did not return a secure Checkout link.');window.location.assign(destination.toString());}catch(error){setCheckoutError(error.message||'Checkout could not be opened.');setCheckoutBusy(false);}}
 return <article className="billing-document" aria-label={`Invoice ${invoice.number}`}>
  <header className="billing-document-head"><div><span className="billing-document-label">INVOICE {invoice.number}</span><h3>{invoice.kind==='Deposit'?'Deposit invoice':invoice.kind==='Balance'?'Balance invoice':'Project invoice'}</h3><p>From {snapshot.sellerName||studio.name} to {snapshot.billToName||p.brief.name}</p></div><div className="billing-document-head-right"><Status invoice={invoice}/>{owner&&invoice.status!=='Cancelled'&&<><button className="billing-text-button billing-share" onClick={async()=>{try{const url=new URL('/',window.location.origin);url.search=new URLSearchParams({view:'projects',project:p.id,tab:'Billing',invoice:invoice.id}).toString();await navigator.clipboard.writeText(url.toString());setLinkCopied(true);setLinkError('');}catch{setLinkCopied(false);setLinkError('Could not copy the link. Check browser clipboard permission.');}}}><Copy size={15}/>{linkCopied?'Invoice link copied':'Copy invoice link'}</button><small>Client needs portal access. No message is sent.</small>{linkError&&<small className="billing-copy-error" role="alert">{linkError}</small>}</>}<button className="billing-text-button billing-print" onClick={()=>printAgreement(invoiceDocument)}><Download size={15}/> Print / save PDF</button></div></header>
  <div className="doc-actions"><button className="doc-quiet" aria-pressed={!documentView} onClick={()=>setDocumentView(false)}>Account details</button><button className="doc-quiet" aria-pressed={documentView} onClick={()=>setDocumentView(true)}>Issued document</button></div>
  {documentView&&<AgreementPages agreement={invoiceDocument} hideControls/>}
  {!documentView&&<><div className="billing-document-parties"><div><span>FROM</span><strong>{snapshot.sellerName||studio.name}</strong><p>{snapshot.sellerAddress||'—'}</p>{snapshot.sellerContact&&<small>{snapshot.sellerContact}</small>}{snapshot.taxRegistration&&<small>Tax registration: {snapshot.taxRegistration}</small>}</div><div><span>BILL TO</span><strong>{snapshot.billToName||p.brief.name}</strong><p>{snapshot.customerAddress||'—'}</p>{snapshot.billToEmail&&<small>{snapshot.billToEmail}</small>}</div></div>
  <div className="billing-document-grid"><div><span>ISSUED</span><strong>{date(invoice.issuedAt)}</strong></div><div><span>DUE</span><strong>{date(invoice.dueDate)}</strong></div><div><span>SERVICE / SUPPLY DATE</span><strong>{date(snapshot.supplyDate)}</strong></div><div><span>BASED ON</span><strong>Estimate version {invoice.estimateVersion}</strong></div></div>
  <div className="billing-line"><div><strong>{invoice.kind==='Deposit'?'Deposit towards project scope':invoice.kind==='Balance'?'Remaining project balance':'Agreed project scope'}</strong><small>{snapshot.projectTitle||p.title}</small></div><strong>{money(invoice.amountMinor,invoice.currency)}</strong></div>
  <dl className="billing-totals"><div><dt>Amount before tax</dt><dd>{money(invoice.netMinor,invoice.currency)}</dd></div><div><dt>Tax ({invoice.taxRate||0}%)</dt><dd>{money(invoice.taxMinor,invoice.currency)}</dd></div><div><dt>Invoice amount</dt><dd>{money(invoice.amountMinor,invoice.currency)}</dd></div>{(invoice.paidMinor||0)>0&&<div><dt>Payments recorded</dt><dd>− {money(invoice.paidMinor,invoice.currency)}</dd></div>}<div className="billing-balance"><dt>Amount remaining</dt><dd>{money(balance,invoice.currency)}</dd></div></dl>
  {invoice.note&&<section className="billing-note"><h4>About this invoice</h4><p>{invoice.note}</p></section>}
  {invoice.status!=='Cancelled'&&<section className="billing-instructions"><div><h4>Payment instructions</h4><p>{invoice.paymentInstructions||'Ask the studio for payment instructions.'}</p></div>{invoice.paymentInstructions&&<button className="billing-copy" onClick={async()=>{try{await navigator.clipboard.writeText(invoice.paymentInstructions);setCopy(true);setTimeout(()=>setCopy(false),2500);}catch{setCopy(false);}}}><Copy size={14}/>{copy?'Copied':'Copy'}</button>}</section>}
  </>}
  {!owner&&invoice.status!=='Cancelled'&&<p className="billing-clarifier">{stripeReady?'You can pay the balance through Stripe or use the studio’s instructions above.':'Pay using the studio’s instructions above.'} Payments made outside Caleane are recorded by the studio after it checks receipt.</p>}
  {checkoutReturn==='return'&&<p className={`billing-checkout-return${stripePaid?' is-confirmed':''}`} role="status">{stripePaid?'Stripe has confirmed this payment. The invoice record is up to date.':'You have returned from Stripe. We will show the payment here once Stripe confirms it. Please do not pay again while confirmation is pending.'}</p>}
  {checkoutReturn==='cancelled'&&<p className="billing-checkout-return" role="status">You left Stripe Checkout without completing payment. The invoice remains open.</p>}
  {checkoutStatus==='processing'&&<p className="billing-checkout-return" role="status">Stripe is still processing this payment. The invoice will update after confirmation.</p>}
  {checkoutStatus==='open'&&<p className="billing-checkout-return" role="status">A Stripe Checkout session is open for this invoice. You can return to it below.</p>}
  {(invoice.payments||[]).length>0&&<section className="billing-payment-history"><h4>Payment record</h4>{invoice.payments.map(payment=><div key={payment.id}><div><strong>{money(payment.amountMinor,invoice.currency)}</strong><small>{paymentName[payment.method]||'External payment'} · {payment.source==='stripe_verified'?'Verified by Stripe':'Recorded by the studio'}{payment.reference?` · ${payment.reference}`:''}</small></div><span>{date(payment.receivedAt)}</span></div>)}<p>Stripe payments are confirmed from signed provider notices. Other payments are entered by the studio after checking receipt.</p></section>}
  {invoice.status==='Cancelled'&&<p className="billing-cancelled">This invoice was cancelled{invoice.cancelledAt?` on ${date(invoice.cancelledAt)}`:''}. No payment is due against it.{invoice.cancelReason&&<> Reason: {invoice.cancelReason}</>}</p>}
  {(canCheckout||canRecord||canCancel||canExpire)&&!recording&&!cancelling&&!expiring&&<div className="billing-owner-actions">{canCheckout&&<button className="billing-primary" disabled={checkoutBusy||busy} onClick={startCheckout}>{checkoutBusy?'Opening Stripe…':checkoutStatus==='open'?'Return to Stripe Checkout':'Pay securely with Stripe'} </button>}{canRecord&&<button className={canCheckout?'billing-outline':'billing-primary'} onClick={()=>setRecording(true)}>Record a payment <Plus size={16}/></button>}{canExpire&&<button className="billing-text-button" disabled={busy} onClick={()=>setExpiring(true)}>Close open Checkout session</button>}{canCancel&&<button className="billing-text-button" onClick={()=>setCancelling(true)}>Cancel invoice</button>}</div>}
  {checkoutError&&<p className="billing-error" role="alert">{checkoutError}</p>}
  {expiring&&<div className="billing-expire-confirm"><h4>Close this Stripe Checkout session?</h4><p>The open payment link will stop working. This does not refund a payment or change the invoice balance. Check with your client first if they may be paying now.</p><div><button className="billing-outline" type="button" disabled={busy} onClick={()=>setExpiring(false)}>Keep session</button><button className="billing-primary" type="button" disabled={busy} onClick={expireCheckout}>Close session</button></div></div>}
  {recording&&<PaymentForm key={invoice.id} invoice={invoice} p={p} studio={studio} request={request} run={run} busy={busy} onCancel={()=>setRecording(false)} onSaved={updated=>{onChanged(updated);setRecording(false);}}/>}
  {cancelling&&<form className="billing-cancel-form" onSubmit={cancelInvoice}><h4>Cancel this invoice?</h4><p>The original record remains visible. Any recorded payments also remain on its history.</p><label><span>Reason for cancellation</span><textarea required rows="2" maxLength="500" value={cancelReason} onChange={event=>setCancelReason(event.target.value)}/></label><div><button className="billing-outline" type="button" onClick={()=>setCancelling(false)}>Keep invoice</button><button className="billing-danger" disabled={busy}>Cancel invoice</button></div></form>}
 </article>;
}

export function Billing({p,studio,owner,request,run,mutate,busy,onNavigate,onInvoiceChange}){
 const [invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[selectedId,setSelectedId]=useState(()=>new URLSearchParams(window.location.search).get('invoice')||''),[issuing,setIssuing]=useState(false),[stripeStatus,setStripeStatus]=useState(null),[checkoutReturn,setCheckoutReturn]=useState(()=>new URLSearchParams(window.location.search).get('checkout')||'');
 const canView=owner||p.accessRole==='Approver';
 useEffect(()=>{let active=true;setLoadError('');setInvoices([]);if(!canView){setLoading(false);return()=>{active=false};}setLoading(true);request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{if(active){setInvoices(data.invoices||[]);setLoading(false);}}).catch(error=>{if(active){setLoadError(error.message);setLoading(false);}});return()=>{active=false};},[p.id,studio.id,request,canView]);
 useEffect(()=>{let active=true;setStripeStatus(null);if(canView)request(`/api/studios/${studio.id}/stripe-status?studio=${studio.id}`).then(data=>{if(active)setStripeStatus(data.stripe||null);}).catch(()=>{if(active)setStripeStatus({configured:false,connected:false,chargesEnabled:false});});return()=>{active=false};},[studio.id,request,canView]);
 const sorted=useMemo(()=>[...invoices].sort((a,b)=>String(b.issuedAt).localeCompare(String(a.issuedAt))),[invoices]);
 const selected=sorted.find(item=>item.id===selectedId)||sorted[0];
 const stripeReady=Boolean(stripeStatus?.connected&&stripeStatus?.chargesEnabled);
 const waitingForCheckout=checkoutReturn==='return'&&selected&&!(selected.status==='Paid'&&selected.payments?.some(payment=>payment.source==='stripe_verified'));
 useEffect(()=>{if(!waitingForCheckout)return;let active=true,checks=0;const timer=setInterval(()=>{if(++checks>15){clearInterval(timer);return;}request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{if(active)setInvoices(data.invoices||[]);}).catch(()=>{});},4000);return()=>{active=false;clearInterval(timer);};},[waitingForCheckout,p.id,studio.id,request]);
 function selectInvoice(id){setSelectedId(id);setCheckoutReturn('');const query=new URLSearchParams(window.location.search);query.set('invoice',id);query.delete('checkout');query.delete('session_id');history.replaceState(null,'','/?'+query);}
 function replaceInvoice(invoice){setInvoices(previous=>{const exists=previous.some(item=>item.id===invoice.id);return exists?previous.map(item=>item.id===invoice.id?invoice:item):[invoice,...previous]});selectInvoice(invoice.id);onInvoiceChange?.(invoice);}
 if(!canView)return <div className="billing-restricted"><FileText size={26}/><h2>Invoice access is limited.</h2><p>The studio owner and project approver can view invoices and payment records. Ask your studio if you need a copy.</p></div>;
 return <div className="billing-layout"><div className="billing-main"><div className="billing-intro"><div><p className="billing-kicker">THE COMMERCIAL RECORD</p><h2>Invoices & payments.</h2><p>Every invoice and payment recorded for this project, in one place.</p></div>{owner&&!issuing&&<button className="billing-outline" onClick={()=>setIssuing(true)}><Plus size={16}/> Issue invoice</button>}</div>
 {issuing&&owner&&<IssueForm key={p.id} p={p} invoices={invoices} mutate={mutate} busy={busy} onCancel={()=>setIssuing(false)} onIssued={invoice=>{replaceInvoice(invoice);setIssuing(false);}}/>}
 {loadError&&<div className="billing-error billing-load-error" role="alert">Invoices could not be loaded: {loadError} <button onClick={()=>{setLoading(true);setLoadError('');request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{setInvoices(data.invoices||[]);setLoading(false);}).catch(error=>{setLoadError(error.message);setLoading(false);});}}>Try again</button></div>}
 {loading?<p className="billing-loading" role="status">Loading invoices…</p>:!loadError&&(!sorted.length?<div className="billing-empty"><FileText size={27}/><h3>{owner?'Nothing has been invoiced yet.':'No invoices have been shared yet.'}</h3><p>{owner?'Start with a budget-confirmed estimate, then issue a deposit or full invoice when the scope is ready.':'Your studio will share an invoice here when payment is due.'}</p>{owner&&<button className="billing-text-button" onClick={()=>onNavigate?.('Estimate')}>Go to the estimate </button>}</div>:<><InvoiceList invoices={sorted} selected={selected?.id} onSelect={selectInvoice}/><InvoiceDetail key={selected.id} invoice={selected} p={p} studio={studio} owner={owner} request={request} run={run} busy={busy} onChanged={replaceInvoice} stripeReady={stripeReady} checkoutReturn={checkoutReturn}/></>)}
 </div><aside className="billing-aside"><section><p className="billing-kicker">PAYMENT AT A GLANCE</p>{sorted.length?<><div className="billing-aside-number"><strong>{sorted.filter(isOpen).length}</strong><span>open invoice{sorted.filter(isOpen).length===1?'':'s'}</span></div><p>Open invoices are requests for payment. They are not proof that a date has been booked.</p></>:<p>When an invoice is issued, its due date and payment details appear here for the client.</p>}</section><section><p className="billing-kicker">KEEP IT CLEAR</p><h3>Budget, invoice, payment.</h3><p>An accepted estimate agrees budget direction. An invoice requests payment. {stripeReady?'Stripe payments are verified automatically; the studio records payments made elsewhere after checking receipt.':'The studio records payments after checking receipt outside Caleane.'}</p></section>{owner&&<section><p className="billing-kicker">THIS PROJECT</p><dl><div><dt>Client</dt><dd>{p.brief.name}</dd></div><div><dt>Project</dt><dd>{p.title}</dd></div><div><dt>Confirmed estimates</dt><dd>{(p.estimates||[]).filter(item=>item.status==='Budget confirmed').length}</dd></div></dl></section>}</aside></div>;
}

export function StudioBilling({projects,studio,request,run,openProject}){
 const [invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('All'),[query,setQuery]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');request(`/api/invoices?studio=${studio.id}`).then(data=>{if(active){setInvoices(data.invoices||[]);setLoading(false);}}).catch(err=>{if(active){setError(err.message);setLoading(false);}});return()=>{active=false};},[studio.id,request]);
 const byId=useMemo(()=>new Map(projects.map(project=>[project.id,project])),[projects]);
 const open=invoices.filter(isOpen),paid=invoices.filter(item=>item.status==='Paid');
 const outstanding=Object.entries(open.reduce((sums,item)=>({...sums,[item.currency]:(sums[item.currency]||0)+Math.max(0,item.amountMinor-(item.paidMinor||0))}),{}));
 const visible=invoices.filter(item=>{const project=byId.get(item.projectId);const matches=filter==='All'||(filter==='Awaiting payment'?isOpen(item):item.status===filter);return matches&&`${item.number} ${project?.title||''} ${project?.brief?.name||''}`.toLowerCase().includes(query.toLowerCase())}).sort((a,b)=>String(b.issuedAt).localeCompare(String(a.issuedAt)));
 return <div className="studio-billing"><header className="studio-billing-head workspace-page-heading"><div><p className="billing-kicker">STUDIO / FINANCES</p><h1>Money in motion.</h1><p>Invoices issued, payments recorded and balances still to collect.</p></div></header>
 <div className="studio-billing-overview"><div><span>Awaiting payment</span><strong>{open.length}</strong><small>Open invoices</small></div><div><span>Paid</span><strong>{paid.length}</strong><small>Verified or studio-recorded payments</small></div><div className="studio-billing-outstanding"><span>Outstanding by currency</span>{outstanding.length?outstanding.map(([currency,total])=><strong key={currency}>{money(total,currency)}</strong>):<strong>—</strong>}<small>Across open invoices</small></div></div>
 <div className="studio-billing-ledger-head"><div><h2>Invoice ledger</h2><p>Select an invoice to open its project record.</p></div></div>
 <div className="studio-collection-controls"><div className="studio-billing-filters" role="group" aria-label="Filter invoices">{['All','Awaiting payment','Paid','Cancelled'].map(option=><button key={option} aria-pressed={filter===option} onClick={()=>setFilter(option)}>{option}</button>)}</div><CollectionFilter label="Filter invoices" value={query} onChange={setQuery} placeholder="Invoice, project or client…"/></div>
 {loading?<p className="billing-loading" role="status">Loading invoice ledger…</p>:error?<p className="billing-error" role="alert">Invoice ledger could not be loaded: {error}</p>:visible.length?<div className="studio-billing-ledger"><div className="studio-billing-ledger-labels"><span>INVOICE</span><span>PROJECT / CLIENT</span><span>DUE</span><span>AMOUNT</span><span>STATUS</span></div>{visible.map(item=>{const project=byId.get(item.projectId);return <button key={item.id} onClick={()=>project&&openProject(project,'Billing',item.id)} disabled={!project}><span><strong>{item.number}</strong><small>{item.kind} · {date(item.issuedAt)}</small></span><span><strong>{project?.title||'Project unavailable'}</strong><small>{project?.brief?.name||''}</small></span><span>{date(item.dueDate)}</span><span className="studio-billing-amount">{money(item.amountMinor,item.currency)}</span><Status invoice={item}/></button>})}</div>:<div className="billing-empty"><FileText size={26}/><h3>{invoices.length?'No invoices match.':'No invoices have been issued.'}</h3><p>{invoices.length?'Try another status or search term.':'Issue the first invoice from a project with a budget-confirmed estimate.'}</p></div>}
 <p className="studio-billing-footnote">Stripe Checkout payments are verified from signed provider notices. Bank transfers and other external payments are recorded by the studio after it checks receipt.</p></div>;
}
