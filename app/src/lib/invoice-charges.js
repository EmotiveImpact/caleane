// Shared by the server and the billing screens so the preview a studio sees
// before issuing matches the invoice that is saved.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const money=(minor,currency)=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);}catch{return `${(minor/100).toFixed(2)} ${currency}`;}};

// The words a client reads on the invoice before any fee is added.
export function lateFeeTerms(rule,currency){
 if(!rule)return '';
 const fee=rule.type==='percent'?`${rule.percent}% of the unpaid balance`:money(rule.amountMinor,currency);
 return `A late fee of ${fee} is added once, if this invoice is still unpaid ${rule.afterDays} ${rule.afterDays===1?'day':'days'} after the due date.`;
}

// `share` is this invoice's part of the estimate before any discount, with
// `shareNet` the part of it before tax. A discount comes off the price before
// tax and takes its share of the tax with it.
export function discountFor(input,{shareMinor,shareNetMinor}){
 if(input==null||input===''||input===false)return null;
 if(typeof input!=='object')fail(400,'Check the discount.');
 const reason=typeof input.reason==='string'?input.reason.trim().slice(0,60):'';
 if(input.reason!=null&&typeof input.reason!=='string')fail(400,'Check the discount reason.');
 if(shareNetMinor<=0)fail(400,'This invoice has no amount before tax to discount.');
 let netMinor,grossMinor,label;
 if(input.type==='percent'){
  const percent=input.percent;
  if(typeof percent!=='number'||!Number.isFinite(percent)||percent<=0||percent>=100)fail(400,'Use a discount percentage above 0 and below 100.');
  const rounded=Math.round(percent*100)/100;
  netMinor=Math.round(shareNetMinor*rounded/100);grossMinor=Math.round(shareMinor*rounded/100);label=`${rounded}% off`;
 }else if(input.type==='amount'){
  netMinor=input.amountMinor;
  if(!Number.isSafeInteger(netMinor)||netMinor<=0||netMinor>=shareNetMinor)fail(400,'Enter a discount above zero and below the amount before tax.');
  grossMinor=Math.round(shareMinor*netMinor/shareNetMinor);label='';
 }else fail(400,'Choose a percentage or fixed discount.');
 if(netMinor<=0||grossMinor<=0||grossMinor>=shareMinor)fail(400,'This discount is too small or too large for this invoice.');
 return {netMinor,grossMinor,label:[reason,label].filter(Boolean).join(' · ')||'Discount'};
}

// Tip suggestions are a share of the invoice amount, rounded to whole units.
export const tipPercents=[5,10,15];
export const tipFor=(amountMinor,percent)=>Math.round(amountMinor*percent/10000)*100;
