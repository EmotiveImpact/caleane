import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomBytes} from 'node:crypto';
import {createWorkspace} from '../server.mjs';
import {handleXero,syncXero,syncAllXero,saveXeroSettings} from '../xero.mjs';
import {id,now} from '../store.mjs';

const env={XERO_CLIENT_ID:'xid',XERO_CLIENT_SECRET:'xsecret',XERO_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
const json=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

async function setup(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-xero-'));const {db,server}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin:'http://localhost:4320',demo:true,webhookIntervalMs:0,calendarIntervalMs:0,reminderIntervalMs:0});
 const studio=db.prepare('SELECT * FROM studios LIMIT 1').get(),user=db.prepare("SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.studio_id=? AND m.role='owner'").get(studio.id),project=db.prepare('SELECT id FROM projects WHERE studio_id=? LIMIT 1').get(studio.id);
 const calls=[];let handler=()=>json({});const transport=async(url,options={})=>{const call={url,method:options.method||'GET',headers:options.headers||{},body:typeof options.body==='string'?JSON.parse(options.body):options.body};calls.push(call);return handler(call);};
 async function call(body,extra={}){let result;await handleXero({db,req:{method:body?'POST':'GET'},route:'/api/xero',body,studio,user,owner:true,origin:'http://localhost:4320',env,transport,reply:(status,data)=>{result={status,...data};},...extra});return result;}
 let number=0;
 const invoice=({net=100000,tax=20000,issuedAt=now(),snapshot={}}={})=>{const invoiceId=id();number++;db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId,studio.id,project.id,'INV-2026-00'+number,'est',1,'Deposit','GBP',net+tax,net,tax,tax?20:0,'2026-11-01','','Bank transfer',JSON.stringify({billToName:'Amelia Taylor',billToEmail:'amelia@example.test',projectTitle:'Amelia’s wedding',...snapshot}),issuedAt,user.id);return invoiceId;};
 const payment=(invoiceId,amountMinor)=>{const paymentId=id();db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(paymentId,studio.id,invoiceId,amountMinor,'bank_transfer','BACS 123','2026-10-10','',now(),user.id);return paymentId;};
 return {db,studio,user,calls,call,invoice,payment,transport,setHandler:fn=>{handler=fn;},close:async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});}};
}
async function connect(t){
 t.setHandler(c=>c.url.includes('/connect/token')?json({access_token:'xero-access',refresh_token:'xero-refresh-1',expires_in:1800}):c.url.endsWith('/connections')?json([{tenantId:'tenant-1',tenantName:'NAY Décor Ltd',tenantType:'ORGANISATION'}]):json({}));
 const start=await t.call({action:'connect'});const url=new URL(start.url),state=url.searchParams.get('state');
 assert.equal(url.origin,'https://login.xero.com');assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:4320/xero/callback');assert.match(url.searchParams.get('scope'),/offline_access/);
 return t.call({action:'complete',state,code:'auth-code'});
}

test('Xero stays off until configured and is owner only',async()=>{
 const t=await setup();
 try{
  const view=await t.call(undefined,{env:{}});assert.equal(view.configured,false);assert.equal(view.connected,false);
  await assert.rejects(()=>t.call({action:'connect'},{env:{}}),e=>e.status===503);
  await assert.rejects(()=>t.call({action:'connect'},{delivery:false}),e=>e.status===503,'never in the hosted sample');
  await assert.rejects(()=>t.call(undefined,{owner:false}),e=>e.status===403);
  assert.throws(()=>saveXeroSettings(t.db,t.studio.id,{salesAccountCode:''}),e=>e.status===400);
  assert.throws(()=>saveXeroSettings(t.db,t.studio.id,{salesAccountCode:'200; DROP'}),e=>e.status===400);
 }finally{await t.close();}
});

