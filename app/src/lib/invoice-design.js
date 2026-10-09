// One renderer for the styled invoice. The project billing view, the client's
// view, Print or save PDF and the settings preview all use the same HTML, so
// what the studio designs is what the client sees and prints.
import {brandStyle,readableOn} from './brand-kit.js';
import {lateFeeTerms} from './invoice-charges.js';
import {isVatDocument,isVatRegistered,lineVatLabel,showsTax,taxLabel,taxNumberLabel,vatGroupLabel} from './vat.js';
import {perUnit} from './price-units.js';

export const invoiceLayouts=[
 ['atelier','Atelier','Centred logo, fine rules and generous space.'],
 ['studio','Studio','A side panel in your colour with the key facts.'],
 ['editorial','Editorial','An oversized heading with magazine-style columns.'],
 ['bold','Bold','A full-width band in your colour with the total up front.'],
 ['classic','Classic','Logo on top, ruled table, totals on the right.'],
 ['minimal','Minimal','Quiet type and no fills.'],
];
export const invoiceFonts=[['brand','Brand kit fonts'],['sans','Modern sans'],['serif','Editorial serif']];
export const defaultInvoiceDesign={layout:'atelier',accent:'',font:'brand',showLogo:true,showItems:true,thankYou:'Thank you for your business.',footer:''};

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=value=>escape(value).replace(/\n/g,'<br>');
const hex=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'';
// Logos are either uploaded brand files (same-origin path) or an https URL.
const safeImage=value=>{if(/^\/api\/brand-assets\/[a-f0-9-]{36}$/.test(value||''))return value;try{const url=new URL(value);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?url.toString():'';}catch{return '';}};
const date=value=>value?new Date(String(value).slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';
const mix=(color,amount)=>`color-mix(in srgb, ${color} ${amount}%, white)`;

export function normaliseInvoiceDesign(design){
 const d={...defaultInvoiceDesign,...(design||{})};
 return {layout:invoiceLayouts.some(([k])=>k===d.layout)?d.layout:'atelier',accent:hex(d.accent),font:invoiceFonts.some(([k])=>k===d.font)?d.font:'brand',showLogo:d.showLogo!==false,showItems:d.showItems!==false,thankYou:String(d.thankYou||'').slice(0,300),footer:String(d.footer||'').slice(0,500)};
}

function lineTitle(invoice){return invoice.snapshot?.lines?invoice.label:invoice.label?`${invoice.label} towards project scope`:invoice.kind==='Deposit'?'Deposit towards project scope':invoice.kind==='Balance'?'Remaining project balance':'Agreed project scope';}

// Everything an invoice or credit note says, worked out once. The HTML page
// and the downloadable PDF both draw from this, so their figures always agree.
// With `creditNote`, the document is that credit note against the invoice.
export function invoiceModel(invoice,{studio={},design,brandKit,estimate,creditNote}={}){
 const d=normaliseInvoiceDesign(design),s=invoice.snapshot||{},currency=invoice.currency||'GBP',credit=creditNote||null;
 const money=minor=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return ((Number(minor)||0)/100).toFixed(2)+' '+currency;}};
 const brand=brandStyle(brandKit,{fallbackAccent:studio.accent});
 const accent=d.accent||brand.primary,onAccent=readableOn(accent),secondary=brand.secondary||mix(accent,12);
 const seller=s.sellerName||studio.name||'',vat=isVatDocument(s,currency);
 const darkBand=['bold','studio'].includes(d.layout);
 const pick=d.showLogo?(darkBand&&onAccent==='#ffffff'?(brand.lightLogo||brand.logo):brand.logo)||safeImage(studio.branding?.logoUrl||studio.logoUrl):'';
 const logo=safeImage(pick),invertLogo=darkBand&&onAccent==='#ffffff'&&!brand.lightLogo;
 const from={label:'From',name:seller,address:s.sellerAddress||'',small:[s.sellerContact,s.taxRegistration?`${taxNumberLabel(vat)} ${s.taxRegistration}`:''].filter(Boolean)};
 const to={label:credit?'Credited to':'Billed to',name:s.billToName||'',address:s.customerAddress||'',small:[s.billToEmail].filter(Boolean)};
 const base={d,brand,accent,onAccent,secondary,ink:brand.ink,paper:brand.paper,currency,money,seller,vat,logo,invertLogo,from,to,project:s.projectTitle||'',thanks:d.thankYou,footer:d.footer};
 if(credit){
  const tax=credit.taxMinor||0,rate=invoice.taxRate||0;
  return {...base,kind:'credit',label:'Credit note',number:credit.number,stamp:'',due:['Total credited',money(credit.amountMinor)],dueBy:'',
   meta:[['Issued',date(credit.issuedAt)],['Original invoice',invoice.number],['Invoice date',date(invoice.issuedAt)]].filter(([,v])=>v),
   table:{head:['Description','Amount'],rows:[[`Credit against invoice ${invoice.number}`,credit.reason||'',money(credit.netMinor)]]},
   totals:[['Net credit',money(credit.netMinor)],...(showsTax(rate,tax)||s.vatBreakdown&&tax?[[s.vatBreakdown?(vat?'VAT':'Tax'):taxLabel(rate,vat),money(tax)]]:[])],
   pay:null,note:`This credit note reduces invoice ${invoice.number}${invoice.issuedAt?`, issued ${date(invoice.issuedAt)},`:''} by ${money(credit.amountMinor)}.`};
 }
 const credited=invoice.creditedMinor||0,paid=invoice.grossPaidMinor??invoice.paidMinor??0,refunded=invoice.refundedMinor||0;
 const balance=invoice.balanceMinor??Math.max(0,(invoice.amountMinor||0)-credited-paid+refunded),refundDue=invoice.refundDueMinor||0;
 const cancelled=invoice.status==='Cancelled';
 const due=refundDue?['Refund owed to you',money(refundDue)]:[cancelled?'Cancelled':balance===0&&paid>0?'Paid in full':'Amount due',money(cancelled?0:balance)];
 // A quick invoice always lists its own lines; an estimate invoice lists the estimate's when the design asks.
 const own=Array.isArray(s.lines?.items)&&s.lines.items.length?s.lines.items:null;
 const items=own||(d.showItems&&Array.isArray(estimate?.items)&&estimate.items.length?estimate.items:null);
 const shareMinor=invoice.shareMinor??invoice.amountMinor,discountNet=invoice.discountNetMinor||0;
 const isPart=!own&&!!(items&&estimate.total&&estimate.total!==shareMinor);
 const share=isPart?Math.round(shareMinor/estimate.total*1000)/10:100;
 // On an invoice at more than one VAT rate, each line says which rate it is at.
 const mixed=Array.isArray(s.vatBreakdown),lineRate=own?s.lines.taxRate:estimate?.taxRate;
 const table=items
  ?{head:[isPart?'Project scope':'Description','Qty','Unit','Amount'],rows:items.map(item=>[item.title,[perUnit(item.unit),mixed?lineVatLabel(item,lineRate,vat):''].filter(Boolean).join(' · '),String(item.quantity),money(item.unitAmount),money(item.quantity*item.unitAmount)]),
    part:isPart?{total:[`Project total${mixed?` including ${vat?'VAT':'tax'}`:estimate.taxRate?` including ${estimate.taxRate}% ${vat?'VAT':'tax'}`:''}`,money(estimate.total)],line:[lineTitle(invoice),`${share}% of the project total`,money(invoice.amountMinor)]}:null}
  :{head:['Description','Amount'],rows:[[lineTitle(invoice),`${s.projectTitle||''}${invoice.estimateVersion?` · Estimate version ${invoice.estimateVersion}`:''}`,money(invoice.netMinor)]]};
 const charges=(invoice.charges||[]).filter(item=>!item.waivedAt);
 const totals=[...(discountNet?[['Subtotal',money(invoice.netMinor+discountNet)],[invoice.discountLabel||'Discount','− '+money(discountNet)],['Net',money(invoice.netMinor)]]:[['Subtotal',money(invoice.netMinor)]]),...(mixed?s.vatBreakdown.map(group=>[`${vatGroupLabel(group,vat)} on ${money(group.netMinor)}`,money(group.taxMinor)]):showsTax(invoice.taxRate,invoice.taxMinor)?[[taxLabel(invoice.taxRate,vat),money(invoice.taxMinor)]]:[]),['Invoice total',money(invoice.amountMinor),'strong'],
  ...charges.map(item=>[item.kind==='tip'?'Tip, thank you':`${item.label}, added ${date(item.addedAt)}`,'+ '+money(item.amountMinor)]),
  ...(credited?[['Credit notes','− '+money(credited)]]:[]),...(paid?[['Paid','− '+money(paid)]]:[]),...(refunded?[['Refunded','+ '+money(refunded)]]:[])];
 const terms=invoice.lateFeeRule&&!cancelled&&balance>0&&!charges.some(item=>item.kind==='late_fee')?lateFeeTerms(invoice.lateFeeRule,currency):'';
 // Payment details only appear while the client still owes something; a paid, credited or refunded invoice has nothing to pay.
 const pay=cancelled||balance<=0||refundDue?null:{text:invoice.paymentInstructions||'Contact the studio for payment instructions.',by:invoice.dueDate&&balance>0?`Please pay by ${date(invoice.dueDate)}, quoting ${invoice.number}.`:'',terms};
 return {...base,kind:'invoice',label:'Invoice',number:invoice.number,stamp:['Paid','Cancelled','Refunded','Credited'].includes(invoice.status)?invoice.status:'',due,dueBy:invoice.dueDate&&!cancelled&&balance>0?`Due ${date(invoice.dueDate)}`:'',
  meta:[['Issued',date(invoice.issuedAt)],['Due',date(invoice.dueDate)],['Service date',date(s.supplyDate)]].filter(([,v])=>v),table,totals,pay,note:invoice.note||''};
}

