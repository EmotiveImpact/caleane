// Costs, profit and simple reports. Shared by the server (which builds the report)
// and the browser (which labels it), so both agree on periods and categories.
// Every figure is net of VAT: VAT collected from clients and VAT paid on costs
// belong to HMRC, so they are reported on their own and never count as profit.
import {vatShare} from './vat.js';

export const EXPENSE_CATEGORIES=['Materials','Subcontractors','Travel','Equipment','Software and subscriptions','Venue and hire','Printing and production','Marketing','Other'];
export const REPORT_PERIODS=[['12m','Last 12 months'],['tax','This tax year'],['last-tax','Last tax year'],['year','This calendar year']];

const pad=n=>String(n).padStart(2,'0');
const day=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const isDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);

// UK tax years run 6 April to 5 April.
export function periodRange(period,today){
 const [y,m,d]=today.split('-').map(Number);
 const taxStart=(m>4||(m===4&&d>=6))?y:y-1;
 if(period==='tax')return {period,from:day(taxStart,4,6),to:today};
 if(period==='last-tax')return {period,from:day(taxStart-1,4,6),to:day(taxStart,4,5)};
 if(period==='year')return {period,from:day(y,1,1),to:today};
 const start=new Date(Date.UTC(y,m-1-11,1));
 return {period:'12m',from:day(start.getUTCFullYear(),start.getUTCMonth()+1,1),to:today};
}

export function monthsBetween(from,to){
 const out=[];let [y,m]=from.split('-').map(Number);const [ty,tm]=to.split('-').map(Number);
 while(y<ty||(y===ty&&m<=tm)){out.push(`${y}-${pad(m)}`);m++;if(m>12){m=1;y++;}}
 return out;
}

const isOpen=invoice=>invoice.status==='Issued'||invoice.status==='Partially paid';
const balance=invoice=>invoice.balanceMinor??Math.max(0,invoice.amountMinor-(invoice.paidMinor||0));
const invoiced=invoice=>invoice.status==='Cancelled'?0:(invoice.dueMinor??invoice.amountMinor);
const vatOf=(minor,share)=>Math.round(minor*share);
const costVat=cost=>Math.min(cost.amountMinor,Math.max(0,cost.vatMinor||0)),netCost=cost=>cost.amountMinor-costVat(cost);
const daysBetween=(a,b)=>Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000);
const margin=(profit,collected)=>collected>0?Math.round(profit/collected*100):null;

