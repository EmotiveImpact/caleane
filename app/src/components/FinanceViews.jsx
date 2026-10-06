import React,{useEffect,useMemo,useState} from 'react';
import {Download,Paperclip,Plus,Receipt} from 'lucide-react';
import {CollectionFilter} from './CollectionFilter';
import {useConfirm} from './ConfirmDialog';
import {EXPENSE_CATEGORIES,REPORT_PERIODS,expensesCSV,monthlyReportCSV} from '../lib/finance-report.js';
import './finance-views.css';

const money=(minor,currency='GBP')=>{
 try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}
 catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}
};
const date=value=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const monthName=value=>new Date(`${value}-15T12:00:00`).toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const percent=value=>value==null?'—':`${value}%`;
function download(name,content){const blob=new Blob(['﻿'+content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('That file could not be read.'));reader.readAsDataURL(file);});

function CostForm({expense,projects,studio,request,defaultProjectId='',onSaved,onDeleted,onCancel}){
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[removeReceipt,setRemoveReceipt]=useState(false),[confirm,confirmation]=useConfirm();
 const editing=!!expense;
 async function submit(event){
  event.preventDefault();setError('');
  const data=new FormData(event.currentTarget),amountMinor=Math.round(Number(data.get('amount'))*100),file=data.get('receipt');
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0){setError('Enter an amount above zero.');return;}
  if(file&&file.size>5*1024*1024){setError('Choose a receipt under 5 MB.');return;}
  const body={action:editing?'update':'create',id:expense?.id,spentOn:data.get('spentOn'),amountMinor,currency:data.get('currency'),category:data.get('category'),description:data.get('description'),supplier:data.get('supplier'),projectId:data.get('projectId')||'',removeReceipt};
  setSaving(true);
  try{
   if(file&&file.size)body.receipt={name:file.name,content:await readFile(file)};
   const result=await request(`/api/expenses?studio=${studio.id}`,'POST',body);onSaved(result.expense,result.expenses);
  }catch(err){setError(err.message);}finally{setSaving(false);}
 }
 async function remove(){
  if(!await confirm({title:'Delete this cost?',description:`${expense.description} for ${money(expense.amountMinor,expense.currency)} and any receipt attached to it will be removed from your books.`,confirmLabel:'Delete cost'}))return;
  setSaving(true);setError('');
  try{const result=await request(`/api/expenses?studio=${studio.id}`,'POST',{action:'delete',id:expense.id});onDeleted(expense.id,result.expenses);}catch(err){setError(err.message);setSaving(false);}
 }
 return <form className="billing-issue-form finance-cost-form" onSubmit={submit}>
  <div className="billing-form-heading"><div><h3>{editing?'Edit cost':'Record a cost'}</h3><p>Costs are private to the studio owner. Clients and project approvers never see them.</p></div><button type="button" className="billing-text-button" onClick={onCancel}>Close</button></div>
  <div className="billing-form-grid finance-form-grid">
   <label><span>What was it for</span><input name="description" maxLength="200" required defaultValue={expense?.description||''} placeholder="For example, florist deposit"/></label>
   <label><span>Supplier (optional)</span><input name="supplier" maxLength="120" defaultValue={expense?.supplier||''} placeholder="Who you paid"/></label>
   <label><span>Date</span><input name="spentOn" type="date" required defaultValue={expense?.spentOn||localToday()}/></label>
   <label><span>Amount paid</span><input name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" defaultValue={expense?(expense.amountMinor/100).toFixed(2):''} placeholder="0.00"/></label>
   <label><span>Currency</span><select name="currency" defaultValue={expense?.currency||'GBP'}>{['GBP','EUR','USD'].map(code=><option key={code}>{code}</option>)}</select></label>
   <label><span>Category</span><select name="category" defaultValue={expense?.category||EXPENSE_CATEGORIES[0]}>{EXPENSE_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label>
   <label className="finance-form-wide"><span>Project</span><select name="projectId" defaultValue={expense?.projectId??defaultProjectId}><option value="">Studio overhead (no project)</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}{project.brief?.name?` · ${project.brief.name}`:''}</option>)}</select></label>
   <label className="finance-form-wide"><span>Receipt (optional)</span><input name="receipt" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"/><small>{expense?.receipt&&!removeReceipt?<>Attached: {expense.receipt.name}. Choose a new file to replace it, or <button type="button" className="billing-text-button" onClick={()=>setRemoveReceipt(true)}>remove it</button>.</>:'A photo or PDF up to 5 MB. On a phone you can take the photo here.'}</small></label>
  </div>
  {error&&<p className="billing-error" role="alert">{error}</p>}
  <div className="billing-form-foot finance-form-foot"><button className="billing-primary" disabled={saving}>{saving?'Saving…':editing?'Save changes':'Save cost'}</button>{editing&&<button type="button" className="billing-text-button finance-delete" disabled={saving} onClick={remove}>Delete cost</button>}</div>
  {confirmation}
 </form>;
}

