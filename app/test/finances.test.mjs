import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {financeReport,periodRange,expensesCSV} from '../src/lib/finance-report.js';

const origin='http://127.0.0.1:4320';
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]).toString('base64');

test('UK tax years and rolling periods',()=>{
 assert.deepEqual(periodRange('tax','2026-10-05'),{period:'tax',from:'2026-04-06',to:'2026-10-05'});
 assert.deepEqual(periodRange('tax','2026-04-05'),{period:'tax',from:'2025-04-06',to:'2026-04-05'});
 assert.deepEqual(periodRange('last-tax','2026-10-05'),{period:'last-tax',from:'2025-04-06',to:'2026-04-05'});
 assert.equal(periodRange('12m','2026-10-05').from,'2025-11-01');
});

test('report counts money when received, nets refunds, and works out profit per project',()=>{
 const invoices=[
  {id:'a',projectId:'p1',currency:'GBP',amountMinor:100000,dueMinor:100000,paidMinor:90000,status:'Partly refunded',issuedAt:'2026-09-01T10:00:00Z',dueDate:'2026-09-15',payments:[{amountMinor:100000,receivedAt:'2026-09-10'}],refunds:[{amountMinor:10000,refundedAt:'2026-10-01'}]},
  {id:'b',projectId:'p2',currency:'GBP',amountMinor:50000,dueMinor:50000,paidMinor:0,balanceMinor:50000,status:'Issued',issuedAt:'2026-08-01T10:00:00Z',dueDate:'2026-08-20',payments:[],refunds:[]},
  {id:'c',projectId:'p2',currency:'GBP',amountMinor:20000,dueMinor:0,paidMinor:0,status:'Cancelled',issuedAt:'2026-08-02T10:00:00Z',payments:[],refunds:[]},
 ];
 const expenses=[{projectId:'p1',spentOn:'2026-09-12',category:'Materials',amountMinor:30000,currency:'GBP'},{projectId:'',spentOn:'2026-10-02',category:'Software and subscriptions',amountMinor:5000,currency:'GBP'}];
 const opportunities=[{source:'Instagram',stage:'Won',createdAt:'2026-06-01T00:00:00Z'},{source:'Instagram',stage:'Lost',createdAt:'2026-06-02T00:00:00Z'},{source:'',stage:'Discovery',createdAt:'2026-07-01T00:00:00Z'},{source:'Old',stage:'Won',createdAt:'2024-01-01T00:00:00Z'}];
 const report=financeReport({invoices,expenses,opportunities,projects:[{id:'p1',title:'Wedding',client:'Ada'},{id:'p2',title:'Launch',client:'Ben'}],period:'12m',today:'2026-10-05'});
 const gbp=report.byCurrency[0];
 assert.equal(report.months.length,12);
 assert.equal(gbp.monthly.find(m=>m.month==='2026-09').collectedMinor,100000);
 assert.equal(gbp.monthly.find(m=>m.month==='2026-10').collectedMinor,-10000);
 assert.equal(gbp.totals.invoicedMinor,150000);
 assert.equal(gbp.totals.collectedMinor,90000);
 assert.equal(gbp.totals.costsMinor,35000);
 assert.equal(gbp.totals.profitMinor,55000);
 assert.equal(gbp.totals.marginPercent,61);
 const wedding=gbp.projects.find(p=>p.projectId==='p1');
 assert.deepEqual([wedding.collectedMinor,wedding.costsMinor,wedding.profitMinor,wedding.marginPercent],[90000,30000,60000,67]);
 assert.equal(gbp.overheadsMinor,5000);
 assert.equal(gbp.outstanding.late60Minor,50000);
 assert.equal(gbp.outstanding.openCount,1);
 assert.deepEqual(report.enquiries.map(r=>[r.source,r.enquiries,r.booked,r.bookingRate]),[['Instagram',2,1,50],['Unspecified',1,0,0]]);
 assert.match(expensesCSV([{spentOn:'2026-09-12',description:'=cmd',supplier:'',category:'Other',projectId:'',currency:'GBP',amountMinor:1234,receipt:null}]),/"'=cmd".*"Studio overhead","GBP","12.34","0.00","No"/);
});

test('owners record costs with receipts; clients cannot see them',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-finances-'));
 const workspace=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,disableExternalServices:true});
 await new Promise(resolve=>workspace.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${workspace.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who=''){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  const type=response.headers.get('content-type')||'';
  return {status:response.status,data:type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),type};
 }
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
  await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id,q=`?studio=${studio}`;
  const project=(await call('/api/projects'+q,'GET',undefined,'owner')).data.projects[0];
  const created=await call('/api/expenses'+q,'POST',{action:'create',description:'Ribbon and card stock',supplier:'Paper Co',spentOn:'2026-09-12',amountMinor:4250,currency:'GBP',category:'Materials',projectId:project.id,receipt:{name:'receipt.png',content:png}},'owner');
  assert.equal(created.status,201);
  const expense=created.data.expense;
  assert.equal(expense.receipt.mime,'image/png');
  const file=await call(`/api/expenses/${expense.id}/receipt${q}`,'GET',undefined,'owner');
  assert.equal(file.status,200);assert.equal(file.type,'image/png');
  assert.equal((await call('/api/expenses'+q,'POST',{action:'create',description:'Bad',spentOn:'2026-09-12',amountMinor:100,currency:'GBP',category:'Materials',receipt:{name:'x.html',content:Buffer.from('<html><script>1</script></html>').toString('base64')}},'owner')).status,400);
  assert.equal((await call('/api/expenses'+q,'POST',{action:'create',description:'Bad',spentOn:'2026-09-12',amountMinor:100,currency:'GBP',category:'Materials',projectId:'00000000-0000-0000-0000-000000000000'},'owner')).status,400);
  const updated=await call('/api/expenses'+q,'POST',{action:'update',id:expense.id,description:'Ribbon',supplier:'',spentOn:'2026-09-13',amountMinor:5000,currency:'GBP',category:'Printing and production',projectId:'',removeReceipt:true},'owner');
  assert.equal(updated.status,200);assert.equal(updated.data.expense.receipt,null);assert.equal(updated.data.expense.projectId,'');
  const report=await call(`/api/finance-report${q}&period=12m&today=2026-10-05`,'GET',undefined,'owner');
  assert.equal(report.status,200);assert.equal(report.data.report.byCurrency[0].totals.costsMinor,5000);
  // Clients, including project approvers, never see the studio's costs or reports.
  const clientStudio=(await call('/api/me','GET',undefined,'client')).data.studios[0].id;
  for(const route of ['/api/expenses','/api/finance-report',`/api/expenses/${expense.id}/receipt`])assert.equal((await call(`${route}?studio=${clientStudio}`,'GET',undefined,'client')).status,403);
  assert.equal((await call(`/api/expenses?studio=${clientStudio}`,'POST',{action:'delete',id:expense.id},'client')).status,403);
  assert.equal((await call('/api/expenses'+q,'POST',{action:'delete',id:expense.id},'owner')).status,200);
  assert.deepEqual((await call('/api/expenses'+q,'GET',undefined,'owner')).data.expenses,[]);
 }finally{await new Promise(resolve=>workspace.server.close(resolve));workspace.db.close();await rm(dir,{recursive:true,force:true});}
});
