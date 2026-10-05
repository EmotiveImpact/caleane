// One renderer for the styled invoice. The project billing view, the client's
// view, Print or save PDF and the settings preview all use the same HTML, so
// what the studio designs is what the client sees and prints.
import {brandStyle,readableOn} from './brand-kit.js';

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

function lineTitle(invoice){return invoice.label?`${invoice.label} towards project scope`:invoice.kind==='Deposit'?'Deposit towards project scope':invoice.kind==='Balance'?'Remaining project balance':'Agreed project scope';}

// Returns a complete HTML document (A4) for one issued invoice. `estimate` is
// the confirmed estimate version the invoice was raised against, if known.
export function invoicePageHtml(invoice,{studio={},design,brandKit,estimate}={}){
 const d=normaliseInvoiceDesign(design),s=invoice.snapshot||{},currency=invoice.currency||'GBP';
 const money=minor=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return ((Number(minor)||0)/100).toFixed(2)+' '+currency;}};
 const brand=brandStyle(brandKit,{fallbackAccent:studio.accent});
 const accent=d.accent||brand.primary,onAccent=readableOn(accent),secondary=brand.secondary||mix(accent,12);
 const ink=brand.ink,paper=brand.paper;
 const fonts=d.font==='brand'?{heading:brand.heading,body:brand.body}:d.font==='serif'?{heading:`'Cormorant Garamond','Iowan Old Style',Georgia,serif`,body:`'EB Garamond','Iowan Old Style',Georgia,serif`}:{heading:`'Inter','Helvetica Neue',Arial,sans-serif`,body:`'Inter','Helvetica Neue',Arial,sans-serif`};
 const fontLink=d.font==='brand'?brand.fontLink:d.font==='serif'?'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=EB+Garamond:wght@400;600&display=swap':'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
 const seller=s.sellerName||studio.name||'';
 const darkBand=['bold','studio'].includes(d.layout);
 const pick=d.showLogo?(darkBand&&onAccent==='#ffffff'?(brand.lightLogo||brand.logo):brand.logo)||safeImage(studio.branding?.logoUrl||studio.logoUrl):'';
 const logo=safeImage(pick),invertLogo=darkBand&&onAccent==='#ffffff'&&!brand.lightLogo;
 const mark=logo?`<img class="logo${invertLogo?' invert':''}" src="${escape(logo)}" alt="${escape(seller)}">`:`<div class="wordmark">${escape(seller)}</div>`;
 const credited=invoice.creditedMinor||0,paid=invoice.grossPaidMinor??invoice.paidMinor??0,refunded=invoice.refundedMinor||0;
 const balance=invoice.balanceMinor??Math.max(0,(invoice.amountMinor||0)-credited-paid+refunded),refundDue=invoice.refundDueMinor||0;
 const cancelled=invoice.status==='Cancelled';
 const stamp=['Paid','Cancelled','Refunded','Credited'].includes(invoice.status)?`<div class="stamp">${escape(invoice.status)}</div>`:'';
 const due=refundDue?['Refund owed to you',money(refundDue)]:[cancelled?'Cancelled':balance===0&&paid>0?'Paid in full':'Amount due',money(cancelled?0:balance)];
 const meta=[['Issued',date(invoice.issuedAt)],['Due',date(invoice.dueDate)],['Service date',date(s.supplyDate)]].filter(([,v])=>v);
 const metaHtml=`<dl class="meta">${meta.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>`;
 const from=`<div class="party"><span class="label">From</span><strong>${escape(seller)}</strong><p>${lines(s.sellerAddress)}</p>${s.sellerContact?`<small>${escape(s.sellerContact)}</small>`:''}${s.taxRegistration?`<small>VAT / tax no. ${escape(s.taxRegistration)}</small>`:''}</div>`;
 const to=`<div class="party"><span class="label">Billed to</span><strong>${escape(s.billToName)}</strong><p>${lines(s.customerAddress)}</p>${s.billToEmail?`<small>${escape(s.billToEmail)}</small>`:''}</div>`;
 const items=d.showItems&&Array.isArray(estimate?.items)&&estimate.items.length?estimate.items:null;
 const isPart=items&&estimate.total&&estimate.total!==invoice.amountMinor;
 const share=isPart?Math.round(invoice.amountMinor/estimate.total*1000)/10:100;
 const table=items
  ?`<table class="items"><thead><tr><th>${isPart?'Project scope':'Description'}</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>${items.map(item=>`<tr><td>${escape(item.title)}</td><td class="num">${escape(item.quantity)}</td><td class="num">${escape(money(item.unitAmount))}</td><td class="num">${escape(money(item.quantity*item.unitAmount))}</td></tr>`).join('')}</tbody>${isPart?`<tfoot><tr><td colspan="3">Project total${estimate.taxRate?` including ${escape(estimate.taxRate)}% tax`:''}</td><td class="num">${escape(money(estimate.total))}</td></tr><tr class="this"><td colspan="3"><strong>${escape(lineTitle(invoice))}</strong><small>${escape(share)}% of the project total</small></td><td class="num"><strong>${escape(money(invoice.amountMinor))}</strong></td></tr></tfoot>`:''}</table>`
  :`<table class="items"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody><tr><td><strong>${escape(lineTitle(invoice))}</strong><small>${escape(s.projectTitle||'')}${invoice.estimateVersion?` · Estimate version ${escape(invoice.estimateVersion)}`:''}</small></td><td class="num">${escape(money(invoice.netMinor))}</td></tr></tbody></table>`;
 const totals=[['Subtotal',money(invoice.netMinor)],[`Tax (${invoice.taxRate||0}%)`,money(invoice.taxMinor)],['Invoice total',money(invoice.amountMinor),'strong'],
  ...(credited?[['Credit notes','− '+money(credited)]]:[]),...(paid?[['Paid','− '+money(paid)]]:[]),...(refunded?[['Refunded','+ '+money(refunded)]]:[])];
 const totalsHtml=`<section class="totals">${totals.map(([k,v,c])=>`<div class="${c||''}"><span>${escape(k)}</span><span>${escape(v)}</span></div>`).join('')}<div class="due"><span>${escape(due[0])}</span><strong>${escape(due[1])}</strong></div></section>`;
 const pay=!cancelled?`<div class="pay"><span class="label">How to pay</span><p>${lines(invoice.paymentInstructions||'Contact the studio for payment instructions.')}</p>${invoice.dueDate&&balance>0?`<p class="pay-by">Please pay by ${escape(date(invoice.dueDate))}, quoting ${escape(invoice.number)}.</p>`:''}</div>`:'';
 const note=invoice.note?`<div class="note"><span class="label">Notes</span><p>${lines(invoice.note)}</p></div>`:'';
 const project=s.projectTitle?`<p class="project"><span class="label">Project</span>${escape(s.projectTitle)}</p>`:'';
 const thanks=d.thankYou?`<p class="thanks">${escape(d.thankYou)}</p>`:'';
 const footer=`<footer><span>${lines(d.footer)}</span><span>${escape(seller)} · ${escape(invoice.number)}</span></footer>`;
 const body={
  atelier:`<header class="masthead">${mark}<p class="kicker">Invoice</p><h1>${escape(invoice.number)}</h1></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  studio:`<aside class="rail">${mark}<p class="kicker">Invoice</p><h1>${escape(invoice.number)}</h1><div class="rail-due"><span>${escape(due[0])}</span><strong>${escape(due[1])}</strong></div>${metaHtml}${pay}</aside><div class="main"><section class="parties">${to}${from}</section>${project}${table}${totalsHtml}${note}${thanks}</div>`,
  editorial:`<header class="display"><h1>Invoice</h1><div>${mark}<p>${escape(invoice.number)}</p></div></header>${metaHtml}<section class="parties">${to}${from}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  bold:`<header class="band"><div>${mark}<p class="kicker">Invoice</p><h1>${escape(invoice.number)}</h1></div><div class="band-total"><span>${escape(due[0])}</span><strong>${escape(due[1])}</strong>${invoice.dueDate&&!cancelled&&balance>0?`<small>Due ${escape(date(invoice.dueDate))}</small>`:''}</div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  classic:`<header class="top"><div>${mark}</div><div class="title"><h1>Invoice</h1><p>${escape(invoice.number)}</p></div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
  minimal:`<header class="top"><div>${mark}</div><div class="title"><h1>Invoice</h1><p>${escape(invoice.number)}</p></div></header>${metaHtml}<section class="parties">${from}${to}</section>${project}${table}${totalsHtml}<section class="notes">${pay}${note}</section>${thanks}`,
 }[d.layout];
 return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Invoice ${escape(invoice.number)}</title><style>${brand.fontCss&&d.font==='brand'?brand.fontCss:''}
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:${paper}}
body{font-family:${fonts.body};color:${ink};font-size:12.5px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-feature-settings:'tnum' 1,'lnum' 1}
h1,h2,h3,p,dl,dd{margin:0}h1,.wordmark,.thanks,.due strong,.kicker{font-family:${fonts.heading}}
.page{position:relative;display:flex;flex-direction:column;width:794px;min-height:1123px;margin:0 auto;padding:60px 64px 40px;background:${paper};overflow:hidden}
.logo{display:block;max-width:190px;max-height:72px;object-fit:contain}.logo.invert{filter:brightness(0) invert(1)}
.wordmark{font-size:22px;font-weight:600;letter-spacing:.02em}
.label,.meta dt,th{font-family:${fonts.body};font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:color-mix(in srgb,${ink} 55%,${paper})}
.kicker{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:${accent}}
.meta{display:grid;grid-template-columns:repeat(${meta.length},1fr);gap:16px;margin:30px 0}.meta dd{font-weight:600;margin-top:5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-bottom:28px}.party strong{display:block;margin:6px 0 2px;font-size:14px}.party p,.party small{display:block;color:color-mix(in srgb,${ink} 75%,${paper})}
.project{margin:0 0 18px;font-size:14px}.project .label{display:block;margin-bottom:4px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:0 0 10px}td{padding:13px 0;vertical-align:top;border-bottom:1px solid color-mix(in srgb,${ink} 10%,${paper})}
.num{text-align:right;white-space:nowrap;padding-left:16px}td small{display:block;color:color-mix(in srgb,${ink} 55%,${paper});margin-top:2px;font-size:11px}
tfoot td{border-bottom:0;padding:10px 0 4px;color:color-mix(in srgb,${ink} 70%,${paper})}tfoot tr:first-child td{padding-top:14px}
tfoot tr.this td{color:${ink};padding:12px 14px;background:${secondary}}tfoot tr.this td:first-child{border-radius:4px 0 0 4px}tfoot tr.this td:last-child{border-radius:0 4px 4px 0}
.totals{margin:26px 0 0 auto;width:310px}.totals div{display:flex;justify-content:space-between;padding:5px 0;color:color-mix(in srgb,${ink} 72%,${paper})}.totals .strong{color:${ink};font-weight:600}
.due{align-items:baseline;margin-top:10px;padding:14px 0 0!important;border-top:2px solid ${accent};color:${ink}!important;font-weight:600;font-size:14px}.due strong{font-size:26px;color:${accent};font-weight:600}
.notes{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;margin-top:40px}.notes p,.note p{margin-top:6px}
.pay{padding:18px 20px;border-radius:6px;background:${secondary}}.pay-by{font-size:11.5px;color:color-mix(in srgb,${ink} 65%,${paper})}
.thanks{margin-top:40px;font-size:22px;color:${accent}}
footer{margin-top:auto;padding-top:26px;font-size:10px;color:color-mix(in srgb,${ink} 55%,${paper});display:flex;justify-content:space-between;gap:24px}footer span:first-child{max-width:70%}footer span:last-child{white-space:nowrap}
.stamp{position:absolute;top:190px;right:46px;transform:rotate(-9deg);border:3px solid ${accent};color:${accent};padding:6px 16px;font:700 20px ${fonts.heading};letter-spacing:.18em;text-transform:uppercase;opacity:.7;border-radius:4px}
/* atelier */
.atelier .masthead{text-align:center;padding-bottom:26px;border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper})}.atelier .masthead .logo{margin:0 auto 26px}.atelier .masthead .wordmark{margin-bottom:22px;font-size:26px}
.atelier h1{font-size:30px;font-weight:400;margin-top:8px;letter-spacing:.02em}.atelier .meta{text-align:center;padding-bottom:26px;border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper})}
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
.editorial .display{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:22px;border-bottom:4px solid ${ink}}.editorial .display h1{font-size:84px;line-height:.9;font-weight:400;letter-spacing:-.03em}
.editorial .display>div{text-align:right}.editorial .display .logo{margin-left:auto;margin-bottom:10px;max-height:56px}.editorial .display p{font-size:13px;letter-spacing:.12em}
.editorial .meta{border-bottom:1px solid color-mix(in srgb,${ink} 14%,${paper});padding-bottom:22px}.editorial th{border-bottom:2px solid ${ink}}.editorial .due strong{font-size:30px}.editorial .stamp{top:150px}
/* bold */
.bold{padding-top:0}.band{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:0 -64px;padding:52px 64px 38px;background:${accent};color:${onAccent}}
.band .logo,.band .wordmark{margin-bottom:26px}.band .kicker{color:inherit;opacity:.75}.band h1{font-size:34px;font-weight:700;letter-spacing:-.01em}
.band-total{text-align:right}.band-total span,.band-total small{display:block;opacity:.8;font-size:12px}.band-total strong{display:block;font:700 36px/1.1 ${fonts.heading};margin:4px 0}
.bold th{background:${secondary};padding:10px 12px}.bold td{padding:14px 12px}.bold tfoot td{padding-left:12px;padding-right:12px}.bold .stamp{top:220px}
/* classic */
.classic .top,.minimal .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:26px}.classic .top{border-bottom:3px solid ${accent}}
.title{text-align:right}.title h1{font-size:32px;font-weight:600;color:${accent}}.title p{color:color-mix(in srgb,${ink} 60%,${paper});margin-top:2px}.classic th{border-bottom:1px solid ${ink}}
/* minimal */
.minimal .title h1{color:${ink};font-weight:300;font-size:36px}.minimal .meta{border-top:1px solid color-mix(in srgb,${ink} 12%,${paper});border-bottom:1px solid color-mix(in srgb,${ink} 12%,${paper});padding:18px 0}
.minimal .due{border-top:1px solid ${ink}}.minimal .due strong{color:${ink}}.minimal .pay{background:none;padding:0}.minimal .thanks{color:${ink}}.minimal tfoot tr.this td{background:none;padding-left:0;padding-right:0;border-top:1px solid ${ink}}
@media print{.page{margin:0}}
</style></head><body><main class="page ${d.layout}">${stamp}${body}${footer}</main>${fontLink?`<link rel="stylesheet" href="${escape(fontLink)}">`:''}</body></html>`;
}

// A believable invoice for previewing a design before any are issued.
export function sampleInvoice(studio={},defaults={}){
 const today=new Date().toISOString().slice(0,10),due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 return {invoice:{number:'INV-2026-0042',kind:'Deposit',label:'Deposit',status:'Issued',currency:'GBP',amountMinor:76320,netMinor:63600,taxMinor:12720,taxRate:20,issuedAt:today,dueDate:due,estimateVersion:2,balanceMinor:76320,
  paymentInstructions:defaults.paymentInstructions||'Bank transfer to your studio account. Use the invoice number as the reference.',note:'',
  snapshot:{sellerName:studio.name||'Your studio',sellerAddress:defaults.sellerAddress||'12 Example Street\nLondon',sellerContact:defaults.sellerContact||'',taxRegistration:defaults.taxRegistration||'',billToName:'Amelia Taylor',customerAddress:'2 Elm Row\nLondon N1 1AA',billToEmail:'amelia@example.com',projectTitle:'Amelia’s wedding',supplyDate:'2027-06-12'}},
  estimate:{items:[{title:'Ceremony arch installation',quantity:1,unitAmount:65000},{title:'Floral table centrepieces',quantity:12,unitAmount:8500},{title:'Organic balloon garland, 4 metres',quantity:1,unitAmount:45000}],taxRate:20,total:254400}};
}