export function StudioCosts({projects,studio,request,openProject,readOnly=false}){
 const [expenses,setExpenses]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState(null),[query,setQuery]=useState(''),[projectFilter,setProjectFilter]=useState('all'),[category,setCategory]=useState('all');
 useEffect(()=>{let active=true;setLoading(true);request(`/api/expenses?studio=${studio.id}`).then(data=>{if(active){setExpenses(data.expenses||[]);setLoading(false);}}).catch(err=>{if(active){setError(err.message);setLoading(false);}});return()=>{active=false};},[studio.id,request]);
 const byId=useMemo(()=>new Map(projects.map(project=>[project.id,project])),[projects]);
 const visible=expenses.filter(item=>(projectFilter==='all'||(projectFilter==='overhead'?!item.projectId:item.projectId===projectFilter))&&(category==='all'||item.category===category)&&`${item.description} ${item.supplier} ${byId.get(item.projectId)?.title||''}`.toLowerCase().includes(query.toLowerCase()));
 const sums=Object.entries(visible.reduce((all,item)=>({...all,[item.currency]:(all[item.currency]||0)+item.amountMinor}),{}));
 const month=localToday().slice(0,7),thisMonth=Object.entries(expenses.filter(item=>item.spentOn.startsWith(month)).reduce((all,item)=>({...all,[item.currency]:(all[item.currency]||0)+item.amountMinor}),{}));
 const withReceipt=visible.filter(item=>item.receipt).length;
 const saved=(_,list)=>{setExpenses(list);setEditing(null);};
 return <section className="finance-panel" aria-label="Costs">
  <div className="studio-billing-ledger-head"><div><h2>Costs</h2><p>What the studio spends, with the receipt, set against a project or kept as an overhead.</p></div><div className="finance-head-actions"><button type="button" className="billing-outline" disabled={!visible.length} onClick={()=>download(`costs-${localToday()}.csv`,expensesCSV(visible,projectId=>byId.get(projectId)?.title||''))}><Download size={16}/> Export CSV</button>{!readOnly&&editing!=='new'&&<button type="button" className="billing-primary" onClick={()=>setEditing('new')}><Plus size={16}/> Record a cost</button>}</div></div>
  {editing==='new'&&<CostForm projects={projects} studio={studio} request={request} onSaved={saved} onCancel={()=>setEditing(null)}/>}
  <div className="studio-collection-controls finance-cost-controls"><div className="finance-selects"><label><span>Project</span><select value={projectFilter} onChange={event=>setProjectFilter(event.target.value)}><option value="all">All projects</option><option value="overhead">Studio overheads</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label><span>Category</span><select value={category} onChange={event=>setCategory(event.target.value)}><option value="all">All categories</option>{EXPENSE_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label></div><CollectionFilter label="Filter costs" value={query} onChange={setQuery} placeholder="Cost, supplier or project…"/></div>
  {!loading&&!error&&expenses.length>0&&<dl className="studio-billing-totals" aria-label="Totals for the costs shown"><div><dt>Costs shown</dt><dd>{visible.length}</dd></div><div><dt>Total</dt><dd>{sums.length?sums.map(([currency,total])=><span key={currency}>{money(total,currency)}</span>):'—'}</dd></div><div><dt>This month</dt><dd>{thisMonth.length?thisMonth.map(([currency,total])=><span key={currency}>{money(total,currency)}</span>):money(0)}</dd></div><div><dt>With a receipt</dt><dd>{withReceipt} of {visible.length}</dd></div></dl>}
  {loading?<p className="billing-loading" role="status">Loading costs…</p>:error?<p className="billing-error" role="alert">Costs could not be loaded: {error}</p>:visible.length?<div className="finance-cost-list">{visible.map(item=>{const project=byId.get(item.projectId);return editing===item.id?<CostForm key={item.id} expense={item} projects={projects} studio={studio} request={request} onSaved={saved} onDeleted={(_,list)=>{setExpenses(list);setEditing(null);}} onCancel={()=>setEditing(null)}/>:<div key={item.id} className="finance-cost-row">
   <button type="button" className="finance-cost-main" disabled={readOnly} onClick={()=>setEditing(item.id)} aria-label={readOnly?`${item.description}, ${money(item.amountMinor,item.currency)}`:`Edit ${item.description}, ${money(item.amountMinor,item.currency)}`}><span><strong>{item.description}</strong><small>{[item.supplier,date(item.spentOn)].filter(Boolean).join(' · ')}</small></span><span className="finance-cost-project">{project?<><strong>{project.title}</strong><small>{project.brief?.name||''}</small></>:<small>{item.projectId?'Project unavailable':'Studio overhead'}</small>}</span><span className="finance-chip">{item.category}</span><span className="finance-amount">{money(item.amountMinor,item.currency)}</span></button>
   {item.receipt?<a className="finance-receipt" href={`/api/expenses/${item.id}/receipt?studio=${studio.id}`} target="_blank" rel="noreferrer" title={`Open receipt: ${item.receipt.name}`}><Paperclip size={15}/><span>Receipt</span></a>:<span className="finance-receipt finance-receipt-missing"><span>No receipt</span></span>}
  </div>})}</div>:<div className="billing-empty"><Receipt size={26}/><h3>{expenses.length?'No costs match.':'No costs recorded yet.'}</h3><p>{expenses.length?'Try another project, category or search term.':'Record what you spend on materials, suppliers and travel to see the real profit on each project.'}</p></div>}
 </section>;
}

function Bars({rows,currency}){
 const max=Math.max(1,...rows.map(row=>Math.max(row.collectedMinor,row.costsMinor)));
 return <figure className="finance-bars"><figcaption><span className="finance-key finance-key-in">Collected</span><span className="finance-key finance-key-out">Costs</span></figcaption>
  <div className="finance-bars-plot" role="img" aria-label="Money collected and costs by month. The table below lists the same figures.">{rows.map(row=><div key={row.month} className="finance-bar-month" title={`${monthName(row.month)}: collected ${money(row.collectedMinor,currency)}, costs ${money(row.costsMinor,currency)}, profit ${money(row.profitMinor,currency)}`}><div className="finance-bar-pair"><span className="finance-bar finance-bar-in" style={{height:`${Math.max(0,row.collectedMinor)/max*100}%`}}/><span className="finance-bar finance-bar-out" style={{height:`${row.costsMinor/max*100}%`}}/></div><small>{monthName(row.month)}</small></div>)}</div></figure>;
}

export function StudioReports({projects,studio,request,openProject}){
 const [period,setPeriod]=useState('12m'),[report,setReport]=useState(null),[error,setError]=useState(''),[currency,setCurrency]=useState('');
 useEffect(()=>{let active=true;setError('');request(`/api/finance-report?studio=${studio.id}&period=${period}&today=${localToday()}`).then(data=>{if(active)setReport(data.report);}).catch(err=>{if(active)setError(err.message);});return()=>{active=false};},[studio.id,request,period]);
 const byId=useMemo(()=>new Map(projects.map(project=>[project.id,project])),[projects]);
 if(error)return <p className="billing-error" role="alert">Reports could not be loaded: {error}</p>;
 if(!report)return <p className="billing-loading" role="status">Building your reports…</p>;
 const section=report.byCurrency.find(item=>item.currency===currency)||report.byCurrency[0],c=section.currency,t=section.totals,o=section.outstanding;
 const costMax=Math.max(1,...section.categories.map(item=>item.amountMinor));
 return <section className="finance-panel" aria-label="Reports">
  <div className="studio-billing-ledger-head"><div><h2>Reports</h2><p>{date(report.from)} to {date(report.to)}. Money is counted on the day it was received, less any refunds.</p></div><button type="button" className="billing-outline" onClick={()=>download(`monthly-report-${c}-${report.from}.csv`,monthlyReportCSV(section))}><Download size={16}/> Export CSV</button></div>
  <div className="studio-collection-controls"><div className="studio-billing-filters" role="group" aria-label="Report period">{REPORT_PERIODS.map(([value,label])=><button key={value} type="button" aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</div>{report.currencies.length>1&&<label className="finance-currency"><span>Currency</span><select value={c} onChange={event=>setCurrency(event.target.value)}>{report.currencies.map(code=><option key={code}>{code}</option>)}</select></label>}</div>
  <dl className="studio-billing-totals finance-kpis"><div><dt>Collected</dt><dd>{money(t.collectedMinor,c)}</dd></div><div><dt>Costs</dt><dd>{money(t.costsMinor,c)}</dd></div><div><dt>Profit</dt><dd className={t.profitMinor<0?'finance-negative':''}>{money(t.profitMinor,c)}</dd></div><div><dt>Margin</dt><dd>{percent(t.marginPercent)}</dd></div></dl>

  <div className="finance-card"><div className="finance-card-head"><h3>Revenue by month</h3><p>Invoiced {money(t.invoicedMinor,c)} in this period.</p></div><Bars rows={section.monthly} currency={c}/>
   <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th scope="col">Month</th><th scope="col" className="finance-hide-sm">Invoiced</th><th scope="col">Collected</th><th scope="col">Costs</th><th scope="col">Profit</th></tr></thead><tbody>{section.monthly.map(row=><tr key={row.month}><th scope="row">{monthName(row.month)}</th><td className="finance-hide-sm">{money(row.invoicedMinor,c)}</td><td>{money(row.collectedMinor,c)}</td><td>{money(row.costsMinor,c)}</td><td className={row.profitMinor<0?'finance-negative':''}>{money(row.profitMinor,c)}</td></tr>)}</tbody></table></div></div>

  <div className="finance-card"><div className="finance-card-head"><h3>Profit by project</h3><p>Across the whole life of each project: money collected less the costs set against it.</p></div>
   {section.projects.length?<div className="finance-table-wrap"><table className="finance-table finance-project-table"><thead><tr><th scope="col">Project</th><th scope="col" className="finance-hide-sm">Invoiced</th><th scope="col">Collected</th><th scope="col">Costs</th><th scope="col">Profit</th><th scope="col">Margin</th></tr></thead><tbody>{section.projects.map(row=>{const project=byId.get(row.projectId);return <tr key={row.projectId}><th scope="row">{project?<button type="button" className="finance-link" onClick={()=>openProject(project,'Billing')}>{row.title}</button>:row.title}<small>{row.client}</small></th><td className="finance-hide-sm">{money(row.invoicedMinor,c)}</td><td>{money(row.collectedMinor,c)}</td><td>{money(row.costsMinor,c)}</td><td className={row.profitMinor<0?'finance-negative':''}>{money(row.profitMinor,c)}</td><td>{percent(row.marginPercent)}</td></tr>})}</tbody></table></div>:<p className="finance-quiet">Profit appears here once a project has an invoice or a cost.</p>}
   {section.overheadsMinor>0&&<p className="finance-quiet">Studio overheads in this period, not set against a project: <strong>{money(section.overheadsMinor,c)}</strong></p>}</div>

  <div className="finance-grid">
   <div className="finance-card"><div className="finance-card-head"><h3>Outstanding</h3><p>{o.openCount} open invoice{o.openCount===1?'':'s'} totalling {money(o.totalMinor,c)}, as of today.</p></div>
    <dl className="finance-aging">{[['Not yet due',o.notDueMinor],['1 to 30 days late',o.late30Minor],['31 to 60 days late',o.late60Minor],['Over 60 days late',o.lateOver60Minor]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value,c)}</dd></div>)}</dl></div>
   <div className="finance-card"><div className="finance-card-head"><h3>Costs by category</h3><p>Where the money went in this period.</p></div>
    {section.categories.length?<ul className="finance-category-list">{section.categories.map(item=><li key={item.category}><span>{item.category}</span><strong>{money(item.amountMinor,c)}</strong><i aria-hidden="true"><b style={{width:`${item.amountMinor/costMax*100}%`}}/></i></li>)}</ul>:<p className="finance-quiet">No costs recorded in this period.</p>}</div>
  </div>

  <div className="finance-card"><div className="finance-card-head"><h3>Enquiries to bookings</h3><p>Enquiries received in this period, by where they came from.</p></div>
   {report.enquiries.length?<div className="finance-table-wrap"><table className="finance-table"><thead><tr><th scope="col">Source</th><th scope="col">Enquiries</th><th scope="col">Booked</th><th scope="col" className="finance-hide-sm">Lost</th><th scope="col" className="finance-hide-sm">Still open</th><th scope="col">Booking rate</th></tr></thead><tbody>{report.enquiries.map(row=><tr key={row.source}><th scope="row">{row.source}</th><td>{row.enquiries}</td><td>{row.booked}</td><td className="finance-hide-sm">{row.lost}</td><td className="finance-hide-sm">{row.open}</td><td>{row.bookingRate}%</td></tr>)}</tbody></table></div>:<p className="finance-quiet">No enquiries arrived in this period.</p>}</div>
 </section>;
}

// The project's own money picture, for the studio owner only.
export function ProjectProfit({p,studio,request,invoices,readOnly=false}){
 const [expenses,setExpenses]=useState(null),[adding,setAdding]=useState(false);
 useEffect(()=>{let active=true;request(`/api/expenses?studio=${studio.id}&project=${p.id}`).then(data=>{if(active)setExpenses(data.expenses||[]);}).catch(()=>{if(active)setExpenses([]);});return()=>{active=false};},[p.id,studio.id,request]);
 if(!expenses)return null;
 const currency=invoices[0]?.currency||expenses[0]?.currency||'GBP';
 const collected=invoices.filter(item=>item.currency===currency).reduce((sum,item)=>sum+(item.paidMinor||0),0),costs=expenses.filter(item=>item.currency===currency).reduce((sum,item)=>sum+item.amountMinor,0),profit=collected-costs;
 return <section className="finance-project-profit"><p className="billing-kicker">COSTS AND PROFIT</p><dl><div><dt>Collected</dt><dd>{money(collected,currency)}</dd></div><div><dt>Costs</dt><dd>{money(costs,currency)}</dd></div><div className="finance-project-profit-total"><dt>Profit</dt><dd className={profit<0?'finance-negative':''}>{money(profit,currency)}</dd></div></dl>
  {expenses.length>0&&<ul>{expenses.slice(0,4).map(item=><li key={item.id}><span>{item.description}</span><small>{money(item.amountMinor,item.currency)}</small></li>)}</ul>}
  {readOnly?null:adding?<CostForm projects={[p]} studio={studio} request={request} defaultProjectId={p.id} onSaved={expense=>{setExpenses(list=>[expense,...list]);setAdding(false);}} onCancel={()=>setAdding(false)}/>:<button type="button" className="billing-text-button" onClick={()=>setAdding(true)}>Record a cost</button>}
  <p>{readOnly?'Read only. Costs are not shown to the client.':'Only you can see this. Costs are not shown to the client.'}</p></section>;
}
