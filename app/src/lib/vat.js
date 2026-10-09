// VAT for UK studios. Shared by the server (settings, estimates, invoices,
// reports) and the browser (labels), so every document names tax the same way.
export const DEFAULT_VAT_RATE=20;

// Settings saved before the switch existed: a rate above zero or a VAT number means registered.
export const isVatRegistered=defaults=>typeof defaults?.vatRegistered==='boolean'?defaults.vatRegistered:Number(defaults?.taxRate)>0||!!String(defaults?.taxRegistration||'').trim();
// The rate a new estimate starts with.
export const defaultTaxRate=defaults=>isVatRegistered(defaults)?(Number(defaults?.taxRate)>0?Number(defaults.taxRate):DEFAULT_VAT_RATE):0;
// Estimates and invoice snapshots record whether the studio was VAT registered.
// Older records do not, so a GBP document or one with a VAT number is read as VAT.
export const isVatDocument=(record,currency=record?.currency)=>typeof record?.vatRegistered==='boolean'?record.vatRegistered:currency==='GBP'||!!String(record?.taxRegistration||'').trim();
// A tax line only appears when there is tax: never "Tax (0%)".
export const showsTax=(rate,taxMinor=0)=>Number(rate)>0||Number(taxMinor)>0;
export const taxLabel=(rate,vat)=>`${vat?'VAT':'Tax'} (${Number(rate)||0}%)`;
export const taxNumberLabel=vat=>vat?'VAT no.':'Tax no.';

// The part of each payment on an invoice that is VAT. Credit notes keep the
// invoice's VAT proportion; tips and late fees carry none.
export function vatShare(invoice){
 const amount=Number(invoice?.amountMinor)||0,tax=Number(invoice?.taxMinor)||0;if(!amount||!tax)return 0;
 const due=invoice.dueMinor??amount,owed=tax*Math.max(0,amount-(invoice.creditedMinor||0))/amount;
 return due>0?Math.min(1,owed/due):tax/amount;
}
