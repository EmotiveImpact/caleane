import {CollectionFilter} from './CollectionFilter';
import {InvoicePreview,printInvoice} from './InvoiceDocument';
import {invoicePageHtml} from '../lib/invoice-design';
import {carriedDiscount,discountFor,invoiceFigures,lateFeeFits,lateFeeShort,lateFeeTerms,tipFor,tipPercents} from '../lib/invoice-charges';
import {WorkspaceSwitch} from './workspace/WorkspaceUI';
import React,{useEffect,useMemo,useState} from 'react';
import {Check,Copy,Download,FileText,Plus,Printer,Trash2} from 'lucide-react';
import '../folio-billing.css';
import '../studio-commerce.css';
import {PaymentPlan} from './PaymentPlan';
import {PriceListPicker} from './Estimates';
import {OpenedNote,useRecordOpen} from './OpenedNote';
import {ProjectProfit,StudioCosts,StudioReports} from './FinanceViews';
import {todayISO,daysFromToday} from '../lib/dates';
import {defaultTaxRate,isVatDocument,isVatRegistered,showsTax,taxLabel,taxNumberLabel} from '../lib/vat';
import {CURRENCIES} from '../lib/currencies.js';
import {perUnit} from '../lib/price-units.js';

const money=(minor,currency='GBP')=>{
 try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}
 catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}
};
const date=value=>value?new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const today=()=>todayISO();
const dueDefault=()=>daysFromToday(14);
const minorFromInput=value=>Math.round(Number(value)*100);
const isOpen=invoice=>invoice.status==='Issued'||invoice.status==='Partially paid';
export const invoiceBalance=invoice=>invoice.balanceMinor??Math.max(0,invoice.amountMinor-(invoice.paidMinor||0));
const invoiceTitle=invoice=>invoice.label?`${invoice.label} invoice`:invoice.kind==='Deposit'?'Deposit invoice':invoice.kind==='Balance'?'Balance invoice':'Project invoice';
const statusText=invoice=>invoice.status==='Paid'?'Paid':invoice.status==='Partially paid'?'Partially paid':invoice.status;
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const isOverdue=(invoice,day=localToday())=>isOpen(invoice)&&!!invoice.dueDate&&invoice.dueDate<day;
// Paid in full, including an invoice that was paid and later partly refunded or reduced by a credit note.
const isSettled=invoice=>invoice.status==='Paid'||invoice.status==='Partly refunded';
// Totals per currency: invoiced net of credit notes and cancellations, paid net of refunds, and still to collect.
// A currency whose invoices were all cancelled has nothing to report, so it gets no row.
export function ledgerTotals(invoices){
 const sums={};for(const item of invoices){const row=sums[item.currency]||(sums[item.currency]={invoiced:0,paid:0,outstanding:0});if(item.status!=='Cancelled')row.invoiced+=item.dueMinor??item.amountMinor;row.paid+=item.paidMinor||0;if(isOpen(item))row.outstanding+=invoiceBalance(item);}
 return Object.entries(sums).filter(([,row])=>row.invoiced||row.paid||row.outstanding).map(([currency,row])=>({currency,...row}));
}
// Spreadsheet-safe cell: quote everything and neutralise leading formula characters (see forms.mjs).
const csvCell=value=>'"'+String(value??'').replace(/^[\s]*[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
const decimal=minor=>((Number(minor)||0)/100).toFixed(2);
export function invoiceLedgerCSV(invoices,byId){
 const rows=[['Invoice','Type','Project','Client','Issued','Due','Status','Overdue','Currency','Invoiced','Paid','Outstanding']];
 for(const item of invoices){const project=byId.get(item.projectId);rows.push([item.number,item.label||item.kind,project?.title||'',project?.brief?.name||'',String(item.issuedAt||'').slice(0,10),item.dueDate||'',item.status,isOverdue(item)?'Yes':'No',item.currency,decimal(item.status==='Cancelled'?0:item.dueMinor??item.amountMinor),decimal(item.paidMinor),decimal(isOpen(item)?invoiceBalance(item):0)]);}
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
const paymentName={bank_transfer:'Bank transfer',paypal_external:'PayPal outside Caleane',stripe_external:'Stripe',other_external:'Other external payment'};
// How a client says they paid, and the closest way for the studio to record it.
const paidHow={bank_transfer:'bank transfer',paypal_external:'PayPal',card_external:'card',other_external:'another way'},recordAs={bank_transfer:'bank_transfer',paypal_external:'paypal_external',card_external:'other_external',other_external:'other_external'};

function Status({invoice}){return <span className={`billing-status billing-status-${invoice.status.toLowerCase().replaceAll(' ','-')}`}>{statusText(invoice)}</span>}

function InvoiceList({invoices,selected,onSelect}){
 return <div className="billing-invoice-list" role="group" aria-label="Project invoices">{invoices.map(invoice=><button key={invoice.id} className={selected===invoice.id?'selected':''} onClick={()=>onSelect(invoice.id)} aria-pressed={selected===invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.label||invoice.kind} · Issued {date(invoice.issuedAt)}</small></span><span className="billing-list-end"><strong>{money(invoice.amountMinor,invoice.currency)}</strong><Status invoice={invoice}/></span></button>)}</div>;
}

// A boxed part of the issue form: a heading and a short hint above its fields.
function IssueSection({title,hint,children}){
 return <section className="billing-issue-section"><header><h4>{title}</h4>{hint&&<p>{hint}</p>}</header>{children}</section>;
}

// What the invoice will say, updated as the studio fills in the form.
function IssueSummary({figures,currency,taxRate,vat,discount,lateFee,tips,waiting}){
 const row=(label,value,className)=><div className={className}><dt>{label}</dt><dd>{value}</dd></div>;
 return <aside className="billing-issue-summary" aria-label="Invoice summary" aria-live="polite">
  <h4>Summary</h4>
  {waiting?<p className="billing-issue-summary-empty">{typeof waiting==='string'?waiting:'Enter the deposit amount to see the figures.'}</p>:<>
  <dl>
   {row('Price before tax',money(figures.priceNetMinor,currency))}
   {discount&&row(discount.label,`− ${money(figures.discountNetMinor,currency)}`,'is-discount')}
   {row('Amount before tax',money(figures.netMinor,currency))}
   {showsTax(taxRate,figures.taxMinor)&&row(taxLabel(taxRate,vat),money(figures.taxMinor,currency))}
   {row('Invoice amount',money(figures.amountMinor,currency),'is-amount')}
  </dl>
  {(lateFee||tips)&&<dl className="billing-issue-summary-extras">
   {lateFee&&row('Late fee terms',lateFeeShort(lateFee,currency))}
   {tips&&row('Tips','The client can add one before paying')}
  </dl>}
  <div className="billing-issue-summary-total"><span>Client pays</span><strong>{money(figures.amountMinor,currency)}</strong></div>
  {(lateFee||tips)&&<p className="billing-issue-summary-note">{[tips&&'Plus any tip they choose.',lateFee&&'A late fee is added only if the invoice is still unpaid after the grace period.'].filter(Boolean).join(' ')}</p>}
  </>}
 </aside>;
}

function IssueForm({p,invoices,mutate,busy,onIssued,onCancel}){
 const latestEstimate=p.estimates?.at(-1);
 const confirmed=latestEstimate?.status==='Budget confirmed'&&latestEstimate.briefRevision===p.briefRevision?[latestEstimate]:[];
 const estimateId=confirmed.at(-1)?.id||'';
 const estimate=confirmed.find(item=>item.id===estimateId);
 // A discounted invoice still uses up its full share of the estimate. Quick invoices are not part of it.
 const active=invoices.filter(item=>item.status!=='Cancelled'&&item.estimateId),alreadyInvoiced=active.reduce((total,item)=>total+(item.shareMinor??item.amountMinor),0);
 const remaining=Math.max(0,(estimate?.total||0)-alreadyInvoiced);
 const hasPrior=alreadyInvoiced>0;
 const hasOlderInvoice=active.some(item=>item.estimateId!==estimateId);
 // Without a confirmed estimate to bill from, the form starts on a quick invoice with lines of its own.
 const estimateReady=confirmed.length>0&&!hasOlderInvoice&&remaining>0;
 const [basis,setBasis]=useState(estimateReady?'estimate':'quick'),quick=basis==='quick';
 const [kind,setKind]=useState(hasPrior?'Balance':'Deposit');
 const [amount,setAmount]=useState('');
 const [quickLabel,setQuickLabel]=useState(''),[quickKind,setQuickKind]=useState('Full'),[quickLines,setQuickLines]=useState([{title:'',quantity:1,amount:''}]),[quickCurrency,setQuickCurrency]=useState(''),[quickTax,setQuickTax]=useState('');
 // A percentage off an earlier invoice for this estimate starts this one too.
 const carried=useMemo(()=>carriedDiscount(active),[invoices]);
 const startCarried=!!carried&&estimateReady;
 const [discountType,setDiscountType]=useState(startCarried?'percent':'none'),[discountValue,setDiscountValue]=useState(startCarried?carried.percent:''),[discountReason,setDiscountReason]=useState(startCarried?carried.reason:'');
 const [lateFeeOn,setLateFeeOn]=useState(true),[tipsOn,setTipsOn]=useState(true);
 const [formError,setFormError]=useState(''),[saved,setSaved]=useState(null);
 useEffect(()=>{setKind(hasPrior?'Balance':'Deposit');setAmount('');setFormError('');},[estimateId,hasPrior]);
 // Saved studio details from Settings, Invoices & payment plans fill in the invoice.
 useEffect(()=>{let active=true;fetch(`/api/billing-defaults?studio=${p.studioId}`,{credentials:'same-origin'}).then(r=>r.ok?r.json():{defaults:{}}).then(d=>{if(active)setSaved(d.defaults||{});}).catch(()=>{if(active)setSaved({});});return()=>{active=false;};},[p.studioId]);
 const lastAddress=invoices.find(item=>item.snapshot?.customerAddress)?.snapshot.customerAddress||'';
 if(!saved)return <p className="billing-loading" role="status">Preparing the invoice…</p>;
 const dueFromTerms=Number.isInteger(saved.paymentTermsDays)?daysFromToday(saved.paymentTermsDays):dueDefault();
 const quickRate=quickTax===''?Number(latestEstimate?.taxRate??defaultTaxRate(saved))||0:Number(quickTax)||0;
 const quickItems=quickLines.map(line=>({title:line.title.trim(),quantity:Number(line.quantity),unitAmount:minorFromInput(line.amount),...(line.unit?{unit:line.unit}:{})}));
 const quickNet=quickItems.reduce((total,item)=>total+(Number.isInteger(item.quantity)&&item.quantity>0&&Number.isSafeInteger(item.unitAmount)&&item.unitAmount>0?item.quantity*item.unitAmount:0),0);
 const shareMinor=quick?quickNet+Math.round(quickNet*quickRate/100):kind==='Deposit'?minorFromInput(amount)||0:remaining;
 const shareNetMinor=quick?quickNet:!estimate?0:kind==='Full'?estimate.subtotal:kind==='Balance'?estimate.subtotal-active.reduce((total,item)=>total+(item.netMinor||0)+(item.discountNetMinor||0),0):Math.round(estimate.subtotal*shareMinor/(estimate.total||1));
 const discountInput=discountType==='percent'?{type:'percent',percent:Number(discountValue),reason:discountReason}:discountType==='amount'?{type:'amount',amountMinor:minorFromInput(discountValue),reason:discountReason}:null;
 let discount=null,discountError='';
 if(discountInput&&discountValue!==''&&shareMinor>0){try{discount=discountFor(discountInput,{shareMinor,shareNetMinor});}catch(error){discountError=error.message;}}
 const issueKind=quick?quickKind:kind;
 const lateFeeRule=saved.lateFee?.enabled?saved.lateFee:null,tipsAvailable=!!saved.tips?.enabled&&issueKind!=='Deposit';
 const currency=quick?quickCurrency||latestEstimate?.currency||saved.currency||'GBP':estimate?.currency||'GBP',figures=invoiceFigures({shareMinor,shareNetMinor,discount}),feeFits=lateFeeFits(lateFeeRule,currency);
 const setLine=(index,key,value)=>setQuickLines(lines=>lines.map((line,i)=>i===index?{...line,[key]:value}:line));
 return <form className="billing-issue-form" onSubmit={async event=>{
  event.preventDefault();setFormError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const amountMinor=minorFromInput(data.amount);
  const details={dueDate:data.dueDate,note:data.note,paymentInstructions:data.paymentInstructions,sellerAddress:data.sellerAddress,sellerContact:data.sellerContact,customerAddress:data.customerAddress,supplyDate:data.supplyDate,taxRegistration:data.taxRegistration};
  let body;
  if(quick){
   if(!quickLabel.trim()){setFormError('Say what this invoice is for.');return;}
   if(quickItems.some(item=>!item.title||!Number.isInteger(item.quantity)||item.quantity<1||!Number.isSafeInteger(item.unitAmount)||item.unitAmount<0)){setFormError('Give each line a description, a whole-number quantity and a price.');return;}
   if(quickNet<=0){setFormError('Add an amount above zero.');return;}
   body={quick:true,kind:quickKind,label:quickLabel.trim(),currency,taxRate:quickRate,items:quickItems,...details};
  }else{
   if(kind==='Deposit'&&(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>=remaining)){setFormError('Enter a deposit above zero and below the remaining estimate total.');return;}
   body={estimateId,kind,...details};
   if(kind==='Deposit')body.amountMinor=amountMinor;
  }
  if(discountInput){if(discountValue===''||discountError||!discount){setFormError(discountError||'Enter the discount, or choose no discount.');return;}body.discount=discountInput;}
  if(lateFeeRule&&feeFits)body.lateFee=lateFeeOn;
  if(tipsAvailable)body.tips=tipsOn;
  const result=await mutate('invoices',body);
  if(result?.invoice)onIssued(result.invoice);
 }}>
  <div className="billing-form-heading"><div><h3>Issue an invoice</h3><p>This appears in the client’s private project. No email or payment request is sent elsewhere.</p></div><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
  <div className="billing-issue-shell"><div className="billing-issue-layout"><div className="billing-issue-main">
   <IssueSection title="Invoice" hint={quick?'List what you are billing for. It is kept apart from the estimate, so the deposit and balance still add up to the agreed total.':'Choose what this invoice asks for from the confirmed estimate.'}>
    <div className="billing-form-grid billing-issue-choose"><label><span>Bill for</span><select value={basis} onChange={event=>{const next=event.target.value;setBasis(next);setFormError('');if(carried){const keep=next==='estimate'&&discountType==='none';setDiscountType(keep?'percent':'none');setDiscountValue(keep?carried.percent:'');setDiscountReason(keep?carried.reason:'');}}}><option value="estimate" disabled={!estimateReady}>The confirmed estimate</option><option value="quick">Something else, such as extra hours</option></select></label>
    {quick?<label><span>This is</span><select value={quickKind} onChange={event=>setQuickKind(event.target.value)}><option value="Full">A charge of its own</option><option value="Deposit">A deposit</option></select></label>
    :<label><span>Invoice type</span><select name="kind" value={kind} onChange={event=>setKind(event.target.value)}>{!hasPrior&&<><option value="Deposit">Deposit</option><option value="Full">Full amount</option></>}{hasPrior&&remaining>0&&<><option value="Balance">Remaining balance</option><option value="Deposit">Further deposit</option></>}</select></label>}</div>
    {quick&&!estimateReady&&<p className="billing-extras-note">{!confirmed.length?'There’s no confirmed estimate yet, so this invoice lists its own lines.':hasOlderInvoice?'Active invoices refer to an earlier estimate version. Settle or cancel those before invoicing the new estimate.':'The confirmed estimate is fully invoiced.'}</p>}
    {quick?<>
     <label><span>What it’s for</span><input maxLength="60" required value={quickLabel} onChange={event=>setQuickLabel(event.target.value)} placeholder="For example, extra styling hours or a rush fee"/></label>
     <div className="billing-quick-lines">{quickLines.map((line,i)=><div className="billing-quick-line" key={i}><label><span>Line {i+1}</span><input required maxLength="200" value={line.title} onChange={event=>setLine(i,'title',event.target.value)}/></label><label><span>Quantity</span><input type="number" min="1" max="10000" step="1" required value={line.quantity} onChange={event=>setLine(i,'quantity',event.target.value)}/></label><label><span>Unit price{perUnit(line.unit)?` ${perUnit(line.unit)}`:''} ({currency})</span><input type="number" min="0" step="0.01" required value={line.amount} onChange={event=>setLine(i,'amount',event.target.value)} placeholder="0.00"/></label><button type="button" className="billing-text-button" disabled={quickLines.length===1} aria-label={`Remove line ${i+1}`} onClick={()=>setQuickLines(lines=>lines.filter((_,index)=>index!==i))}><Trash2 size={15}/></button></div>)}</div>
     <PriceListPicker studio={{id:p.studioId}} currency={currency} onPick={item=>setQuickLines(lines=>{const line={title:item.name,quantity:1,amount:(item.unitAmount/100).toFixed(2),...(perUnit(item.unit)?{unit:item.unit}:{})};const blank=lines.length===1&&!lines[0].title&&!lines[0].amount;return blank?[line]:lines.length>=20?lines:[...lines,line];})}/>
     <button type="button" className="billing-text-button" disabled={quickLines.length>=20} onClick={()=>setQuickLines(lines=>[...lines,{title:'',quantity:1,amount:''}])}><Plus size={15}/> Add a line</button>
     <div className="billing-form-grid"><label><span>Currency</span><select value={currency} onChange={event=>setQuickCurrency(event.target.value)}>{CURRENCIES.map(code=><option key={code}>{code}</option>)}</select></label>{(isVatRegistered(saved)||quickRate>0)&&<label><span>{isVatRegistered(saved)?'VAT rate (%)':'Tax rate (%)'}</span><input type="number" min="0" max="100" step="0.01" value={quickTax===''?String(quickRate):quickTax} onChange={event=>setQuickTax(event.target.value)}/></label>}</div>
    </>:<>
     {estimate&&<div className="billing-scope-line"><span>{estimate.title} <strong>version {estimate.version}</strong></span><span>Estimate total <strong>{money(estimate.total,estimate.currency)}</strong></span><span>Available to invoice <strong>{money(remaining,estimate.currency)}</strong></span></div>}
     {kind==='Deposit'&&<label className="billing-amount-field"><span>Deposit amount ({currency})</span><input name="amount" type="number" min="0.01" max={Math.max(0,(remaining-1)/100).toFixed(2)} step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required placeholder="0.00"/></label>}
    </>}
   </IssueSection>
   <IssueSection title="Discount" hint="Optional, and it only covers this invoice. It comes off the price before tax, so the tax goes down with it.">
    <div className="billing-discount-row"><label><span>Type</span><select value={discountType} onChange={event=>{setDiscountType(event.target.value);setDiscountValue('');}}><option value="none">No discount</option><option value="percent">Percentage</option><option value="amount">Fixed amount</option></select></label>
    {discountType!=='none'&&<><label><span>{discountType==='percent'?'Percentage off':`Amount off before tax (${currency})`}</span><input type="number" min="0.01" step="0.01" max={discountType==='percent'?'99.99':undefined} value={discountValue} onChange={event=>setDiscountValue(event.target.value)} placeholder={discountType==='percent'?'10':'0.00'}/></label>
    <label><span>Shown as (optional)</span><input maxLength="60" value={discountReason} onChange={event=>setDiscountReason(event.target.value)} placeholder="For example, returning client"/></label></>}</div>
    {discountType!=='none'&&discountError&&<p className="billing-extras-note is-error" role="alert">{discountError}</p>}
    {!quick&&carried&&discountType==='percent'&&Number(discountValue)===Number(carried.percent)?<p className="billing-extras-note">Carried over from {carried.number}, so the whole project gets {carried.percent}% off. Change or remove it if this invoice should be different.</p>
    :!quick&&kind==='Deposit'&&discount&&<p className="billing-extras-note">{discountType==='percent'?`This covers the deposit only. The balance invoice will start with the same ${Number(discountValue)}% off, which you can change then.`:'This covers the deposit only. Add a discount to the balance invoice too if the whole project should be cheaper.'}</p>}
   </IssueSection>
   {(lateFeeRule||tipsAvailable)&&<IssueSection title="Late fee and tip" hint="Both are shown to the client on the invoice. No message or email is sent when a fee is added.">
    {lateFeeRule&&(feeFits?<WorkspaceSwitch label="Include your late fee terms" description={lateFeeTerms(lateFeeRule,currency)} checked={lateFeeOn} onCheckedChange={setLateFeeOn}/>
    :<p className="billing-extras-note">Your late fee is a fixed {money(lateFeeRule.amountMinor,lateFeeRule.currency)}, so it isn’t added to a {currency} invoice. A percentage fee in Settings, Late fees and tips covers every currency.</p>)}
    {tipsAvailable&&<WorkspaceSwitch label="Let the client add a tip" description="They can choose a tip on this invoice before paying. Tips carry no tax." checked={tipsOn} onCheckedChange={setTipsOn}/>}
   </IssueSection>}
   <IssueSection title="Due date and note" hint="The note is shown to the client as the payment context.">
    <div className="billing-form-grid"><label><span>Due date</span><input name="dueDate" type="date" defaultValue={dueFromTerms} required/></label><label><span>Note or payment context (optional)</span><input name="note" maxLength="2000" placeholder="For example, first instalment"/></label></div>
   </IssueSection>
   <IssueSection title="Details shown on the invoice" hint="Saved with this issued version. Check them before sharing the invoice with your client.">
    <div className="billing-form-grid"><label><span>Studio address</span><textarea name="sellerAddress" rows="2" maxLength="500" required placeholder="Business address" defaultValue={saved.sellerAddress||''}/></label><label><span>Client billing address</span><textarea name="customerAddress" rows="2" maxLength="500" required placeholder="Client or company address" defaultValue={lastAddress}/></label><label><span>Studio contact</span><input name="sellerContact" maxLength="300" required placeholder="Email or phone number" defaultValue={saved.sellerContact||''}/></label><label><span>Service or supply date</span><input name="supplyDate" type="date" required defaultValue={p.brief?.date||''}/></label><label><span>{isVatRegistered(saved)?'VAT number':'Tax registration number (if applicable)'}</span><input name="taxRegistration" maxLength="100" placeholder="VAT or other tax number" defaultValue={saved.taxRegistration||''}/></label></div>
   </IssueSection>
   <IssueSection title="Payment instructions" hint="Bank transfer or other ways to pay. Shown separately from any Stripe Checkout option.">
    <label><span>Instructions for the client</span><textarea name="paymentInstructions" rows="3" maxLength="1000" required placeholder="Include the bank or external payment details and the reference the client should use." defaultValue={saved.paymentInstructions||''}/></label>
   </IssueSection>
  </div>
  <IssueSummary figures={figures} currency={currency} taxRate={quick?quickRate:estimate?.taxRate||0} vat={isVatRegistered(saved)} discount={discount} lateFee={lateFeeRule&&feeFits&&lateFeeOn?lateFeeRule:null} tips={tipsAvailable&&tipsOn} waiting={quick?(!(quickNet>0)&&'Add a line with a price to see the figures.'):kind==='Deposit'&&!(shareMinor>0)}/>
  </div></div>
  {formError&&<p className="billing-error" role="alert">{formError}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy||(!quick&&remaining<=0)}>Issue invoice </button><p>An invoice is a request for payment. Its status changes only when the studio records money received.</p></div>
 </form>;
}

// The client tells the studio they have paid outside Caleane. The studio records it once it arrives.
function PaidNoticeForm({invoice,request,run,studio,p,onSaved,onCancel,busy}){
 return <form className="billing-payment-form" onSubmit={async event=>{
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));
  const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/paid-notice?studio=${studio.id}`,'POST',{paidOn:data.paidOn,method:data.method,reference:data.reference}));
  if(result?.invoice)onSaved(result.invoice);
 }}>
  <div className="billing-form-heading"><div><h3>Tell the studio you’ve paid</h3><p>They’ll check it has arrived and record it. Nothing changes on the invoice until they do.</p></div><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
  <div className="billing-form-grid"><label><span>When did you pay?</span><input name="paidOn" type="date" defaultValue={today()} max={today()} required/></label><label><span>How did you pay?</span><select name="method" defaultValue="bank_transfer">{Object.entries(paidHow).map(([value,label])=><option key={value} value={value}>{label[0].toUpperCase()+label.slice(1)}</option>)}</select></label><label><span>Payment reference (optional)</span><input name="reference" maxLength="160" placeholder={`For example, ${invoice.number}`}/></label></div>
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy}>Tell the studio</button></div>
 </form>;
}

function PaymentForm({invoice,request,run,studio,p,onSaved,onCancel,busy}){
 const notice=invoice.paidNotice;
 const balance=invoiceBalance(invoice);
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
  <div className="billing-form-grid"><label><span>Amount received ({invoice.currency})</span><input name="amount" type="number" min="0.01" max={(balance/100).toFixed(2)} step="0.01" defaultValue={(balance/100).toFixed(2)} required/></label><label><span>Received on</span><input name="receivedAt" type="date" defaultValue={notice?.paidOn||today()} required/></label><label><span>Where it was received</span><select name="method" defaultValue={notice?recordAs[notice.method]:'bank_transfer'}><option value="bank_transfer">Bank transfer</option><option value="paypal_external">PayPal outside Caleane</option><option value="stripe_external">Stripe outside Caleane</option><option value="other_external">Other external payment</option></select></label><label><span>Transaction reference (optional)</span><input name="reference" maxLength="160" placeholder="From your bank or provider" defaultValue={notice?.reference||''}/></label></div>
  <label><span>Note for the payment record (optional)</span><textarea name="note" rows="2" maxLength="1000"/></label>
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy}>Record received payment <Check size={16}/></button><p>This is a studio-entered record, not a provider verification.</p></div>
 </form>;
}

function RefundForm({invoice,p,studio,request,run,busy,refundable,creditable,onSaved,onCancel}){
 const [error,setError]=useState(''),[withCredit,setWithCredit]=useState(creditable>0);
 return <form className="billing-refund-form" onSubmit={async event=>{
  event.preventDefault();setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget)),amountMinor=minorFromInput(data.amount),limit=withCredit?Math.min(refundable,creditable):refundable;
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>limit){setError(`Enter an amount above zero and no more than ${money(limit,invoice.currency)}.`);return;}
  if(withCredit&&!String(data.reason||'').trim()){setError('Add a short reason. It appears on the credit note.');return;}
  const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/refunds?studio=${studio.id}`,'POST',{amountMinor,method:data.method,refundedAt:data.refundedAt,reference:data.reference,note:data.note,reason:data.reason,creditNote:withCredit}));
  if(result?.invoice)onSaved(result.invoice);
 }}>
  <h4>Issue a refund</h4>
  <p>Record money you have sent back to the client. Send the refund through your bank or payment provider first. Caleane does not move money.</p>
  <div className="billing-form-grid"><label><span>Amount refunded ({invoice.currency})</span><input name="amount" type="number" min="0.01" step="0.01" max={(refundable/100).toFixed(2)} defaultValue={(Math.min(refundable,withCredit?creditable:refundable)/100).toFixed(2)} required/></label><label><span>Refunded on</span><input name="refundedAt" type="date" defaultValue={today()} max={today()} required/></label><label><span>Paid back by</span><select name="method"><option value="bank_transfer">Bank transfer</option><option value="paypal_external">PayPal outside Caleane</option><option value="stripe_external">Stripe outside Caleane</option><option value="other_external">Other</option></select></label><label><span>Transaction reference (optional)</span><input name="reference" maxLength="160"/></label></div>
  {creditable>0&&<label className="billing-refund-choice"><input type="checkbox" checked={withCredit} onChange={event=>setWithCredit(event.target.checked)}/><span><strong>Also reduce the invoice by this amount</strong><br/>Issues a numbered credit note, so the client no longer owes it. Leave this off if you are only returning an overpayment.</span></label>}
  {withCredit&&<label><span>Reason shown on the credit note</span><input name="reason" maxLength="1000" placeholder="For example, event cancelled or reduced scope"/></label>}
  <label><span>Private note (optional)</span><input name="note" maxLength="1000"/></label>
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy}>Record refund</button><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
 </form>;
}

