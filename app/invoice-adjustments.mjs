import {id,now,transaction} from './store.mjs';

// Credit notes reduce what an issued invoice asks for; refunds record money the
// studio has returned. Both are separate, numbered records so the original
// invoice snapshot is never edited.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,label)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);return value.trim();};
const day=value=>{const result=text(value,10,'the date');if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)fail(400,'Enter a valid date.');return result;};
export const refundMethods=['bank_transfer','paypal_external','stripe_external','other_external'];

export function installInvoiceAdjustments(db){db.exec(`
 CREATE TABLE IF NOT EXISTS invoice_credit_notes(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),invoice_id TEXT NOT NULL REFERENCES invoices(id),number TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),net_minor INTEGER NOT NULL,tax_minor INTEGER NOT NULL,reason TEXT NOT NULL,issued_at TEXT NOT NULL,issued_by TEXT NOT NULL,UNIQUE(studio_id,number));
 CREATE INDEX IF NOT EXISTS invoice_credit_notes_invoice ON invoice_credit_notes(studio_id,invoice_id,issued_at);
 CREATE TABLE IF NOT EXISTS credit_note_counters(studio_id TEXT NOT NULL,year INTEGER NOT NULL,next_number INTEGER NOT NULL,PRIMARY KEY(studio_id,year));
 CREATE TABLE IF NOT EXISTS invoice_refunds(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),invoice_id TEXT NOT NULL REFERENCES invoices(id),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),method TEXT NOT NULL,reference TEXT NOT NULL,refunded_at TEXT NOT NULL,note TEXT NOT NULL,recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS invoice_refunds_invoice ON invoice_refunds(studio_id,invoice_id,recorded_at);`);ensureInvoiceLabel(db);}

// Scheduled payments carry their plan label (for example "Second instalment").
export function ensureInvoiceLabel(db){if(!db.prepare('PRAGMA table_info(invoices)').all().some(column=>column.name==='label'))db.exec("ALTER TABLE invoices ADD COLUMN label TEXT NOT NULL DEFAULT ''");}
export function invoiceAdjustments(db,studioId,invoiceId){
 const credits=db.prepare('SELECT * FROM invoice_credit_notes WHERE studio_id=? AND invoice_id=? ORDER BY issued_at,number').all(studioId,invoiceId).map(row=>({id:row.id,number:row.number,amountMinor:row.amount_minor,netMinor:row.net_minor,taxMinor:row.tax_minor,reason:row.reason,issuedAt:row.issued_at,issuedBy:row.issued_by}));
 const refunds=db.prepare('SELECT * FROM invoice_refunds WHERE studio_id=? AND invoice_id=? ORDER BY recorded_at,id').all(studioId,invoiceId).map(row=>({id:row.id,amountMinor:row.amount_minor,method:row.method,reference:row.reference,refundedAt:row.refunded_at,note:row.note,recordedAt:row.recorded_at,recordedBy:row.recorded_by}));
 return {credits,refunds,creditedMinor:credits.reduce((sum,item)=>sum+item.amountMinor,0),refundedMinor:refunds.reduce((sum,item)=>sum+item.amountMinor,0)};
}

// One status rule shared by the invoice view, the ledger and payment checks.
export function invoiceState({amountMinor,grossPaidMinor,creditedMinor,refundedMinor,cancelled}){
 const dueMinor=Math.max(0,amountMinor-creditedMinor),paidMinor=grossPaidMinor-refundedMinor,balanceMinor=Math.max(0,dueMinor-paidMinor),refundDueMinor=Math.max(0,paidMinor-dueMinor);
 let status='Issued';
 if(cancelled)status='Cancelled';
 else if(refundDueMinor>0)status='Refund due';
 else if(dueMinor===0)status=paidMinor>0?'Paid':refundedMinor>0?'Refunded':'Credited';
 else if(refundedMinor>0&&paidMinor>=dueMinor)status='Partly refunded';
 else if(paidMinor>=dueMinor)status='Paid';
 else if(paidMinor>0)status='Partially paid';
 return {dueMinor,paidMinor,balanceMinor,refundDueMinor,status};
}

export function issueCreditNote(db,{studioId,invoice,user,body,paidMinor}){
 const amountMinor=body.amountMinor,reason=text(body.reason,1000,'the reason');
 if(!reason)fail(400,'Give a reason for the credit note.');
 return transaction(db,()=>{
  const {creditedMinor}=invoiceAdjustments(db,studioId,invoice.id);
  if(invoice.cancelled_at)fail(409,'This invoice has been cancelled.');
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>invoice.amount_minor-creditedMinor)fail(400,'Enter a credit no larger than the amount still invoiced.');
  const year=Number(now().slice(0,4));db.prepare('INSERT OR IGNORE INTO credit_note_counters VALUES(?,?,1)').run(studioId,year);
  const next=db.prepare('SELECT next_number FROM credit_note_counters WHERE studio_id=? AND year=?').get(studioId,year).next_number;
  db.prepare('UPDATE credit_note_counters SET next_number=next_number+1 WHERE studio_id=? AND year=?').run(studioId,year);
  // Keep the same tax proportion as the original invoice.
  const netMinor=invoice.amount_minor?Math.round(invoice.net_minor*amountMinor/invoice.amount_minor):amountMinor,number=`CN-${year}-${String(next).padStart(4,'0')}`;
  db.prepare('INSERT INTO invoice_credit_notes VALUES(?,?,?,?,?,?,?,?,?,?)').run(id(),studioId,invoice.id,number,amountMinor,netMinor,amountMinor-netMinor,reason,now(),user.name);
  return number;
 });
}

// The usual studio action: give money back and reduce the invoice by the same
// amount, so it no longer shows as owed. Returns the credit note number.
export function refundWithCredit(db,{studioId,invoice,user,body,grossPaidMinor}){
 return transaction(db,()=>{recordRefund(db,{studioId,invoice,user,body,grossPaidMinor});return issueCreditNote(db,{studioId,invoice,user,body:{amountMinor:body.amountMinor,reason:body.reason||body.note||'Refund'}});});
}
export function recordRefund(db,{studioId,invoice,user,body,grossPaidMinor}){
 const amountMinor=body.amountMinor,method=body.method,refundedAt=day(body.refundedAt),reference=text(body.reference,160,'the reference'),note=text(body.note,1000,'the note');
 if(!refundMethods.includes(method))fail(400,'Choose how the refund was paid.');
 if(refundedAt>now().slice(0,10))fail(400,'Choose a refund date no later than today.');
 return transaction(db,()=>{
  const {refundedMinor}=invoiceAdjustments(db,studioId,invoice.id);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>grossPaidMinor-refundedMinor)fail(400,'Enter a refund no larger than the payments received.');
  db.prepare('INSERT INTO invoice_refunds VALUES(?,?,?,?,?,?,?,?,?,?)').run(id(),studioId,invoice.id,amountMinor,method,reference,refundedAt,note,now(),user.name);
 });
}