test('connecting stores encrypted tokens, and the OAuth state works once',async()=>{
 const t=await setup();
 try{
  const view=await connect(t);assert.equal(view.connected,true);assert.equal(view.organisation,'NAY Décor Ltd');
  const secret=t.db.prepare('SELECT secret FROM xero_connections').get().secret;assert.equal(secret.includes('xero-refresh'),false);
  const tokenCall=t.calls.find(c=>c.url.includes('/connect/token'));assert.equal(tokenCall.headers.Authorization,'Basic '+Buffer.from('xid:xsecret').toString('base64'));
  const start=await t.call({action:'connect'}),state=new URL(start.url).searchParams.get('state');await t.call({action:'complete',state,code:'x'});
  await assert.rejects(()=>t.call({action:'complete',state,code:'x'}),e=>e.status===400);
 }finally{await t.close();}
});

test('issued invoices and payments are sent once, cancelled invoices are voided, and failures are reported',async()=>{
 const t=await setup();
 try{
  t.invoice({issuedAt:'2020-01-01T00:00:00.000Z'});
  await connect(t);
  saveXeroSettings(t.db,t.studio.id,{salesAccountCode:'200',taxType:'OUTPUT2',noTaxType:'NONE',bankAccountCode:'090',invoiceStatus:'AUTHORISED'});
  const first=t.invoice(),noVat=t.invoice({net:50000,tax:0});const paid=t.payment(first,120000);
  let n=0;t.setHandler(c=>c.url.endsWith('/Invoices')?json({Invoices:[{InvoiceID:'xinv-'+(++n)}]}):c.url.endsWith('/Payments')?json({Payments:[{PaymentID:'xpay-1'}]}):json({}));
  const result=await syncXero(t.db,t.studio.id,{env,transport:t.transport});
  assert.deepEqual(result,{invoices:2,payments:1,voided:0,failed:0},'the invoice from before connecting is not sent');
  const posts=t.calls.filter(c=>c.url.endsWith('/Invoices'));
  const body=posts[0].body.Invoices[0];assert.equal(body.Type,'ACCREC');assert.equal(body.InvoiceNumber,'INV-2026-002');assert.equal(body.Contact.Name,'Amelia Taylor');assert.equal(body.LineItems[0].UnitAmount,1000);assert.equal(body.LineItems[0].TaxAmount,200);assert.equal(body.LineItems[0].TaxType,'OUTPUT2');assert.equal(body.LineItems[0].AccountCode,'200');assert.equal(body.Status,'AUTHORISED');
  assert.equal(posts[0].headers['xero-tenant-id'],'tenant-1');assert.equal(posts[0].headers['Idempotency-Key'],'caleane-invoice-'+first);
  assert.equal(posts[1].body.Invoices[0].LineItems[0].TaxType,'NONE');
  const pay=t.calls.find(c=>c.url.endsWith('/Payments'));assert.equal(pay.method,'PUT');assert.deepEqual(pay.body.Payments[0],{Invoice:{InvoiceID:'xinv-1'},Account:{Code:'090'},Date:'2026-10-10',Amount:1200,Reference:'BACS 123'});
  const before=t.calls.length;await syncXero(t.db,t.studio.id,{env,transport:async(url,o)=>{t.calls.push({url});return json({});}});assert.equal(t.calls.length,before,'nothing is sent twice');
  assert.ok(paid);

  t.db.prepare('UPDATE invoices SET cancelled_at=?,cancelled_by=? WHERE id=?').run(now(),t.user.id,noVat);
  const voidCalls=[];await syncXero(t.db,t.studio.id,{env,transport:async(url,o)=>{voidCalls.push({url,body:JSON.parse(o.body)});return json({Invoices:[{}]});}});
  assert.equal(voidCalls.length,1);assert.equal(voidCalls[0].body.Invoices[0].Status,'VOIDED');assert.match(voidCalls[0].url,/Invoices\/xinv-2$/);
  t.db.prepare('UPDATE invoices SET cancelled_at=?,cancelled_by=? WHERE id=?').run(now(),t.user.id,first);
  await syncXero(t.db,t.studio.id,{env,transport:async()=>{throw new Error('should not void a paid invoice');}});
  assert.match(t.db.prepare("SELECT error FROM xero_links WHERE local_id=?").get(first).error,/payments in Xero/);

  const broken=t.invoice();
  const view=await (async()=>{await syncXero(t.db,t.studio.id,{env,transport:async()=>json({Elements:[{ValidationErrors:[{Message:'Account code 200 is not a valid code'}]}]},400)});return t.call();})();
  assert.equal(view.problems,1);assert.match(view.recent.find(r=>r.id===broken).error,/not a valid code/);
  assert.equal(await syncAllXero(t.db,{env,transport:async()=>json({Invoices:[{InvoiceID:'xinv-9'}]})}),1);
  assert.equal(t.db.prepare('SELECT remote_id FROM xero_links WHERE local_id=?').get(broken).remote_id,'xinv-9','failed invoices are retried');
 }finally{await t.close();}
});