function CreditNoteForm({invoice,p,studio,request,run,busy,creditable,onSaved,onCancel}){
 const [error,setError]=useState('');
 return <form className="billing-refund-form" onSubmit={async event=>{
  event.preventDefault();setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget)),amountMinor=minorFromInput(data.amount);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>creditable){setError(`Enter an amount above zero and no more than ${money(creditable,invoice.currency)}.`);return;}
  const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/credit-notes?studio=${studio.id}`,'POST',{amountMinor,reason:data.reason}));
  if(result?.invoice)onSaved(result.invoice);
 }}>
  <h4>Reduce this invoice with a credit note</h4>
  <p>Use this when the client should pay less, for example after a discount or removed item. The original invoice stays on record. If the client has already paid more than they now owe, the invoice shows a refund owed.</p>
  <div className="billing-form-grid"><label><span>Credit amount ({invoice.currency})</span><input name="amount" type="number" min="0.01" step="0.01" max={(creditable/100).toFixed(2)} required/></label><label><span>Reason shown on the credit note</span><input name="reason" maxLength="1000" required/></label></div>
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-form-foot"><button className="billing-primary" disabled={busy}>Issue credit note</button><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
 </form>;
}

function InvoiceDetail({invoice,design,brandKit,p,studio,owner,request,run,busy,onChanged,stripeReady,checkoutReturn,checkoutStalled,onCheckAgain}){
 const [recording,setRecording]=useState(false),[cancelling,setCancelling]=useState(false),[expiring,setExpiring]=useState(false),[copy,setCopy]=useState(false),[linkCopied,setLinkCopied]=useState(false),[linkError,setLinkError]=useState(''),[cancelReason,setCancelReason]=useState(''),[checkoutBusy,setCheckoutBusy]=useState(false),[checkoutError,setCheckoutError]=useState('');
 useRecordOpen(p,owner,'invoice',invoice.id);
 const balance=invoiceBalance(invoice),[refunding,setRefunding]=useState(false),[crediting,setCrediting]=useState(false);
 const refundable=(invoice.grossPaidMinor??invoice.paidMinor??0)-(invoice.refundedMinor||0),creditable=invoice.amountMinor-(invoice.creditedMinor||0);
 const canRefund=owner&&invoice.status!=='Cancelled'&&refundable>0&&!['creating','open','processing'].includes(invoice.checkout?.status),canCredit=owner&&invoice.status!=='Cancelled'&&creditable>0&&!['creating','open','processing'].includes(invoice.checkout?.status);
 const checkoutStatus=invoice.checkout?.status;
 const discounted=(invoice.discountNetMinor||0)>0,lateFee=(invoice.charges||[]).find(item=>item.kind==='late_fee');
 const [tipping,setTipping]=useState(false),[tipError,setTipError]=useState('');
 const lateFeeNote=invoice.lateFeeRule&&!lateFee&&isOpen(invoice)?lateFeeTerms(invoice.lateFeeRule,invoice.currency):'';
 async function saveTip(amountMinor){setTipError('');if(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>invoice.amountMinor){setTipError('Enter a tip between zero and the invoice amount.');return;}const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/tip?studio=${studio.id}`,'POST',{amountMinor}));if(result?.invoice){onChanged(result.invoice);setTipping(false);}}
 async function waiveFee(){const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/late-fee?studio=${studio.id}`,'POST',{action:'waive'}));if(result?.invoice)onChanged(result.invoice);}
 const checkoutActive=['creating','open','processing'].includes(checkoutStatus);
 const canRecord=owner&&isOpen(invoice)&&balance>0&&!checkoutActive,owesPayment=isOpen(invoice)&&balance>0;
 const canCancel=owner&&invoice.status==='Issued'&&!(invoice.paidMinor||0)&&!checkoutActive;
 const bookkeeper=p.accessRole==='Bookkeeper';
 const canCheckout=!owner&&!bookkeeper&&stripeReady&&isOpen(invoice)&&balance>0&&checkoutStatus!=='processing';
 const canExpire=owner&&checkoutStatus==='open';
 const canTellPaid=!owner&&!bookkeeper&&p.accessRole==='Approver'&&isOpen(invoice)&&balance>0&&!invoice.paidNotice&&!checkoutActive,[tellingPaid,setTellingPaid]=useState(false);
 const canWaive=owner&&!!lateFee&&!lateFee.waivedAt&&invoice.status!=='Cancelled'&&!checkoutActive;
 const stripePaid=invoice.status==='Paid'&&invoice.payments?.some(payment=>payment.source==='stripe_verified');
 const snapshot=invoice.snapshot||{};
 const [documentView,setDocumentView]=useState(false),[creditView,setCreditView]=useState('');
 const pdfUrl=(credit=null)=>`/api/projects/${p.id}/invoices/${invoice.id}/${credit?`credit-notes/${credit.id}/`:''}pdf?studio=${studio.id}`;
 const pageOptions={studio,design,brandKit,estimate:p.estimates?.find(item=>item.id===invoice.estimateId)},invoicePage=documentView?invoicePageHtml(invoice,pageOptions):'';
 async function cancelInvoice(event){event.preventDefault();const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/cancel?studio=${studio.id}`,'POST',{reason:cancelReason}));if(result?.invoice){onChanged(result.invoice);setCancelling(false);setCancelReason('');}}
 async function expireCheckout(){const result=await run(()=>request(`/api/projects/${p.id}/invoices/${invoice.id}/checkout/expire?studio=${studio.id}`,'POST',{}));if(result?.invoice){onChanged(result.invoice);setExpiring(false);}}
 async function startCheckout(){setCheckoutError('');setCheckoutBusy(true);try{const result=await request(`/api/projects/${p.id}/invoices/${invoice.id}/checkout?studio=${studio.id}`,'POST',{});const destination=new URL(result.url);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error('Stripe did not return a secure Checkout link.');window.location.assign(destination.toString());}catch(error){setCheckoutError(error.message||'Checkout could not be opened.');setCheckoutBusy(false);}}
 return <article className="billing-document" aria-label={`Invoice ${invoice.number}`}>
  <header className="billing-document-head"><div><span className="billing-document-label">INVOICE {invoice.number}</span><h3>{invoiceTitle(invoice)}</h3><p>From {snapshot.sellerName||studio.name} to {snapshot.billToName||p.brief.name}</p></div><div className="billing-document-head-right"><Status invoice={invoice}/>{owner&&invoice.status!=='Cancelled'&&<><button className="billing-text-button billing-share" onClick={async()=>{try{const url=new URL('/',window.location.origin);url.search=new URLSearchParams({view:'projects',project:p.id,tab:'Billing',invoice:invoice.id}).toString();await navigator.clipboard.writeText(url.toString());setLinkCopied(true);setLinkError('');}catch{setLinkCopied(false);setLinkError('Could not copy the link. Check browser clipboard permission.');}}}><Copy size={15}/>{linkCopied?'Invoice link copied':'Copy invoice link'}</button><small>Client needs portal access. No message is sent.</small>{linkError&&<small className="billing-copy-error" role="alert">{linkError}</small>}</>}<span className="billing-file-actions"><a className="billing-text-button billing-download" href={pdfUrl()} download><Download size={15}/> Download PDF</a><button className="billing-text-button billing-print" onClick={()=>printInvoice(invoicePageHtml(invoice,pageOptions))}><Printer size={15}/> Print</button></span></div></header>
  <OpenedNote p={p} owner={owner} kind="invoice" itemId={invoice.id} shared={invoice.status!=='Cancelled'}/>
  <div className="doc-actions"><button className="doc-quiet" aria-pressed={!documentView} onClick={()=>setDocumentView(false)}>Account details</button><button className="doc-quiet" aria-pressed={documentView} onClick={()=>setDocumentView(true)}>Invoice document</button></div>
  {documentView&&<InvoicePreview html={invoicePage} title={`Invoice ${invoice.number}`}/>}
  {!documentView&&<><div className="billing-document-parties"><div><span>FROM</span><strong>{snapshot.sellerName||studio.name}</strong><p>{snapshot.sellerAddress||'—'}</p>{snapshot.sellerContact&&<small>{snapshot.sellerContact}</small>}{snapshot.taxRegistration&&<small>{taxNumberLabel(isVatDocument(snapshot,invoice.currency))} {snapshot.taxRegistration}</small>}</div><div><span>BILL TO</span><strong>{snapshot.billToName||p.brief.name}</strong><p>{snapshot.customerAddress||'—'}</p>{snapshot.billToEmail&&<small>{snapshot.billToEmail}</small>}</div></div>
  <div className="billing-document-grid"><div><span>ISSUED</span><strong>{date(invoice.issuedAt)}</strong></div><div><span>DUE</span><strong>{date(invoice.dueDate)}</strong>{lateFeeNote&&<small className="billing-due-terms">{lateFeeNote}</small>}</div><div><span>SERVICE / SUPPLY DATE</span><strong>{date(snapshot.supplyDate)}</strong></div><div><span>BASED ON</span><strong>{invoice.estimateId?`Estimate version ${invoice.estimateVersion}`:'Its own lines'}</strong></div></div>
  {snapshot.lines?.items?.map((item,i)=><div className="billing-line" key={i}><div><strong>{item.title}</strong><small>{item.quantity} × {money(item.unitAmount,invoice.currency)}{perUnit(item.unit)&&` ${perUnit(item.unit)}`}</small></div><strong>{money(item.quantity*item.unitAmount,invoice.currency)}</strong></div>)}
  {!snapshot.lines&&<div className="billing-line"><div><strong>{invoice.label?`${invoice.label} towards project scope`:invoice.kind==='Deposit'?'Deposit towards project scope':invoice.kind==='Balance'?'Remaining project balance':'Agreed project scope'}</strong><small>{snapshot.projectTitle||p.title}</small></div><strong>{money(invoice.shareMinor??invoice.amountMinor,invoice.currency)}</strong></div>}
  {!owner&&invoice.tipsAllowed&&isOpen(invoice)&&!checkoutActive&&<section className="billing-tip"><div><h4>Add a tip</h4><p>Entirely optional. If you would like to say thank you, a tip is added to this invoice and goes to the studio.</p></div>
   <div className="billing-tip-options" role="group" aria-label="Tip amount">{tipPercents.map(percent=>{const value=tipFor(invoice.amountMinor,percent);return <button key={percent} type="button" aria-pressed={invoice.tipMinor===value} disabled={busy} onClick={()=>saveTip(value)}><strong>{percent}%</strong><span>{money(value,invoice.currency)}</span></button>;})}<button type="button" aria-pressed={tipping} disabled={busy} onClick={()=>setTipping(!tipping)}><strong>Other</strong><span>Your amount</span></button>{invoice.tipMinor>0&&<button type="button" className="billing-tip-clear" disabled={busy} onClick={()=>saveTip(0)}><strong>No tip</strong><span>Remove</span></button>}</div>
   {tipping&&<form className="billing-tip-custom" onSubmit={event=>{event.preventDefault();saveTip(minorFromInput(new FormData(event.currentTarget).get('tip')));}}><label><span>Tip ({invoice.currency})</span><input name="tip" type="number" min="0" step="0.01" max={(invoice.amountMinor/100).toFixed(2)} defaultValue={invoice.tipMinor?(invoice.tipMinor/100).toFixed(2):''} required/></label><button className="billing-outline" disabled={busy}>Add tip</button></form>}
   {tipError&&<p className="billing-error" role="alert">{tipError}</p>}
  </section>}
  <dl className="billing-totals">{discounted&&<><div><dt>Price before tax</dt><dd>{money(invoice.netMinor+invoice.discountNetMinor,invoice.currency)}</dd></div><div className="billing-discount"><dt>{invoice.discountLabel||'Discount'}</dt><dd>− {money(invoice.discountNetMinor,invoice.currency)}</dd></div></>}<div><dt>Amount before tax</dt><dd>{money(invoice.netMinor,invoice.currency)}</dd></div>{showsTax(invoice.taxRate,invoice.taxMinor)&&<div><dt>{taxLabel(invoice.taxRate,isVatDocument(snapshot,invoice.currency))}</dt><dd>{money(invoice.taxMinor,invoice.currency)}</dd></div>}<div><dt>Invoice amount</dt><dd>{money(invoice.amountMinor,invoice.currency)}</dd></div>{lateFee&&<div><dt>{lateFee.waivedAt?`Late fee, waived ${date(lateFee.waivedAt)}`:`Late fee, added ${date(lateFee.addedAt)}`}</dt><dd>{lateFee.waivedAt?<s>+ {money(lateFee.amountMinor,invoice.currency)}</s>:`+ ${money(lateFee.amountMinor,invoice.currency)}`}</dd></div>}{(invoice.tipMinor||0)>0&&<div><dt>Tip, thank you</dt><dd>+ {money(invoice.tipMinor,invoice.currency)}</dd></div>}{(invoice.creditedMinor||0)>0&&<div><dt>Credit notes</dt><dd>− {money(invoice.creditedMinor,invoice.currency)}</dd></div>}{(invoice.grossPaidMinor??invoice.paidMinor??0)>0&&<div><dt>Payments recorded</dt><dd>− {money(invoice.grossPaidMinor??invoice.paidMinor,invoice.currency)}</dd></div>}{(invoice.refundedMinor||0)>0&&<div><dt>Refunded to client</dt><dd>+ {money(invoice.refundedMinor,invoice.currency)}</dd></div>}<div className="billing-balance"><dt>{invoice.refundDueMinor?'Refund owed to client':'Amount remaining'}</dt><dd>{money(invoice.refundDueMinor||balance,invoice.currency)}</dd></div></dl>
  {invoice.note&&<section className="billing-note"><h4>About this invoice</h4><p>{invoice.note}</p></section>}
  {owesPayment&&<section className="billing-instructions"><div><h4>Payment instructions</h4><p>{invoice.paymentInstructions||'Ask the studio for payment instructions.'}</p></div>{invoice.paymentInstructions&&<button className="billing-copy" onClick={async()=>{try{await navigator.clipboard.writeText(invoice.paymentInstructions);setCopy(true);setTimeout(()=>setCopy(false),2500);}catch{setCopy(false);}}}><Copy size={14}/>{copy?'Copied':'Copy'}</button>}</section>}
  </>}
  {!owner&&!bookkeeper&&owesPayment&&<p className="billing-clarifier">{stripeReady?'You can pay the balance through Stripe or use the studio’s instructions above.':'Pay using the studio’s instructions above.'} Payments made outside Caleane are recorded by the studio after it checks receipt.{canTellPaid&&' Once you’ve paid, press I’ve paid so they know to look for it.'}</p>}
  {checkoutReturn==='return'&&<p className={`billing-checkout-return${stripePaid?' is-confirmed':''}`} role="status">{stripePaid?'Stripe has confirmed this payment. The invoice record is up to date.':checkoutStalled?<>Stripe hasn’t confirmed this payment yet. It can take a few minutes. Please don’t pay again; check back shortly. <button type="button" className="text-button" onClick={onCheckAgain}>Check again</button></>:'You have returned from Stripe. We will show the payment here once Stripe confirms it. Please do not pay again while confirmation is pending.'}</p>}
  {checkoutReturn==='cancelled'&&<p className="billing-checkout-return" role="status">You left Stripe Checkout without completing payment. The invoice remains open.</p>}
  {invoice.paidNotice&&isOpen(invoice)&&<p className="billing-checkout-return" role="status">{owner?<>{invoice.paidNotice.sentBy} says they paid on {date(invoice.paidNotice.paidOn)} by {paidHow[invoice.paidNotice.method]}{invoice.paidNotice.reference&&<>, reference {invoice.paidNotice.reference}</>}. Check it has arrived, then record it below. The client gets a receipt when you do.</>:<>You told the studio on {date(invoice.paidNotice.sentAt)} that you paid by {paidHow[invoice.paidNotice.method]} on {date(invoice.paidNotice.paidOn)}. They’ll record it once it arrives, and you’ll get a receipt.</>}</p>}
  {checkoutStatus==='processing'&&<p className="billing-checkout-return" role="status">Stripe is still processing this payment. The invoice will update after confirmation.</p>}
  {checkoutStatus==='open'&&<p className="billing-checkout-return" role="status">A Stripe Checkout session is open for this invoice. You can return to it below.</p>}
  {(invoice.payments||[]).length>0&&<section className="billing-payment-history"><h4>Payment record</h4>{invoice.payments.map(payment=><div key={payment.id}><div><strong>{money(payment.amountMinor,invoice.currency)}</strong><small>{paymentName[payment.method]||'External payment'} · {payment.source==='stripe_verified'?'Verified by Stripe':'Recorded by the studio'}{payment.reference?` · ${payment.reference}`:''}</small></div><span>{date(payment.receivedAt)}</span></div>)}<p>Stripe payments are confirmed from signed provider notices. Other payments are entered by the studio after checking receipt.</p></section>}
  {((invoice.credits||[]).length>0||(invoice.refunds||[]).length>0)&&<section className="billing-adjustment-history"><h4>Refunds and credit notes</h4>{(invoice.credits||[]).map(credit=><React.Fragment key={credit.id}><div><div><strong>Credit note {credit.number}</strong><small>{credit.reason} · issued by {credit.issuedBy}</small><span className="billing-credit-actions"><button className="billing-text-button" aria-expanded={creditView===credit.id} onClick={()=>setCreditView(creditView===credit.id?'':credit.id)}><FileText size={14}/> {creditView===credit.id?'Hide credit note':'View credit note'}</button><a className="billing-text-button" href={pdfUrl(credit)} download><Download size={14}/> Download PDF</a></span></div><span>− {money(credit.amountMinor,invoice.currency)} · {date(credit.issuedAt)}</span></div>{creditView===credit.id&&<section className="billing-credit-document" aria-label={`Credit note ${credit.number}`}><InvoicePreview html={invoicePageHtml(invoice,{...pageOptions,creditNote:credit})} title={`Credit note ${credit.number}`}/><button className="billing-text-button" onClick={()=>printInvoice(invoicePageHtml(invoice,{...pageOptions,creditNote:credit}))}><Printer size={14}/> Print credit note</button></section>}</React.Fragment>)}{(invoice.refunds||[]).map(refund=><div key={refund.id}><div><strong>Refund paid</strong><small>{paymentName[refund.method]||'External'}{refund.reference?` · ${refund.reference}`:''}{refund.note?` · ${refund.note}`:''}</small></div><span>{money(refund.amountMinor,invoice.currency)} · {date(refund.refundedAt)}</span></div>)}</section>}
  {invoice.status==='Cancelled'&&<p className="billing-cancelled">This invoice was cancelled{invoice.cancelledAt?` on ${date(invoice.cancelledAt)}`:''}. No payment is due against it.{invoice.cancelReason&&<> Reason: {invoice.cancelReason}</>}</p>}
  {(canCheckout||canTellPaid||canRecord||canCancel||canExpire||canRefund||canCredit||canWaive)&&!recording&&!cancelling&&!expiring&&!refunding&&!crediting&&!tellingPaid&&<div className="billing-owner-actions">{canCheckout&&<button className="billing-primary" disabled={checkoutBusy||busy} onClick={startCheckout}>{checkoutBusy?'Opening Stripe…':checkoutStatus==='open'?'Return to Stripe Checkout':'Pay securely with Stripe'} </button>}{canTellPaid&&<button className={canCheckout?'billing-outline':'billing-primary'} onClick={()=>setTellingPaid(true)}>I’ve paid</button>}{canRecord&&<button className={canCheckout?'billing-outline':'billing-primary'} onClick={()=>setRecording(true)}>{invoice.paidNotice?'Record this payment':'Record a payment'} <Plus size={16}/></button>}{canExpire&&<button className="billing-text-button" disabled={busy} onClick={()=>setExpiring(true)}>Close open Checkout session</button>}{canRefund&&<button className="billing-outline" onClick={()=>setRefunding(true)}>Issue a refund</button>}{canCredit&&<button className="billing-text-button" onClick={()=>setCrediting(true)}>Reduce with a credit note</button>}{canWaive&&<button className="billing-text-button" disabled={busy} onClick={waiveFee}>Waive late fee</button>}{canCancel&&<button className="billing-text-button" onClick={()=>setCancelling(true)}>Cancel invoice</button>}</div>}
  {refunding&&<RefundForm invoice={invoice} p={p} studio={studio} request={request} run={run} busy={busy} refundable={refundable} creditable={creditable} onCancel={()=>setRefunding(false)} onSaved={updated=>{onChanged(updated);setRefunding(false);}}/>}
  {crediting&&<CreditNoteForm invoice={invoice} p={p} studio={studio} request={request} run={run} busy={busy} creditable={creditable} onCancel={()=>setCrediting(false)} onSaved={updated=>{onChanged(updated);setCrediting(false);}}/>}
  {checkoutError&&<p className="billing-error" role="alert">{checkoutError}</p>}
  {expiring&&<div className="billing-expire-confirm"><h4>Close this Stripe Checkout session?</h4><p>The open payment link will stop working. This does not refund a payment or change the invoice balance. Check with your client first if they may be paying now.</p><div><button className="billing-outline" type="button" disabled={busy} onClick={()=>setExpiring(false)}>Keep session</button><button className="billing-primary" type="button" disabled={busy} onClick={expireCheckout}>Close session</button></div></div>}
  {tellingPaid&&<PaidNoticeForm invoice={invoice} p={p} studio={studio} request={request} run={run} busy={busy} onCancel={()=>setTellingPaid(false)} onSaved={updated=>{onChanged(updated);setTellingPaid(false);}}/>}
  {recording&&<PaymentForm key={invoice.id} invoice={invoice} p={p} studio={studio} request={request} run={run} busy={busy} onCancel={()=>setRecording(false)} onSaved={updated=>{onChanged(updated);setRecording(false);}}/>}
  {cancelling&&<form className="billing-cancel-form" onSubmit={cancelInvoice}><h4>Cancel this invoice?</h4><p>The original record remains visible. Any recorded payments also remain on its history.</p><label><span>Reason for cancellation</span><textarea required rows="2" maxLength="500" value={cancelReason} onChange={event=>setCancelReason(event.target.value)}/></label><div><button className="billing-outline" type="button" onClick={()=>setCancelling(false)}>Keep invoice</button><button className="billing-danger" disabled={busy}>Cancel invoice</button></div></form>}
 </article>;
}

