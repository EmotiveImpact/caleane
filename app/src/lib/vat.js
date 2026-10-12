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

// A line can carry its own rate, such as reduced (5%) or zero-rated, or be exempt from VAT.
// A line with neither uses the document's rate. The choices offered on estimates, quick
// invoices and the price list:
export const LINE_VAT=[['','Usual rate'],['5','Reduced 5%'],['0','Zero-rated'],['exempt','Exempt']];
export const lineVatChoice=item=>item?.exempt?'exempt':typeof item?.taxRate==='number'?String(item.taxRate):'';
export function withLineVat(item,choice){
 const {taxRate:_rate,exempt:_exempt,...rest}=item||{};
 return choice==='exempt'?{...rest,exempt:true}:choice===''||choice==null||!Number.isFinite(Number(choice))?rest:{...rest,taxRate:Number(choice)};
}
// What the server keeps from a line's VAT choice. `fail` reports a bad value.
export function cleanLineVat(item,fail){
 if(item?.exempt===true)return {exempt:true};
 if(item?.taxRate==null)return {};
 if(typeof item.taxRate!=='number'||!Number.isFinite(item.taxRate)||item.taxRate<0||item.taxRate>100)fail(400,'Check the VAT rate on each line.');
 return {taxRate:Math.round(item.taxRate*100)/100};
}
// Lines grouped by rate, with tax worked out once per rate. Exempt lines come last.
export function vatGroups(items,rate){
 const groups=new Map();
 for(const item of items||[]){
  const exempt=item.exempt===true,lineRate=exempt?0:typeof item.taxRate==='number'?item.taxRate:Number(rate)||0,key=exempt?'exempt':String(lineRate);
  const group=groups.get(key)||{rate:lineRate,exempt,netMinor:0,taxMinor:0};group.netMinor+=item.quantity*item.unitAmount;groups.set(key,group);
 }
 return [...groups.values()].map(group=>({...group,taxMinor:Math.round(group.netMinor*group.rate/100)})).sort((a,b)=>a.exempt-b.exempt||b.rate-a.rate);
}
export const vatTotal=groups=>groups.reduce((sum,group)=>sum+group.taxMinor,0);
// Whether a document's tax needs showing rate by rate: its lines are at more than one rate,
// or all at a rate other than the document's own, such as an estimate that is all zero-rated.
export const splitsVat=(groups,rate)=>groups.length>1||groups.some(group=>group.exempt||group.rate!==(Number(rate)||0));
// An invoice's part of a mixed-rate estimate, split across the rates in proportion, so
// the parts add up exactly to the invoice's own net and tax.
export function shareVatGroups(groups,{netMinor,taxMinor}){
 const spread=(total,weights)=>{const sum=weights.reduce((a,b)=>a+b,0);let left=total;const last=weights.map((w,i)=>w>0?i:-1).filter(i=>i>=0).at(-1);return weights.map((w,i)=>{if(!sum||w<=0)return 0;if(i===last)return left;const part=Math.round(total*w/sum);left-=part;return part;});};
 const nets=spread(netMinor,groups.map(group=>group.netMinor)),taxes=spread(taxMinor,groups.map(group=>group.taxMinor));
 return groups.map((group,i)=>({rate:group.rate,exempt:group.exempt,netMinor:nets[i],taxMinor:taxes[i]}));
}
// "VAT at 20%", "Zero-rated" or "Exempt", for invoice totals and line details.
export const vatGroupLabel=(group,vat=true)=>group.exempt?'Exempt':group.rate===0?(vat?'Zero-rated':'No tax'):`${vat?'VAT':'Tax'} at ${group.rate}%`;
export const lineVatLabel=(item,rate,vat=true)=>vatGroupLabel({exempt:item.exempt===true,rate:item.exempt?0:typeof item.taxRate==='number'?item.taxRate:Number(rate)||0},vat);
// The tax lines under a document's subtotal as [label, minor]: one per rate when splitsVat,
// otherwise the usual single line, or none when there is no tax. `format` prints an amount.
export function taxRows(doc,format,vat=isVatDocument(doc)){
 const groups=vatGroups(doc.items,doc.taxRate);
 if(splitsVat(groups,doc.taxRate))return groups.map(group=>[`${vatGroupLabel(group,vat)} on ${format(group.netMinor)}`,group.taxMinor]);
 return showsTax(doc.taxRate,doc.tax)?[[taxLabel(doc.taxRate,vat),doc.tax]]:[];
}