// Returns a complete HTML document (A4) for one issued invoice, or one of its
// credit notes. `estimate` is the confirmed estimate the invoice was raised against, if known.
export function invoicePageHtml(invoice,options={}){
 const m=invoiceModel(invoice,options),{d,brand,accent,onAccent,secondary,ink,paper,meta}=m;
 const fonts=d.font==='brand'?{heading:brand.heading,body:brand.body}:d.font==='serif'?{heading:`'Cormorant Garamond','Iowan Old Style',Georgia,serif`,body:`'EB Garamond','Iowan Old Style',Georgia,serif`}:{heading:`'Inter','Helvetica Neue',Arial,sans-serif`,body:`'Inter','Helvetica Neue',Arial,sans-serif`};
 const fontLink=d.font==='brand'?brand.fontLink:d.font==='serif'?'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=EB+Garamond:wght@400;600&display=swap':'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
 const mark=m.logo?`<img class="logo${m.invertLogo?' invert':''}" src="${escape(m.logo)}" alt="${escape(m.seller)}">`:`<div class="wordmark">${escape(m.seller)}</div>`;
 const stamp=m.stamp?`<div class="stamp">${escape(m.stamp)}</div>`:'',label=escape(m.label),number=escape(m.number),due=m.due.map(escape);
 const metaHtml=`<dl class="meta">${meta.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>`;
 const party=p=>`<div class="party"><span class="label">${escape(p.label)}</span><strong>${escape(p.name)}</strong><p>${lines(p.address)}</p>${p.small.map(line=>`<small>${escape(line)}</small>`).join('')}</div>`;
 const from=party(m.from),to=party(m.to),t=m.table;
 const table=t.head.length===4
  ?`<table class="items"><thead><tr>${t.head.map((h,i)=>`<th${i?' class="num"':''}>${escape(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(([title,detail,qty,unit,amount])=>`<tr><td>${escape(title)}${detail?`<small class="unit">${escape(detail)}</small>`:''}<small class="each">${escape(qty)} × ${escape(unit)}${detail?` ${escape(detail)}`:''}</small></td><td class="num">${escape(qty)}</td><td class="num">${escape(unit)}</td><td class="num">${escape(amount)}</td></tr>`).join('')}</tbody>${t.part?`<tfoot><tr><td colspan="3">${escape(t.part.total[0])}</td><td class="num">${escape(t.part.total[1])}</td></tr><tr class="this"><td colspan="3"><strong>${escape(t.part.line[0])}</strong><small>${escape(t.part.line[1])}</small></td><td class="num"><strong>${escape(t.part.line[2])}</strong></td></tr></tfoot>`:''}</table>`
  :`<table class="items"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${t.rows.map(([title,detail,amount])=>`<tr><td><strong>${escape(title)}</strong><small>${escape(detail)}</small></td><td class="num">${escape(amount)}</td></tr>`).join('')}</tbody></table>`;
 const totalsHtml=`<section class="totals">${m.totals.map(([k,v,c])=>`<div class="${c||''}"><span>${escape(k)}</span><span>${escape(v)}</span></div>`).join('')}<div class="due"><span>${due[0]}</span><strong>${due[1]}</strong></div></section>`;
 const pay=m.pay?`<div class="pay"><span class="label">How to pay</span><p>${lines(m.pay.text)}</p>${m.pay.by?`<p class="pay-by">${escape(m.pay.by)}</p>`:''}${m.pay.terms?`<p class="pay-by">${escape(m.pay.terms)}</p>`:''}</div>`:'';
 const note=m.note?`<div class="note"><span class="label">${m.kind==='credit'?'About this credit':'Notes'}</span><p>${lines(m.note)}</p></div>`:'';
 const project=m.project?`<p class="project"><span class="label">Project</span>${escape(m.project)}</p>`:'';
 const thanks=m.thanks&&m.kind==='invoice'?`<p class="thanks">${escape(m.thanks)}</p>`:'';
 const footer=`<footer><span>${lines(m.footer)}</span><span>${escape(m.seller)} · ${number}</span></footer>`;
 const body={
  atelier:`<header class="masthead">${mark}<p class="kicker">${label}</p><h1>${number}</h1></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  studio:`<aside class="rail">${mark}<p class="kicker">${label}</p><h1>${number}</h1><div class="rail-due"><span>${due[0]}</span><strong>${due[1]}</strong></div>${metaHtml}${pay}</aside><div class="main"><section class="parties">${to}${from}</section>${project}${table}${totalsHtml}${note}${thanks}</div>`,
  editorial:`<header class="display"><h1>${label}</h1><div>${mark}<p>${number}</p></div></header>${metaHtml}<section class="parties">${to}${from}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  bold:`<header class="band"><div>${mark}<p class="kicker">${label}</p><h1>${number}</h1></div><div class="band-total"><span>${due[0]}</span><strong>${due[1]}</strong>${m.dueBy?`<small>${escape(m.dueBy)}</small>`:''}</div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  classic:`<header class="top"><div>${mark}</div><div class="title"><h1>${label}</h1><p>${number}</p></div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  minimal:`<header class="top"><div>${mark}</div><div class="title"><h1>${label}</h1><p>${number}</p></div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
 }[d.layout];
 return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${label} ${number}</title><style>${brand.fontCss&&d.font==='brand'?brand.fontCss:''}
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:${paper}}
body{font-family:${fonts.body};color:${ink};font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-feature-settings:'tnum' 1,'lnum' 1}
h1,h2,h3,p,dl,dd{margin:0}h1,.wordmark,.thanks,.due strong,.kicker{font-family:${fonts.heading}}
.page{position:relative;display:flex;flex-direction:column;width:794px;min-height:1123px;margin:0 auto;padding:48px 60px 30px;background:${paper};overflow:hidden}
.logo{display:block;max-width:190px;max-height:64px;object-fit:contain}.logo.invert{filter:brightness(0) invert(1)}
.wordmark{font-size:22px;font-weight:600;letter-spacing:.02em}
.label,.meta dt,th{font-family:${fonts.body};font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:color-mix(in srgb,${ink} 55%,${paper})}
.kicker{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:${accent}}
.meta{display:grid;grid-template-columns:repeat(${meta.length},1fr);gap:16px;margin:16px 0}.meta dd{font-weight:600;margin-top:5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-bottom:18px}.party strong{display:block;margin:6px 0 2px;font-size:14px}.party p,.party small{display:block;color:color-mix(in srgb,${ink} 75%,${paper})}
.project{margin:0 0 12px;font-size:14px}.project .label{display:block;margin-bottom:4px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:0 0 8px}td{padding:9px 0;vertical-align:top;border-bottom:1px solid color-mix(in srgb,${ink} 10%,${paper})}
.num{text-align:right;white-space:nowrap;padding-left:16px}td small{display:block;color:color-mix(in srgb,${ink} 55%,${paper});margin-top:2px;font-size:11px}td small.each{display:none}
tfoot td{border-bottom:0;padding:8px 0 3px;color:color-mix(in srgb,${ink} 70%,${paper})}tfoot tr:first-child td{padding-top:10px}
tfoot tr.this td{color:${ink};padding:9px 14px;background:${secondary}}tfoot tr.this td:first-child{border-radius:4px 0 0 4px}tfoot tr.this td:last-child{border-radius:0 4px 4px 0}
.totals{margin:16px 0 0 auto;width:310px}.totals div{display:flex;justify-content:space-between;padding:3px 0;color:color-mix(in srgb,${ink} 72%,${paper})}.totals .strong{color:${ink};font-weight:600}
.due{align-items:baseline;margin-top:8px;padding:10px 0 0!important;border-top:2px solid ${accent};color:${ink}!important;font-weight:600;font-size:14px}.due strong{font-size:26px;color:${accent};font-weight:600}
.notes{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;margin-top:20px}.notes p,.note p{margin-top:6px}
.pay{padding:14px 18px;border-radius:6px;background:${secondary}}.pay-by{font-size:11.5px;color:color-mix(in srgb,${ink} 65%,${paper})}
.thanks{margin-top:18px;font-size:19px;color:${accent}}
footer{margin-top:auto;padding-top:16px;font-size:10px;color:color-mix(in srgb,${ink} 55%,${paper});display:flex;justify-content:space-between;gap:24px}footer span:first-child{max-width:70%}footer span:last-child{white-space:nowrap}
.stamp{position:absolute;top:190px;right:46px;transform:rotate(-9deg);border:3px solid ${accent};color:${accent};padding:6px 16px;font:700 20px ${fonts.heading};letter-spacing:.18em;text-transform:uppercase;opacity:.7;border-radius:4px}
/* atelier */
.atelier .masthead{text-align:center;padding-bottom:14px;border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper})}.atelier .masthead .logo{margin:0 auto 12px}.atelier .masthead .wordmark{margin-bottom:10px;font-size:26px}
.atelier h1{font-size:26px;font-weight:400;margin-top:6px;letter-spacing:.02em}.atelier .meta{text-align:center;padding-bottom:14px;border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper})}
.atelier th{border-bottom:1px solid ${accent}}.atelier .thanks{text-align:center;font-style:italic}.atelier footer{justify-content:center;text-align:center;flex-direction:column;gap:4px}.atelier footer span:first-child{max-width:none}
/* studio */
.studio{flex-direction:row;padding:0}.rail{width:250px;flex:none;padding:56px 30px 40px;background:${accent};color:${onAccent};display:flex;flex-direction:column;gap:22px}
.rail .logo,.rail .wordmark{margin-bottom:14px}.rail .kicker{color:inherit;opacity:.75}.rail h1{font-size:24px;font-weight:600;margin-top:-14px}
.rail-due span,.rail-due small{display:block;font-size:11px;opacity:.8}.rail-due strong{display:block;font:600 30px/1.15 ${fonts.heading};margin:4px 0}
.rail .meta{display:grid;grid-template-columns:1fr;gap:12px;margin:0;padding-top:20px;border-top:1px solid color-mix(in srgb,${onAccent} 30%,transparent)}.rail .meta dt,.rail .label{color:inherit;opacity:.7}.rail .meta dd{margin-top:2px}
.rail .pay{background:color-mix(in srgb,${onAccent} 12%,transparent);margin-top:auto;font-size:11.5px}.rail .pay-by{color:inherit;opacity:.8}
.studio .main{flex:1;display:flex;flex-direction:column;padding:56px 48px 40px}.studio .main .totals{width:280px}.studio .note{margin-top:30px}.studio .stamp{top:56px;right:40px}
.studio footer{position:absolute;left:298px;right:48px;bottom:30px}
/* editorial */
.editorial .display{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:16px;border-bottom:4px solid ${ink}}.editorial .display h1{font-size:72px;line-height:.9;font-weight:400;letter-spacing:-.03em}
.editorial .display>div{text-align:right}.editorial .display .logo{margin-left:auto;margin-bottom:10px;max-height:56px}.editorial .display p{font-size:13px;letter-spacing:.12em}
.editorial .meta{border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper});padding-bottom:16px}.editorial th{border-bottom:2px solid ${ink}}.editorial .due strong{font-size:30px}.editorial .stamp{top:150px}
/* bold */
.bold{padding-top:0}.band{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:0 -60px;padding:32px 60px 24px;background:${accent};color:${onAccent}}
.band .logo,.band .wordmark{margin-bottom:12px}.band .kicker{color:inherit;opacity:.75}.band h1{font-size:30px;font-weight:700;letter-spacing:-.01em}
.band-total{text-align:right}.band-total span,.band-total small{display:block;opacity:.8;font-size:12px}.band-total strong{display:block;font:700 36px/1.1 ${fonts.heading};margin:4px 0}
.bold th{background:${secondary};padding:10px 12px}.bold td{padding:10px 12px}.bold tfoot td{padding-left:12px;padding-right:12px}.bold .stamp{top:220px}
/* classic */
.classic .top,.minimal .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px}.classic .top{border-bottom:3px solid ${accent}}
.title{text-align:right}.title h1{font-size:32px;font-weight:600;color:${accent}}.title p{color:color-mix(in srgb,${ink} 60%,${paper});margin-top:2px}.classic th{border-bottom:1px solid ${ink}}
/* minimal */
.minimal .title h1{color:${ink};font-weight:300;font-size:36px}.minimal .meta{border-top:1px solid color-mix(in srgb,${ink} 12%,${paper});border-bottom:1px solid color-mix(in srgb,${ink} 12%,${paper});padding:14px 0}
.minimal .due{border-top:1px solid ${ink}}.minimal .due strong{color:${ink}}.minimal .pay{background:none;padding:0}.minimal .thanks{color:${ink}}.minimal tfoot tr.this td{background:none;padding-left:0;padding-right:0;border-top:1px solid ${ink}}
/* On a screen narrower than the A4 page, such as a phone, the page reflows to fit instead of shrinking. Print keeps A4. */
@media screen and (max-width:793px){.page{width:auto;min-height:0;padding:32px 28px 24px}.page.bold{padding-top:0}.band{margin:0 -28px;padding:28px 28px 20px}.studio{padding:0}.studio .main{padding:32px 28px 24px}.studio footer{left:278px;right:28px}}
@media screen and (max-width:600px){
body{font-size:13px}.page{padding:24px 18px 20px}.page.bold{padding-top:0}.logo{max-width:150px;max-height:52px}
.meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.parties,.notes{grid-template-columns:minmax(0,1fr);gap:18px}.notes{margin-top:22px}
.totals,.studio .main .totals{width:100%}
.page>*{order:2}.page>:is(header,.rail){order:0}.page .stamp{position:static;order:1;align-self:flex-end;margin:14px 0 0;padding:4px 12px;font-size:15px;border-width:2px}
.items,.items thead,.items tbody,.items tfoot{display:block}.items tr{display:flex}.items :is(th,td):first-child{flex:1;min-width:0}
.items :is(th,td):is(:nth-child(2),:nth-child(3)):not(:last-child),.items td small.unit{display:none}.items td small.each{display:block}
footer{flex-direction:column;gap:4px}footer span:first-child{max-width:none}footer span:last-child{white-space:normal}
.editorial .display{align-items:flex-start}.editorial .display h1{font-size:46px}.editorial .due strong{font-size:26px}
.band{margin:0 -18px;padding:24px 18px 18px;flex-direction:column;align-items:flex-start;gap:14px}.band-total{text-align:left}.band-total strong{font-size:30px}.bold th{padding:8px 10px}.bold td{padding:9px 10px}
.title h1,.minimal .title h1{font-size:26px}.classic .top,.minimal .top{gap:14px}
.studio{flex-direction:column}.rail{width:auto;padding:24px 18px;gap:16px}.rail h1{margin-top:-8px}.rail .meta{grid-template-columns:repeat(2,minmax(0,1fr))}.rail .pay{margin-top:0}
.studio .main{padding:20px 18px 8px}.studio footer{position:static;padding:16px 18px 20px}.studio .stamp{margin:16px 18px -4px}
}
@media print{.page{margin:0;min-height:296.5mm}tr,.totals,.pay,.note,.parties{break-inside:avoid}}
</style></head><body><main class="page ${d.layout}${m.kind==='credit'?' credit-note':''}">${stamp}${body}${footer}</main>${fontLink?`<link rel="stylesheet" href="${escape(fontLink)}">`:''}</body></html>`;
}

// A believable invoice for previewing a design before any are issued. It
// follows the studio's VAT setting, so an unregistered studio sees no tax line.
export function sampleInvoice(studio={},defaults={}){
 const today=new Date().toISOString().slice(0,10),due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 const vat=isVatRegistered(defaults)||!Object.keys(defaults).length,rate=vat?Number(defaults.taxRate)||20:0,tax=Math.round(63600*rate/100);
 return {invoice:{number:'INV-2026-0042',kind:'Deposit',label:'Deposit',status:'Issued',currency:'GBP',amountMinor:63600+tax,netMinor:63600,taxMinor:tax,taxRate:rate,issuedAt:today,dueDate:due,estimateVersion:2,balanceMinor:63600+tax,
  paymentInstructions:defaults.paymentInstructions||'Bank transfer to your studio account. Use the invoice number as the reference.',note:'',
  snapshot:{sellerName:studio.name||'Your studio',sellerAddress:defaults.sellerAddress||'12 Example Street\nLondon',sellerContact:defaults.sellerContact||'',taxRegistration:vat?defaults.taxRegistration||'':'',vatRegistered:vat,billToName:'Amelia Taylor',customerAddress:'2 Elm Row\nLondon N1 1AA',billToEmail:'amelia@example.com',projectTitle:'Amelia’s wedding',supplyDate:'2027-06-12'}},
  estimate:{items:[{title:'Ceremony arch installation',quantity:1,unitAmount:65000},{title:'Floral table centrepieces',quantity:12,unitAmount:8500},{title:'Organic balloon garland, 4 metres',quantity:1,unitAmount:45000}],taxRate:rate,total:Math.round(212000*(100+rate)/100)}};
}