export function Billing({p,studio,owner,request,run,mutate,busy,onNavigate,onInvoiceChange}){
 const [invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[design,setDesign]=useState(null),[brandKit,setBrandKit]=useState(null),[selectedId,setSelectedId]=useState(()=>new URLSearchParams(window.location.search).get('invoice')||''),[issuing,setIssuing]=useState(false),[stripeStatus,setStripeStatus]=useState(null),[checkoutReturn,setCheckoutReturn]=useState(()=>new URLSearchParams(window.location.search).get('checkout')||'');
 const bookkeeper=p.accessRole==='Bookkeeper',canView=owner||bookkeeper||p.accessRole==='Approver';
 useEffect(()=>{let active=true;setLoadError('');setInvoices([]);if(!canView){setLoading(false);return()=>{active=false};}setLoading(true);request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{if(active){setInvoices(data.invoices||[]);setDesign(data.design||null);setBrandKit(data.brandKit||null);setLoading(false);}}).catch(error=>{if(active){setLoadError(error.message);setLoading(false);}});return()=>{active=false};},[p.id,studio.id,request,canView]);
 useEffect(()=>{let active=true;setStripeStatus(null);if(canView)request(`/api/studios/${studio.id}/stripe-status?studio=${studio.id}`).then(data=>{if(active)setStripeStatus(data.stripe||null);}).catch(()=>{if(active)setStripeStatus({configured:false,connected:false,chargesEnabled:false});});return()=>{active=false};},[studio.id,request,canView]);
 const sorted=useMemo(()=>[...invoices].sort((a,b)=>String(b.issuedAt).localeCompare(String(a.issuedAt))),[invoices]);
 const selected=sorted.find(item=>item.id===selectedId)||sorted[0];
 const stripeReady=Boolean(stripeStatus?.connected&&stripeStatus?.chargesEnabled);
 const waitingForCheckout=checkoutReturn==='return'&&selected&&!(selected.status==='Paid'&&selected.payments?.some(payment=>payment.source==='stripe_verified'));
 const [checkoutStalled,setCheckoutStalled]=useState(false),[checkRound,setCheckRound]=useState(0);
 useEffect(()=>{if(!waitingForCheckout)return;let active=true,checks=0;setCheckoutStalled(false);const timer=setInterval(()=>{if(++checks>15){clearInterval(timer);if(active)setCheckoutStalled(true);return;}request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{if(active)setInvoices(data.invoices||[]);}).catch(()=>{});},4000);return()=>{active=false;clearInterval(timer);};},[waitingForCheckout,p.id,studio.id,request,checkRound]);
 function selectInvoice(id){setSelectedId(id);setCheckoutReturn('');const query=new URLSearchParams(window.location.search);query.set('invoice',id);query.delete('checkout');query.delete('session_id');history.replaceState(null,'','/?'+query);}
 function replaceInvoice(invoice){setInvoices(previous=>{const exists=previous.some(item=>item.id===invoice.id);return exists?previous.map(item=>item.id===invoice.id?invoice:item):[invoice,...previous]});selectInvoice(invoice.id);onInvoiceChange?.(invoice);}
 if(!canView)return <div className="billing-restricted"><FileText size={26}/><h2>Invoice access is limited.</h2><p>The studio owner and project approver can view invoices and payment records. Ask your studio if you need a copy.</p></div>;
 return <div className="billing-layout"><div className="billing-main"><div className="billing-intro"><div><p className="billing-kicker">THE COMMERCIAL RECORD</p><h2>Invoices & payments.</h2><p>Every invoice and payment recorded for this project, in one place.</p></div>{owner&&!issuing&&<button className="billing-outline" onClick={()=>setIssuing(true)}><Plus size={16}/> Issue invoice</button>}</div>
 <PaymentPlan p={p} studio={studio} owner={owner} request={request} run={run} busy={busy} invoices={invoices} onIssued={replaceInvoice}/>
 {issuing&&owner&&<IssueForm key={p.id} p={p} invoices={invoices} mutate={mutate} busy={busy} onCancel={()=>setIssuing(false)} onIssued={invoice=>{replaceInvoice(invoice);setIssuing(false);}}/>}
 {loadError&&<div className="billing-error billing-load-error" role="alert">Invoices could not be loaded: {loadError} <button onClick={()=>{setLoading(true);setLoadError('');request(`/api/projects/${p.id}/invoices?studio=${studio.id}`).then(data=>{setInvoices(data.invoices||[]);setLoading(false);}).catch(error=>{setLoadError(error.message);setLoading(false);});}}>Try again</button></div>}
 {loading?<p className="billing-loading" role="status">Loading invoices…</p>:!loadError&&(!sorted.length?<div className="billing-empty"><FileText size={27}/><h3>{owner?'Nothing has been invoiced yet.':'No invoices have been shared yet.'}</h3><p>{owner?'Issue a deposit or full invoice from a budget-confirmed estimate, or a quick invoice for something on its own, such as extra hours.':'Your studio will share an invoice here when payment is due.'}</p>{owner&&<button className="billing-text-button" onClick={()=>onNavigate?.('Estimate')}>Go to the estimate </button>}</div>:<><InvoiceList invoices={sorted} selected={selected?.id} onSelect={selectInvoice}/><InvoiceDetail key={selected.id} invoice={selected} design={design} brandKit={brandKit} p={p} studio={studio} owner={owner} request={request} run={run} busy={busy} onChanged={replaceInvoice} stripeReady={stripeReady} checkoutReturn={checkoutReturn} checkoutStalled={checkoutStalled} onCheckAgain={()=>setCheckRound(n=>n+1)}/></>)}
 </div><aside className="billing-aside"><section><p className="billing-kicker">PAYMENT AT A GLANCE</p>{sorted.length?<><div className="billing-aside-number"><strong>{sorted.filter(isOpen).length}</strong><span>open invoice{sorted.filter(isOpen).length===1?'':'s'}</span></div><p>Open invoices are requests for payment. They are not proof that a date has been booked.</p></>:<p>When an invoice is issued, its due date and payment details appear here for the client.</p>}</section><section><p className="billing-kicker">KEEP IT CLEAR</p><h3>Budget, invoice, payment.</h3><p>An accepted estimate agrees budget direction. An invoice requests payment. {stripeReady?'Stripe payments are verified automatically; the studio records payments made elsewhere after checking receipt.':'The studio records payments after checking receipt outside Caleane.'}</p></section>{(owner||bookkeeper)&&!loading&&!loadError&&<ProjectProfit p={p} studio={studio} request={request} invoices={invoices} readOnly={!owner}/>}{owner&&<section><p className="billing-kicker">THIS PROJECT</p><dl><div><dt>Client</dt><dd>{p.brief.name}</dd></div><div><dt>Project</dt><dd>{p.title}</dd></div>{owner&&<div><dt>Confirmed estimates</dt><dd>{(p.estimates||[]).filter(item=>item.status==='Budget confirmed').length}</dd></div>}</dl></section>}</aside></div>;
}