// invoices: invoice records as the ledger shows them (status, dueMinor, paidMinor, payments, refunds).
// expenses: {projectId,spentOn,category,amountMinor,vatMinor,currency}. opportunities: {source,stage,createdAt}.
// projects: {id,title,client}. Collected money is counted when it was received, net of refunds and VAT.
export function financeReport({invoices=[],expenses=[],opportunities=[],projects=[],period='12m',today}){
 const range=periodRange(period,today),inRange=value=>isDay(value)&&value>=range.from&&value<=range.to;
 const months=monthsBetween(range.from,range.to);
 const used=new Map();
 for(const item of invoices)used.set(item.currency,(used.get(item.currency)||0)+(item.amountMinor||0));
 for(const item of expenses)used.set(item.currency,(used.get(item.currency)||0)+item.amountMinor);
 const currencies=[...used.entries()].sort((a,b)=>b[1]-a[1]).map(([currency])=>currency);
 if(!currencies.length)currencies.push('GBP');
 const projectById=new Map(projects.map(project=>[project.id,project]));
 const byCurrency=currencies.map(currency=>{
  const monthRows=new Map(months.map(month=>[month,{month,invoicedMinor:0,collectedMinor:0,costsMinor:0,vatCollectedMinor:0,vatPaidMinor:0}]));
  const row=value=>monthRows.get(String(value||'').slice(0,7));
  const theseInvoices=invoices.filter(item=>item.currency===currency),theseCosts=expenses.filter(item=>item.currency===currency);
  for(const invoice of theseInvoices){
   const issued=String(invoice.issuedAt||'').slice(0,10),share=vatShare(invoice);
   if(inRange(issued))row(issued).invoicedMinor+=invoiced(invoice)-vatOf(invoiced(invoice),share);
   for(const payment of invoice.payments||[]){const at=String(payment.receivedAt||'').slice(0,10),vat=vatOf(payment.amountMinor,share);if(inRange(at)){row(at).collectedMinor+=payment.amountMinor-vat;row(at).vatCollectedMinor+=vat;}}
   for(const refund of invoice.refunds||[]){const at=String(refund.refundedAt||'').slice(0,10),vat=vatOf(refund.amountMinor,share);if(inRange(at)){row(at).collectedMinor-=refund.amountMinor-vat;row(at).vatCollectedMinor-=vat;}}
  }
  const categories=new Map();
  for(const cost of theseCosts)if(inRange(cost.spentOn)){const item=row(cost.spentOn);item.costsMinor+=netCost(cost);item.vatPaidMinor+=costVat(cost);categories.set(cost.category,(categories.get(cost.category)||0)+netCost(cost));}
  const monthly=[...monthRows.values()].map(item=>({...item,profitMinor:item.collectedMinor-item.costsMinor}));
  const totals=monthly.reduce((sum,item)=>({invoicedMinor:sum.invoicedMinor+item.invoicedMinor,collectedMinor:sum.collectedMinor+item.collectedMinor,costsMinor:sum.costsMinor+item.costsMinor,vatCollectedMinor:sum.vatCollectedMinor+item.vatCollectedMinor,vatPaidMinor:sum.vatPaidMinor+item.vatPaidMinor}),{invoicedMinor:0,collectedMinor:0,costsMinor:0,vatCollectedMinor:0,vatPaidMinor:0});
  totals.profitMinor=totals.collectedMinor-totals.costsMinor;totals.marginPercent=margin(totals.profitMinor,totals.collectedMinor);totals.vatDueMinor=totals.vatCollectedMinor-totals.vatPaidMinor;
  // Profit per project covers the whole life of each project, not just the period.
  const perProject=new Map(),entry=projectId=>perProject.get(projectId)||perProject.set(projectId,{projectId,invoicedMinor:0,collectedMinor:0,costsMinor:0,vatCollectedMinor:0}).get(projectId);
  for(const invoice of theseInvoices){const item=entry(invoice.projectId),share=vatShare(invoice),paid=invoice.paidMinor||0;item.invoicedMinor+=invoiced(invoice)-vatOf(invoiced(invoice),share);item.collectedMinor+=paid-vatOf(paid,share);item.vatCollectedMinor+=vatOf(paid,share);}
  let overheadsMinor=0;
  for(const cost of theseCosts){if(cost.projectId&&projectById.has(cost.projectId))entry(cost.projectId).costsMinor+=netCost(cost);else if(inRange(cost.spentOn))overheadsMinor+=netCost(cost);}
  const projectRows=[...perProject.values()].map(item=>{const project=projectById.get(item.projectId),profitMinor=item.collectedMinor-item.costsMinor;return {...item,title:project?.title||'Project unavailable',client:project?.client||'',profitMinor,marginPercent:margin(profitMinor,item.collectedMinor)};}).sort((a,b)=>b.collectedMinor-a.collectedMinor||b.costsMinor-a.costsMinor);
  const outstanding={notDueMinor:0,late30Minor:0,late60Minor:0,lateOver60Minor:0,totalMinor:0,openCount:0};
  for(const invoice of theseInvoices){
   if(!isOpen(invoice))continue;const amount=balance(invoice),late=invoice.dueDate?daysBetween(invoice.dueDate,today):0;
   outstanding.totalMinor+=amount;outstanding.openCount++;
   if(late<=0)outstanding.notDueMinor+=amount;else if(late<=30)outstanding.late30Minor+=amount;else if(late<=60)outstanding.late60Minor+=amount;else outstanding.lateOver60Minor+=amount;
  }
  return {currency,monthly,totals,projects:projectRows,overheadsMinor,categories:[...categories.entries()].map(([category,amountMinor])=>({category,amountMinor})).sort((a,b)=>b.amountMinor-a.amountMinor),outstanding};
 });
 const sources=new Map();
 for(const item of opportunities){
  const created=String(item.createdAt||'').slice(0,10);if(!inRange(created))continue;
  const key=item.source||'Unspecified',row=sources.get(key)||{source:key,enquiries:0,booked:0,lost:0,open:0};
  row.enquiries++;if(item.stage==='Won')row.booked++;else if(item.stage==='Lost')row.lost++;else row.open++;sources.set(key,row);
 }
 const enquiries=[...sources.values()].map(row=>({...row,bookingRate:Math.round(row.booked/row.enquiries*100)})).sort((a,b)=>b.enquiries-a.enquiries||b.booked-a.booked);
 return {...range,months,currencies,byCurrency,enquiries};
}

const csvCell=value=>'"'+String(value??'').replace(/^[\s]*[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
const decimal=minor=>((Number(minor)||0)/100).toFixed(2);
export function expensesCSV(expenses,projectTitle=()=>''){
 const rows=[['Date','Description','Supplier','Category','Project','Currency','Amount','VAT','Receipt']];
 for(const item of expenses)rows.push([item.spentOn,item.description,item.supplier,item.category,item.projectId?projectTitle(item.projectId):'Studio overhead',item.currency,decimal(item.amountMinor),decimal(item.vatMinor),item.receipt?'Yes':'No']);
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function monthlyReportCSV(section){
 const rows=[['Month','Currency','Invoiced (net)','Collected (net)','Costs (net)','Profit','VAT collected','VAT on costs']];
 for(const item of section.monthly)rows.push([item.month,section.currency,decimal(item.invoicedMinor),decimal(item.collectedMinor),decimal(item.costsMinor),decimal(item.profitMinor),decimal(item.vatCollectedMinor),decimal(item.vatPaidMinor)]);
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
