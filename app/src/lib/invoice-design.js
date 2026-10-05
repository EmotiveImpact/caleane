// One renderer for the styled invoice. The project billing view, the print /
// save-as-PDF output and the settings preview all use the same HTML, so what
// the studio designs is what the client sees and prints.

export const invoiceLayouts=[
 ['classic','Classic','Logo and details on top, ruled table, totals on the right.'],
 ['minimal','Minimal','Quiet type, lots of space, no fills.'],
 ['bold','Bold','A full-width band in your colour with the total up front.'],
];
export const invoiceFonts=[['sans','Modern sans'],['serif','Editorial serif']];
export const defaultInvoiceDesign={layout:'classic',accent:'',font:'sans',showLogo:true,thankYou:'Thank you for your business.',footer:''};

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=value=>escape(value).replace(/\n/g,'<br>');
const hex=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'';
const safeLogo=value=>{try{const url=new URL(value);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?url.toString():'';}catch{return '';}};
function readableOn(color){const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b>.4?'#141414':'#ffffff';}
const date=value=>value?new Date(String(value).slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';

export function normaliseInvoiceDesign(design){
 const d={...defaultInvoiceDesign,...(design||{})};
 return {layout:invoiceLayouts.some(([k])=>k===d.layout)?d.layout:'classic',accent:hex(d.accent),font:invoiceFonts.some(([k])=>k===d.font)?d.font:'sans',showLogo:d.showLogo!==false,thankYou:String(d.thankYou||'').slice(0,300),footer:String(d.footer||'').slice(0,500)};
}

function lineTitle(invoice){return invoice.label?`${invoice.label} towards project scope`:invoice.kind==='Deposit'?'Deposit towards project scope':invoice.kind==='Balance'?'Remaining project balance':'Agreed project scope';}

// Returns a complete HTML document (A4) for one issued invoice.
export function invoicePageHtml(invoice,{studio={},design}={}){
 const d=normaliseInvoiceDesign(design),s=invoice.snapshot||{},currency=invoice.currency||'GBP';
 const money=minor=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return ((Number(minor)||0)/100).toFixed(2)+' '+currency;}};
 const accent=d.accent||hex(studio.accent)||'#1f2a24',ink=readableOn(accent);
 const logo=d.showLogo?safeLogo(studio.branding?.logoUrl||studio.logoUrl):'';
 const seller=s.sellerName||studio.name||'';
 const brand=logo?`<img class="logo" src="${escape(logo)}" alt="${escape(seller)}">`:`<div class="wordmark">${escape(seller)}</div>`;
 const credited=invoice.creditedMinor||0,paid=invoice.grossPaidMinor??invoice.paidMinor??0,refunded=invoice.refundedMinor||0;
 const balance=invoice.balanceMinor??Math.max(0,(invoice.amountMinor||0)-credited-paid+refunded),refundDue=invoice.refundDueMinor||0;
 const stamp=['Paid','Cancelled','Refunded','Credited'].includes(invoice.status)?`<div class="stamp">${escape(invoice.status)}</div>`:'';
 const meta=[['Invoice number',invoice.number],['Issued',date(invoice.issuedAt)],['Due',date(invoice.dueDate)],['Service date',date(s.supplyDate)]].filter(([,v])=>v);
 const totals=[['Subtotal',money(invoice.netMinor)],[`Tax (${invoice.taxRate||0}%)`,money(invoice.taxMinor)],['Invoice total',money(invoice.amountMinor),'strong'],
  ...(credited?[['Credit notes','− '+money(credited)]]:[]),...(paid?[['Paid','− '+money(paid)]]:[]),...(refunded?[['Refunded','+ '+money(refunded)]]:[])];
 const due=refundDue?['Refund owed to you',money(refundDue)]:[invoice.status==='Cancelled'?'Cancelled':'Amount due',invoice.status==='Cancelled'?money(0):money(balance)];
 const fonts=d.font==='serif'?`'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`:`'Instrument Sans','Helvetica Neue',Arial,sans-serif`;
 const head=d.layout==='bold'
  ?`<header class="band"><div>${brand}<p class="kicker">Invoice</p><h1>${escape(invoice.number)}</h1></div><div class="band-total"><span>${escape(due[0])}</span><strong>${escape(due[1])}</strong><small>${invoice.dueDate?'Due '+escape(date(invoice.dueDate)):''}</small></div></header>`
  :`<header class="top"><div>${brand}</div><div class="title"><h1>Invoice</h1><p>${escape(invoice.number)}</p></div></header>`;
 return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Invoice ${escape(invoice.number)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff}