const FINANCE_SECTIONS=[['invoices','Invoices'],['costs','Costs'],['reports','Reports']];
// Long ledgers show a page at a time; totals and the CSV still cover every invoice that matches.
const LEDGER_PAGE=25;
export function StudioBilling({projects,studio,request,run,openProject}){
 const [section,setSection]=useState(()=>{const value=new URLSearchParams(window.location.search).get('money');return FINANCE_SECTIONS.some(([key])=>key===value)?value:'invoices';});
 const [startCost,setStartCost]=useState(false);
 function chooseSection(value,recordCost=false){setStartCost(recordCost);setSection(value);const query=new URLSearchParams(window.location.search);if(value==='invoices')query.delete('money');else query.set('money',value);history.replaceState(null,'','/?'+query);}
 const head=<><header className="studio-billing-head workspace-page-heading"><div><p className="billing-kicker">STUDIO / FINANCES</p><h1>Money in motion.</h1><p>Invoices, costs and the profit left over, in one place.</p></div></header>
 <div className="studio-tabs finance-sections" role="tablist" aria-label="Finance sections">{FINANCE_SECTIONS.map(([value,label])=><button key={value} type="button" role="tab" id={`finance-tab-${value}`} aria-selected={section===value} aria-controls="finance-section" className={section===value?'active':''} onClick={()=>chooseSection(value)}>{label}</button>)}</div></>;
 if(section!=='invoices')return <div className="studio-billing">{head}<div id="finance-section" role="tabpanel" aria-labelledby={`finance-tab-${section}`}>{section==='costs'?<StudioCosts projects={projects} studio={studio} request={request} openProject={openProject} readOnly={studio.role==='staff_bookkeeper'} startRecording={startCost}/>:<StudioReports projects={projects} studio={studio} request={request} openProject={openProject} openCosts={studio.role==='staff_bookkeeper'?null:()=>chooseSection('costs',true)}/>}</div></div>;
 return <div className="studio-billing">{head}<div id="finance-section" role="tabpanel" aria-labelledby="finance-tab-invoices"><InvoiceLedger projects={projects} studio={studio} request={request} openProject={openProject}/></div></div>;
}

