import {id,now,transaction,event,saveProject} from './store.mjs';
import {invoiceAdjustments,invoiceCharges,invoiceState} from './invoice-adjustments.mjs';
import {discountFor,lateFeeFits} from './src/lib/invoice-charges.js';
import {CURRENCIES} from './src/lib/currencies.js';
export {discountFor};

// Discounts, late fees and tips. A discount is part of the issued invoice. A late
// fee or a tip is a separate charge added later, so the issued figures stay as
// they were. Late fees and tips carry no tax: in the UK both sit outside VAT.
// Nothing here sends a message, an email or takes a payment.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const dayNumber=value=>Math.floor(Date.parse(value.slice(0,10)+'T12:00:00Z')/86400000);
const money=(minor,currency)=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);}catch{return `${(minor/100).toFixed(2)} ${currency}`;}};

export const defaultLateFee={enabled:false,type:'fixed',amountMinor:2500,percent:5,afterDays:7};
export const defaultTips={enabled:false};

// A fixed fee is an amount in one currency, so it only goes on invoices in that currency.
// `usualCurrency` covers rules saved before the fee had a currency of its own.
export function validateLateFee(input={},usualCurrency='GBP'){
 const rule={...defaultLateFee,currency:usualCurrency,...(input||{})};
 if(!CURRENCIES.includes(rule.currency))fail(400,'Choose a currency for the fixed late fee.');
 if(!['fixed','percent'].includes(rule.type))fail(400,'Choose a fixed or percentage late fee.');
 if(!Number.isSafeInteger(rule.amountMinor)||rule.amountMinor<1||rule.amountMinor>100000)fail(400,'Use a fixed late fee between 0.01 and 1,000.');
 if(typeof rule.percent!=='number'||!Number.isFinite(rule.percent)||rule.percent<=0||rule.percent>25)fail(400,'Use a late fee percentage above 0 and no more than 25.');
 if(!Number.isInteger(rule.afterDays)||rule.afterDays<1||rule.afterDays>90)fail(400,'Add the late fee between 1 and 90 days after the due date.');
 return {enabled:rule.enabled===true,type:rule.type,amountMinor:rule.amountMinor,currency:rule.currency,percent:Math.round(rule.percent*100)/100,afterDays:rule.afterDays};
}
export const validateTips=input=>({enabled:input?.enabled===true});

function balanceOf(db,invoice,{withCharges=true}={}){
 const paid=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_payments WHERE studio_id=? AND invoice_id=?').get(invoice.studio_id,invoice.id).n;
 const adjustments=invoiceAdjustments(db,invoice.studio_id,invoice.id),charges=invoiceCharges(db,invoice.studio_id,invoice.id);
 return {charges,state:invoiceState({amountMinor:invoice.amount_minor,chargesMinor:withCharges?charges.chargesMinor:0,grossPaidMinor:paid,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,cancelled:!!invoice.cancelled_at})};
}
const checkoutOpen=(db,invoice)=>{try{return !!db.prepare("SELECT 1 FROM stripe_checkout_attempts WHERE studio_id=? AND invoice_id=? AND status IN ('creating','open','processing')").get(invoice.studio_id,invoice.id);}catch{return false;}};

// Late fees that are due on `today`. Only invoices issued with a late fee rule
// qualify, and only while the studio still has late fees switched on.
export function dueLateFees(db,studioId,today=now().slice(0,10)){
 const saved=db.prepare("SELECT data FROM studio_settings_kv WHERE studio_id=? AND key='billing_defaults'").get(studioId),defaults=saved?JSON.parse(saved.data):{},setting=defaults.lateFee;
 if(!setting?.enabled)return [];
 const result=[];
 for(const invoice of db.prepare("SELECT * FROM invoices WHERE studio_id=? AND cancelled_at IS NULL AND late_fee_rule<>''").all(studioId)){
  const rule=JSON.parse(invoice.late_fee_rule);
  // Invoices issued before fees had a currency: a fixed fee in the usual currency never lands on another one.
  if(!lateFeeFits({currency:defaults.currency||'GBP',...rule},invoice.currency))continue;
  if(dayNumber(today)-dayNumber(invoice.due_date)<rule.afterDays)continue;
  if(db.prepare("SELECT 1 FROM invoice_charges WHERE invoice_id=? AND kind='late_fee'").get(invoice.id))continue;
  if(checkoutOpen(db,invoice))continue;
  const {state}=balanceOf(db,invoice);if(state.balanceMinor<=0)continue;
  const amountMinor=rule.type==='percent'?Math.round(state.balanceMinor*rule.percent/100):rule.amountMinor;
  if(amountMinor>0)result.push({invoice,rule,amountMinor});
 }
 return result;
}