body{font-family:${fonts};color:#1d1f1e;font-size:13px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:794px;min-height:1123px;margin:0 auto;padding:64px 64px 120px;background:#fff;overflow:hidden}
.logo{display:block;max-width:180px;max-height:64px;object-fit:contain}.wordmark{font-size:20px;font-weight:600;letter-spacing:-.01em}
h1,h2,h3,p{margin:0}.kicker,.label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6c716d;font-weight:600}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:28px}
.title{text-align:right}.title h1{font-size:30px;font-weight:600;letter-spacing:-.02em;color:var(--accent)}.title p{color:#5c615d;margin-top:2px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:28px 0}.meta strong{display:block;font-size:13px;margin-top:4px;font-weight:600}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:36px}.parties strong{display:block;margin:6px 0 2px;font-size:14px}.parties p,.parties small{color:#4c514d;display:block}
table{width:100%;border-collapse:collapse}th{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6c716d;text-align:left;padding:0 0 10px;font-weight:600}th:last-child,td:last-child{text-align:right}
td{padding:16px 0;vertical-align:top}td small{display:block;color:#6c716d;margin-top:2px}
.totals{margin:24px 0 0 auto;width:300px}.totals div{display:flex;justify-content:space-between;padding:6px 0;color:#4c514d}.totals .strong{color:#1d1f1e;font-weight:600}
.due{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding:14px 0 0;border-top:2px solid var(--accent);font-size:16px;font-weight:700}.due strong{font-size:22px;color:var(--accent)}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:44px}.notes p{margin-top:6px;color:#3d423e;white-space:normal}
.pay{padding:18px 20px;border-radius:6px;background:var(--tint)}
.thanks{margin-top:44px;font-size:18px;color:var(--accent)}
footer{position:absolute;left:64px;right:64px;bottom:44px;padding-top:14px;border-top:1px solid #e3e5e2;font-size:10.5px;color:#6c716d;display:flex;justify-content:space-between;gap:24px}
.stamp{position:absolute;top:150px;right:52px;transform:rotate(-10deg);border:3px solid var(--accent);color:var(--accent);padding:6px 16px;font-size:22px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.75;border-radius:4px}
/* classic */
.classic .top{border-bottom:3px solid var(--accent)}.classic th{border-bottom:1px solid #1d1f1e}.classic td{border-bottom:1px solid #e3e5e2}
/* minimal */
.minimal .title h1{color:#1d1f1e;font-weight:400;font-size:34px}.minimal .meta{border-top:1px solid #e3e5e2;border-bottom:1px solid #e3e5e2;padding:18px 0}
.minimal td{border-top:1px solid #eef0ed}.minimal .due{border-top:1px solid #1d1f1e}.minimal .due strong{color:#1d1f1e}.minimal .pay{background:none;padding:0}.minimal .thanks{color:#1d1f1e}
/* bold */
.bold{padding-top:0}.band{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:0 -64px;padding:56px 64px 40px;background:var(--accent);color:var(--ink)}
.band .logo{filter:${ink==='#ffffff'?'brightness(0) invert(1)':'none'};margin-bottom:28px}.band .wordmark{margin-bottom:28px}.band .kicker{color:inherit;opacity:.75}.band h1{font-size:34px;font-weight:700;letter-spacing:-.02em}
.band-total{text-align:right}.band-total span,.band-total small{display:block;opacity:.8;font-size:12px}.band-total strong{display:block;font-size:34px;line-height:1.1;margin:4px 0}
.bold th{background:var(--tint);padding:10px 12px}.bold td{padding:16px 12px;border-bottom:1px solid #e3e5e2}.bold .stamp{top:210px}
@media print{.page{margin:0}}
</style></head><body><main class="page ${d.layout}" style="--accent:${accent};--ink:${ink};--tint:${accent}14">
${stamp}${head}
<section class="meta">${meta.map(([k,v])=>`<div><span class="label">${escape(k)}</span><strong>${escape(v)}</strong></div>`).join('')}</section>
<section class="parties"><div><span class="label">From</span><strong>${escape(seller)}</strong><p>${lines(s.sellerAddress)}</p>${s.sellerContact?`<small>${escape(s.sellerContact)}</small>`:''}${s.taxRegistration?`<small>Tax registration: ${escape(s.taxRegistration)}</small>`:''}</div>
<div><span class="label">Bill to</span><strong>${escape(s.billToName)}</strong><p>${lines(s.customerAddress)}</p>${s.billToEmail?`<small>${escape(s.billToEmail)}</small>`:''}</div></section>
<table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td><strong>${escape(lineTitle(invoice))}</strong><small>${escape(s.projectTitle||'')}${invoice.estimateVersion?` · Estimate version ${escape(invoice.estimateVersion)}`:''}</small></td><td>${escape(money(invoice.netMinor))}</td></tr></tbody></table>
<section class="totals">${totals.map(([k,v,c])=>`<div class="${c||''}"><span>${escape(k)}</span><span>${escape(v)}</span></div>`).join('')}<div class="due"><span>${escape(due[0])}</span><strong>${escape(due[1])}</strong></div></section>
<section class="notes">${invoice.status!=='Cancelled'?`<div class="pay"><span class="label">How to pay</span><p>${lines(invoice.paymentInstructions||'Contact the studio for payment instructions.')}</p></div>`:'<div></div>'}${invoice.note?`<div><span class="label">Notes</span><p>${lines(invoice.note)}</p></div>`:'<div></div>'}</section>
${d.thankYou?`<p class="thanks">${escape(d.thankYou)}</p>`:''}
<footer><span>${lines(d.footer)}</span><span>${escape(invoice.number)}</span></footer>
</main></body></html>`;
}

// A believable invoice for previewing a design before any are issued.
export function sampleInvoice(studio={},defaults={}){
 const today=new Date().toISOString().slice(0,10),due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 return {number:'INV-2026-0042',kind:'Deposit',label:'Deposit',status:'Issued',currency:'GBP',amountMinor:54000,netMinor:45000,taxMinor:9000,taxRate:20,issuedAt:today,dueDate:due,estimateVersion:2,balanceMinor:54000,
  paymentInstructions:defaults.paymentInstructions||'Bank transfer to your studio account. Use the invoice number as the reference.',note:'',
  snapshot:{sellerName:studio.name||'Your studio',sellerAddress:defaults.sellerAddress||'12 Example Street\nLondon',sellerContact:defaults.sellerContact||'',taxRegistration:defaults.taxRegistration||'',billToName:'Amelia Taylor',customerAddress:'2 Elm Row\nLondon N1 1AA',billToEmail:'amelia@example.com',projectTitle:'Amelia’s wedding',supplyDate:'2027-06-12'}};
}
