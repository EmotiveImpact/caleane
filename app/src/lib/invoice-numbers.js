// Invoice numbers read INV-2026-0001 by default. A studio can change the prefix, leave the year out and
// choose the next number, for example to carry on from its old bookkeeping.
export const DEFAULT_INVOICE_PREFIX='INV';
export const validInvoicePrefix=value=>typeof value==='string'&&value.length<=12&&/^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/.test(value);
// Numbers restart each year when the year is part of them; without it one counter runs on, kept under year 0.
export const counterYear=(settings,year)=>settings?.invoiceYear===false?0:year;
export const invoiceNumber=(settings,year,next)=>`${settings?.invoicePrefix||DEFAULT_INVOICE_PREFIX}-${settings?.invoiceYear===false?'':`${year}-`}${String(next).padStart(4,'0')}`;
