import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {invoicePdf} from '../invoice-pdf.mjs';
import {invoicePageHtml,invoiceLayouts,sampleInvoice} from '../src/lib/invoice-design.js';

const origin='http://127.0.0.1:4320';
const addDays=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const pages=buffer=>(buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;

test('the invoice page is sized for one A4 sheet when printed',async()=>{
 const html=invoicePageHtml(sampleInvoice({name:'Studio'}).invoice);
 assert.match(html,/@page\{size:A4;margin:0\}/);
 // A4 is a fraction under 1123px, so the printed page must not ask for more or a blank second page appears.
 assert.match(html,/@media print\{\.page\{margin:0;min-height:296\.5mm\}/);
 assert.match(await readFile(new URL('../src/lib/invoice-design.js',import.meta.url),'utf8'),/padding:48px 60px 30px/);
});

test('credit notes have their own document in every design, naming the original invoice',()=>{
 const {invoice}=sampleInvoice({name:'Studio'},{vatRegistered:true,taxRate:20,taxRegistration:'GB1'});
 const credit={id:'c1',number:'CN-2026-0001',amountMinor:12000,netMinor:10000,taxMinor:2000,reason:'Reduced <scope>',issuedAt:'2026-10-09T10:00:00Z'};
 for(const [layout] of invoiceLayouts){
  const html=invoicePageHtml(invoice,{design:{layout},creditNote:credit});
  assert.match(html,/<title>Credit note CN-2026-0001<\/title>/,layout);assert.match(html,/Credit against invoice INV-2026-0042/,layout);
  assert.match(html,/Reduced &lt;scope&gt;/,layout);assert.match(html,/VAT \(20%\)/,layout);assert.match(html,/£120\.00/,layout);
  assert.doesNotMatch(html,/How to pay/,layout);
 }
});

test('invoice and credit note PDFs are real one-page files',async()=>{
 const {invoice,estimate}=sampleInvoice({name:'NAY DÉCOR'},{vatRegistered:true,taxRate:20,taxRegistration:'GB1'});
 const file=await invoicePdf({...invoice,note:'Deposit − thank you'},{studio:{name:'NAY DÉCOR',accent:'#7a3b2e'},estimate});
 assert.equal(file.subarray(0,5).toString(),'%PDF-');assert.equal(pages(file),1);
 const credit=await invoicePdf(invoice,{creditNote:{number:'CN-2026-0001',amountMinor:12000,netMinor:10000,taxMinor:2000,reason:'Reduced scope',issuedAt:'2026-10-09'}});
 assert.equal(pages(credit),1);
});

test('the studio and the client approver can download invoice and credit note PDFs',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-pdf-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who='owner'){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  const type=response.headers.get('content-type')||'';
  return {status:response.status,type,disposition:response.headers.get('content-disposition')||'',data:type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};
 }
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me')).data.studios[0],q=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+q)).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 const estimate=(await call(`/api/projects/${project.id}/estimates${q}`,'POST',{title:'Scope',currency:'GBP',taxRate:20,items:[{title:'Styling',quantity:1,unitAmount:100000}]})).data.project.estimates.at(-1);
 await call(`/api/projects/${project.id}/estimate-decision${q}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
 const invoice=(await call(`/api/projects/${project.id}/invoices${q}`,'POST',{estimateId:estimate.id,kind:'Full',dueDate:addDays(7),supplyDate:addDays(30),sellerAddress:'1 Studio Lane',sellerContact:'hi@studio.test',customerAddress:'2 Elm Row',paymentInstructions:'Bank transfer.'})).data.invoice;
 const credited=(await call(`/api/projects/${project.id}/invoices/${invoice.id}/credit-notes${q}`,'POST',{amountMinor:12000,reason:'Reduced scope'})).data.invoice;
 const credit=credited.credits[0];
 for(const who of ['owner','client']){
  const studioId=(await call('/api/me','GET',undefined,who)).data.studios[0].id;
  const pdf=await call(`/api/projects/${project.id}/invoices/${invoice.id}/pdf?studio=${studioId}`,'GET',undefined,who);
  assert.equal(pdf.status,200,who);assert.equal(pdf.type,'application/pdf');assert.match(pdf.disposition,/attachment; filename="Invoice-INV-\d{4}-\d{4}\.pdf"/);
  assert.equal(pdf.data.subarray(0,5).toString(),'%PDF-');assert.equal(pages(pdf.data),1);
  const note=await call(`/api/projects/${project.id}/invoices/${invoice.id}/credit-notes/${credit.id}/pdf?studio=${studioId}`,'GET',undefined,who);
  assert.equal(note.status,200,who);assert.match(note.disposition,/Credit-note-CN-\d{4}-\d{4}\.pdf/);
 }
 assert.equal((await call(`/api/projects/${project.id}/invoices/${invoice.id}/credit-notes/00000000-0000-0000-0000-000000000000/pdf${q}`)).status,404);
 const anonymous=await fetch(`${base}/api/projects/${project.id}/invoices/${invoice.id}/pdf${q}`,{headers:{Origin:origin}});
 assert.notEqual(anonymous.status,200);
});