test('expired access is refreshed and the rotated refresh token is saved; disconnect keeps links',async()=>{
 const t=await setup();
 try{
  await connect(t);
  const box=t.db.prepare('SELECT secret FROM xero_connections').get().secret;
  // Force expiry by rewriting the stored token through a fresh connect with a short lifetime.
  t.setHandler(c=>c.url.includes('/connect/token')?json({access_token:'short',refresh_token:'xero-refresh-2',expires_in:1}):c.url.endsWith('/connections')?json([{tenantId:'tenant-1',tenantName:'NAY Décor Ltd',tenantType:'ORGANISATION'}]):json({}));
  const start=await t.call({action:'connect'});await t.call({action:'complete',state:new URL(start.url).searchParams.get('state'),code:'c'});
  assert.notEqual(t.db.prepare('SELECT secret FROM xero_connections').get().secret,box);
  t.invoice();const seen=[];
  await syncXero(t.db,t.studio.id,{env,transport:async(url,o)=>{seen.push({url,body:o.body});if(url.includes('/connect/token'))return json({access_token:'renewed',refresh_token:'xero-refresh-3',expires_in:1800});return json({Invoices:[{InvoiceID:'xinv-1'}]});}});
  assert.match(String(seen[0].body),/refresh_token=xero-refresh-2/);
  await t.call({action:'disconnect'});assert.equal((await t.call()).connected,false);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM xero_links').get().n,1,'links survive a disconnect so nothing is sent twice');
 }finally{await t.close();}
});

test('an invoice at more than one VAT rate goes to Xero as a line per rate, each with its rate code',async()=>{
 const t=await setup();
 try{
  await connect(t);
  saveXeroSettings(t.db,t.studio.id,{salesAccountCode:'200',taxType:'OUTPUT2',noTaxType:'NONE',invoiceStatus:'AUTHORISED'});
  t.invoice({net:66000,tax:4050,snapshot:{vatBreakdown:[{rate:20,exempt:false,netMinor:19500,taxMinor:3900},{rate:5,exempt:false,netMinor:3000,taxMinor:150},{rate:0,exempt:false,netMinor:30000,taxMinor:0},{rate:0,exempt:true,netMinor:13500,taxMinor:0}]}});
  t.setHandler(c=>c.url.endsWith('/Invoices')?json({Invoices:[{InvoiceID:'xinv-1'}]}):json({}));
  assert.equal((await syncXero(t.db,t.studio.id,{env,transport:t.transport})).invoices,1);
  const lines=t.calls.find(c=>c.url.endsWith('/Invoices')).body.Invoices[0].LineItems;
  assert.deepEqual(lines.map(line=>[line.UnitAmount,line.TaxAmount,line.TaxType]),[[195,39,'OUTPUT2'],[30,1.5,'RROUTPUT'],[300,0,'ZERORATEDOUTPUT'],[135,0,'EXEMPTOUTPUT']]);
  assert.match(lines[2].Description,/Deposit invoice for Amelia’s wedding · Zero-rated/);
  // The codes can be changed for an organisation set up differently.
  assert.equal(saveXeroSettings(t.db,t.studio.id,{salesAccountCode:'200',taxType:'OUTPUT2',noTaxType:'NONE',exemptTaxType:'EXEMPT'}).exemptTaxType,'EXEMPT');
  assert.throws(()=>saveXeroSettings(t.db,t.studio.id,{salesAccountCode:'200',zeroTaxType:'not a code!'}),/zero rate code/);
 }finally{await t.close();}
});