// Run by the reminders job. Adds the fee to the invoice and notes it on the
// project record. It does not message, email or charge the client.
export function applyLateFees(db,{studioId,today=now().slice(0,10)}){
 const applied=[];
 for(const {invoice,rule,amountMinor} of dueLateFees(db,studioId,today)){
  transaction(db,()=>{
   const label=rule.type==='percent'?`Late fee (${rule.percent}% of the unpaid balance)`:'Late fee';
   db.prepare("INSERT OR IGNORE INTO invoice_charges(id,studio_id,invoice_id,kind,amount_minor,label,added_at,added_by) VALUES(?,?,?,'late_fee',?,?,?,'Caleane late fees')").run(id(),studioId,invoice.id,amountMinor,label,now());
   const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(invoice.project_id,studioId);
   if(row){const project=JSON.parse(row.data);event(project,{name:'Caleane'},`Added a late fee of ${money(amountMinor,invoice.currency)} to invoice ${invoice.number}`);saveProject(db,project);}
  });
  applied.push({invoiceId:invoice.id,number:invoice.number,amountMinor});
 }
 return applied;
}

export function waiveLateFee(db,{studioId,invoice,user}){
 return transaction(db,()=>{
  const fee=db.prepare("SELECT * FROM invoice_charges WHERE invoice_id=? AND studio_id=? AND kind='late_fee'").get(invoice.id,studioId);
  if(!fee||fee.waived_at)fail(409,'There is no late fee to waive on this invoice.');
  if(checkoutOpen(db,invoice))fail(409,'Resolve the active Stripe Checkout before changing this invoice.');
  db.prepare('UPDATE invoice_charges SET waived_at=?,waived_by=? WHERE id=?').run(now(),user.name,fee.id);
  return fee.amount_minor;
 });
}

// The client chooses a tip on a final invoice that allows one. Setting zero
// removes it. A tip cannot go below what has already been paid towards it.
export function setTip(db,{studioId,invoice,user,amountMinor}){
 if(!invoice.tips_allowed)fail(409,'This invoice does not take tips.');
 if(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>invoice.amount_minor)fail(400,'Enter a tip between zero and the invoice amount.');
 return transaction(db,()=>{
  if(checkoutOpen(db,invoice))fail(409,'Finish or close the open Stripe Checkout before changing the tip.');
  const {state}=balanceOf(db,invoice);
  if(!['Issued','Partially paid'].includes(state.status))fail(409,'The tip can only change while the invoice is waiting for payment.');
  const current=invoiceCharges(db,studioId,invoice.id).tipMinor;
  if(state.paidMinor>state.dueMinor-current+amountMinor)fail(409,'The tip cannot be less than what has already been paid towards it.');
  if(amountMinor===0)db.prepare("DELETE FROM invoice_charges WHERE invoice_id=? AND studio_id=? AND kind='tip'").run(invoice.id,studioId);
  else db.prepare("INSERT INTO invoice_charges(id,studio_id,invoice_id,kind,amount_minor,label,added_at,added_by) VALUES(?,?,?,'tip',?,'Tip',?,?) ON CONFLICT(invoice_id,kind) DO UPDATE SET amount_minor=excluded.amount_minor,added_at=excluded.added_at,added_by=excluded.added_by").run(id(),studioId,invoice.id,amountMinor,now(),user.name);
  return current;
 });
}