function InvoiceLedger({projects,studio,request,openProject}){
 const [invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('All'),[query,setQuery]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[shown,setShown]=useState(LEDGER_PAGE);
 useEffect(()=>{let active=true;setLoading(true);setError('');request(`/api/invoices?studio=${studio.id}`).then(data=>{if(active){setInvoices(data.invoices||[]);setLoading(false);}}).catch(err=>{if(active){setError(err.message);setLoading(false);}});return()=>{active=false};},[studio.id,request]);
 const byId=useMemo(()=>new Map(projects.map(project=>[project.id,project])),[projects]);
 const open=invoices.filter(isOpen),paid=invoices.filter(isSettled);
 const outstanding=Object.entries(open.reduce((sums,item)=>({...sums,[item.currency]:(sums[item.currency]||0)+invoiceBalance(item)}),{}));
 const inRange=item=>{const issued=String(item.issuedAt||'').slice(0,10);return (!from||issued>=from)&&(!to||issued<=to);};
 const visible=invoices.filter(item=>{const project=byId.get(item.projectId);const matches=inRange(item)&&(filter==='All'||(filter==='Awaiting payment'?isOpen(item):filter==='Overdue'?isOverdue(item):filter==='Paid'?isSettled(item):filter==='Refunded'?['Refunded','Partly refunded','Refund due','Credited'].includes(item.status):item.status===filter));return matches&&`${item.number} ${project?.title||''} ${project?.brief?.name||''}`.toLowerCase().includes(query.toLowerCase())}).sort((a,b)=>String(b.issuedAt).localeCompare(String(a.issuedAt)));
 const totals=ledgerTotals(visible),overdueCount=invoices.filter(item=>isOverdue(item)).length;
 useEffect(()=>{setShown(LEDGER_PAGE);},[filter,query,from,to]);
 function exportCSV(){const blob=new Blob(['﻿'+invoiceLedgerCSV(visible,byId)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`invoice-ledger-${localToday()}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <><div className="studio-billing-overview"><div><span>Awaiting payment</span><strong>{open.length}</strong><small>Open invoices</small></div><div><span>Paid</span><strong>{paid.length}</strong><small>Verified or studio-recorded payments</small></div><div className="studio-billing-outstanding"><span>Outstanding by currency</span>{outstanding.length?outstanding.map(([currency,total])=><strong key={currency}>{money(total,currency)}</strong>):<strong>—</strong>}<small>Across open invoices</small></div></div>
 <div className="studio-billing-ledger-head"><div><h2>Invoice ledger</h2><p>Select an invoice to open its project record.</p></div><button type="button" className="billing-outline" disabled={loading||!!error||!visible.length} onClick={exportCSV}><Download size={16}/> Export CSV</button></div>
 <div className="studio-collection-controls"><div className="studio-billing-filters" role="group" aria-label="Filter invoices">{['All','Awaiting payment','Overdue','Paid','Refunded','Cancelled'].map(option=><button key={option} aria-pressed={filter===option} onClick={()=>setFilter(option)}>{option}{option==='Overdue'&&overdueCount>0&&<span className="studio-billing-count"> {overdueCount}</span>}</button>)}</div><CollectionFilter label="Filter invoices" value={query} onChange={setQuery} placeholder="Invoice, project or client…"/></div>
 <div className="studio-billing-range" role="group" aria-label="Issue date range"><label><span>Issued from</span><input type="date" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)}/></label><label><span>Issued to</span><input type="date" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)}/></label>{(from||to)&&<button type="button" className="billing-text-button" onClick={()=>{setFrom('');setTo('');}}>Clear dates</button>}</div>
 {!loading&&!error&&visible.length>0&&<dl className="studio-billing-totals" aria-label="Totals for the invoices shown"><div><dt>Invoices shown</dt><dd>{visible.length}</dd></div>{[['invoiced','Invoiced'],['paid','Paid'],['outstanding','Outstanding']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{totals.map(row=><span key={row.currency}>{money(row[key],row.currency)}</span>)}</dd></div>)}</dl>}
 {loading?<p className="billing-loading" role="status">Loading invoice ledger…</p>:error?<p className="billing-error" role="alert">Invoice ledger could not be loaded: {error}</p>:visible.length?<div className="studio-billing-ledger"><div className="studio-billing-ledger-labels"><span>INVOICE</span><span>PROJECT / CLIENT</span><span>DUE</span><span>AMOUNT DUE</span><span>STATUS</span></div>{visible.slice(0,shown).map(item=>{const project=byId.get(item.projectId);return <button key={item.id} onClick={()=>project&&openProject(project,'Billing',item.id)} disabled={!project}><span><strong>{item.number}</strong><small>{item.label||item.kind} · {date(item.issuedAt)}</small></span><span><strong>{project?.title||'Project unavailable'}</strong><small>{project?.brief?.name||''}</small></span><span>{date(item.dueDate)}</span><span className="studio-billing-amount">{money(item.dueMinor??item.amountMinor,item.currency)}{(item.dueMinor??item.amountMinor)!==item.amountMinor&&item.status!=='Cancelled'&&<small>Issued at {money(item.amountMinor,item.currency)}</small>}</span><Status invoice={item}/></button>})}{visible.length>shown&&<button type="button" className="billing-outline studio-billing-more" onClick={()=>setShown(n=>n+LEDGER_PAGE)}>Show {Math.min(LEDGER_PAGE,visible.length-shown)} more of {visible.length-shown} remaining</button>}</div>:<div className="billing-empty"><FileText size={26}/><h3>{invoices.length?'No invoices match.':'No invoices have been issued.'}</h3><p>{invoices.length?'Try another status, date range or search term.':'Issue the first invoice from a project with a budget-confirmed estimate.'}</p></div>}
 <p className="studio-billing-footnote">Stripe Checkout payments are verified from signed provider notices. Bank transfers and other external payments are recorded by the studio after it checks receipt.</p></>;
}
