import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {now} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';

// Xero: copy issued invoices and recorded payments into the studio's Xero
// organisation, so the books match without typing them twice. Caleane stays
// the place invoices are made; Xero receives them. Nothing is read back.
// Off until XERO_CLIENT_ID, XERO_CLIENT_SECRET and an encryption key are set.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const AUTH='https://login.xero.com/identity/connect/authorize',TOKEN='https://identity.xero.com/connect/token',REVOKE='https://identity.xero.com/connect/revocation',API='https://api.xero.com';
// Apps created since March 2026 use granular scopes. Older apps can set XERO_SCOPES to use accounting.transactions instead.
const DEFAULT_SCOPES='offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read';
const MAX_ATTEMPTS=5;
export const defaultXeroSettings={salesAccountCode:'200',taxType:'OUTPUT2',noTaxType:'NONE',bankAccountCode:'',invoiceStatus:'AUTHORISED',sendFrom:''};
const locks=new Set();

export function xeroConfigured(env=process.env){return !!(env.XERO_CLIENT_ID&&env.XERO_CLIENT_SECRET&&xeroKey(env));}
function xeroKey(env){const key=Buffer.from(env.XERO_ENCRYPTION_KEY||env.CALENDAR_ENCRYPTION_KEY||'','base64');return key.length===32?key:null;}
function cipher(env){
 const key=xeroKey(env);if(!key)fail(503,'Xero is not set up for this workspace.');
 return {seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');},
  open(value){try{const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}catch{fail(503,'The Xero connection cannot be read. Reconnect Xero.');}}};
}
const hash=value=>createHash('sha256').update(value).digest('hex');

export function installXero(db){db.exec(`
 CREATE TABLE IF NOT EXISTS xero_connections(studio_id TEXT PRIMARY KEY REFERENCES studios(id),tenant_id TEXT NOT NULL,tenant_name TEXT NOT NULL,secret TEXT NOT NULL,connected_by TEXT NOT NULL,connected_at TEXT NOT NULL,last_sync_at TEXT,last_error TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS xero_oauth(state TEXT PRIMARY KEY,studio_id TEXT NOT NULL,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS xero_links(studio_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('invoice','payment')),local_id TEXT NOT NULL,remote_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,synced_at TEXT,PRIMARY KEY(studio_id,kind,local_id));`);}

export function xeroSettings(db,studioId){return {...defaultXeroSettings,...readSetting(db,studioId,'xero',{})};}
const code=(value,label)=>{const result=String(value??'').trim();if(result.length>20||!/^[A-Za-z0-9_.-]*$/.test(result))fail(400,`Check the ${label}.`);return result;};
export function saveXeroSettings(db,studioId,input){
 const result={salesAccountCode:code(input.salesAccountCode,'sales account code'),taxType:code(input.taxType,'tax rate code'),noTaxType:code(input.noTaxType,'no-VAT rate code'),bankAccountCode:code(input.bankAccountCode,'bank account code'),invoiceStatus:input.invoiceStatus==='DRAFT'?'DRAFT':'AUTHORISED',sendFrom:input.sendFrom||''};
 if(!result.salesAccountCode)fail(400,'Add the sales account code invoices should go to.');
 if(result.sendFrom&&!/^\d{4}-\d{2}-\d{2}$/.test(result.sendFrom))fail(400,'Choose a valid start date.');
 return writeSetting(db,studioId,'xero',result);
}

async function tokenRequest(env,values,transport){
 const response=await transport(TOKEN,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.XERO_CLIENT_ID+':'+env.XERO_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(15000)});
 if(!response.ok)fail(401,'Xero did not accept the connection. Reconnect Xero.');
 const token=await response.json();if(!token.access_token)fail(502,'Xero did not return access.');
 return {...token,expires_at:Date.now()+(Number(token.expires_in)||1800)*1000};
}
async function access(db,studioId,{env,transport}){
 const row=db.prepare('SELECT * FROM xero_connections WHERE studio_id=?').get(studioId);if(!row)fail(409,'Connect Xero first.');
 const box=cipher(env);let token=box.open(row.secret);
 if(token.expires_at<Date.now()+60000){
  // Xero refresh tokens rotate on every use, so the new one is saved before anything else happens.
  token=await tokenRequest(env,{grant_type:'refresh_token',refresh_token:token.refresh_token},transport);
  db.prepare('UPDATE xero_connections SET secret=? WHERE studio_id=?').run(box.seal(token),studioId);
 }
 return {token:token.access_token,tenantId:row.tenant_id};
}
async function api(transport,{token,tenantId},path,{method='GET',body,idempotencyKey}={}){
 const response=await transport(API+path,{method,headers:{Authorization:'Bearer '+token,'xero-tenant-id':tenantId,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=data?.Elements?.[0]?.ValidationErrors?.map(item=>item.Message).join(' ')||data?.Detail||data?.Message||'';
  fail(response.status===401?401:response.status===429?429:502,response.status===429?'Xero is busy. Caleane will try again shortly.':`Xero replied ${response.status}${detail?': '+detail:'.'}`);
 }
 return data;
}

const amount=minor=>Math.round(minor)/100;
function invoicePayload(row,settings){
 const snapshot=JSON.parse(row.snapshot||'{}'),reference=[snapshot.projectTitle,row.label||row.kind].filter(Boolean).join(' · ');
 return {Type:'ACCREC',InvoiceNumber:row.number,Reference:reference.slice(0,255),Date:row.issued_at.slice(0,10),DueDate:row.due_date,CurrencyCode:row.currency,Status:settings.invoiceStatus,LineAmountTypes:'Exclusive',
  Contact:{Name:(snapshot.billToName||snapshot.billToEmail||'Client').slice(0,255),...(snapshot.billToEmail?{EmailAddress:snapshot.billToEmail}:{})},
  LineItems:[{Description:(`${row.kind} invoice${snapshot.projectTitle?' for '+snapshot.projectTitle:''}`+(row.label?` (${row.label})`:'')).slice(0,4000),Quantity:1,UnitAmount:amount(row.net_minor),TaxAmount:amount(row.tax_minor),AccountCode:settings.salesAccountCode,TaxType:row.tax_minor>0?settings.taxType:settings.noTaxType}].map(line=>Object.fromEntries(Object.entries(line).filter(([,value])=>value!=='')))};
}
const link=(db,studioId,kind,localId)=>db.prepare('SELECT * FROM xero_links WHERE studio_id=? AND kind=? AND local_id=?').get(studioId,kind,localId);
function saveLink(db,studioId,kind,localId,patch){
 const current=link(db,studioId,kind,localId)||{remote_id:'',status:'Waiting',error:'',attempts:0,synced_at:null},next={...current,...patch};
 db.prepare('INSERT INTO xero_links VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(studio_id,kind,local_id) DO UPDATE SET remote_id=excluded.remote_id,status=excluded.status,error=excluded.error,attempts=excluded.attempts,synced_at=excluded.synced_at').run(studioId,kind,localId,next.remote_id,next.status,next.error,next.attempts,next.synced_at);
}

/** Send what is new or changed for one studio. Returns counts of what was sent. */
export async function syncXero(db,studioId,{env=process.env,transport=fetch}={}){
 const connection=db.prepare('SELECT * FROM xero_connections WHERE studio_id=?').get(studioId);if(!connection||!xeroConfigured(env))return null;
 if(locks.has(studioId))fail(409,'Xero is already syncing.');locks.add(studioId);
 const settings=xeroSettings(db,studioId),sent={invoices:0,payments:0,voided:0,failed:0};
 try{
  const auth=await access(db,studioId,{env,transport}),from=settings.sendFrom||connection.connected_at.slice(0,10);
  const step=async(kind,localId,work)=>{
   const current=link(db,studioId,kind,localId);if(current&&current.status==='Error'&&current.attempts>=MAX_ATTEMPTS)return;
   try{await work(current);}catch(error){if(error.status===401||error.status===429)throw error;sent.failed++;saveLink(db,studioId,kind,localId,{status:'Error',error:String(error.message).slice(0,500),attempts:(current?.attempts||0)+1});}
  };
  for(const row of db.prepare('SELECT * FROM invoices WHERE studio_id=? AND issued_at>=? ORDER BY issued_at').all(studioId,from)){
   await step('invoice',row.id,async current=>{
    if(!current?.remote_id){
     if(row.cancelled_at)return;
     const data=await api(transport,auth,'/api.xro/2.0/Invoices',{method:'POST',body:{Invoices:[invoicePayload(row,settings)]},idempotencyKey:'caleane-invoice-'+row.id});
     const created=data.Invoices?.[0];if(!created?.InvoiceID)fail(502,'Xero did not return the invoice.');
     saveLink(db,studioId,'invoice',row.id,{remote_id:created.InvoiceID,status:'Sent',error:'',attempts:0,synced_at:now()});sent.invoices++;
    }else if(row.cancelled_at&&current.status!=='Voided'){
     const paid=db.prepare('SELECT COUNT(*) AS n FROM xero_links l JOIN invoice_payments p ON p.id=l.local_id WHERE l.studio_id=? AND l.kind=\'payment\' AND l.remote_id<>\'\' AND p.invoice_id=?').get(studioId,row.id).n;
     if(paid){saveLink(db,studioId,'invoice',row.id,{status:'Cancelled here',error:'Cancelled in Caleane but has payments in Xero. Adjust it in Xero.'});return;}
     await api(transport,auth,'/api.xro/2.0/Invoices/'+encodeURIComponent(current.remote_id),{method:'POST',body:{Invoices:[{InvoiceID:current.remote_id,Status:settings.invoiceStatus==='DRAFT'?'DELETED':'VOIDED'}]}});
     saveLink(db,studioId,'invoice',row.id,{status:'Voided',error:'',synced_at:now()});sent.voided++;
    }
   });
  }
  if(settings.bankAccountCode&&settings.invoiceStatus==='AUTHORISED'){
   for(const payment of db.prepare('SELECT p.*,i.currency FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id AND i.studio_id=p.studio_id WHERE p.studio_id=? AND i.issued_at>=? ORDER BY p.recorded_at').all(studioId,from)){
    const invoiceLink=link(db,studioId,'invoice',payment.invoice_id);if(!invoiceLink?.remote_id||invoiceLink.status==='Voided')continue;
    await step('payment',payment.id,async current=>{
     if(current?.remote_id)return;
     const data=await api(transport,auth,'/api.xro/2.0/Payments',{method:'PUT',body:{Payments:[{Invoice:{InvoiceID:invoiceLink.remote_id},Account:{Code:settings.bankAccountCode},Date:payment.received_at.slice(0,10),Amount:amount(payment.amount_minor),Reference:(payment.reference||'Recorded in Caleane').slice(0,255)}]},idempotencyKey:'caleane-payment-'+payment.id});
     const created=data.Payments?.[0];if(!created?.PaymentID)fail(502,'Xero did not return the payment.');
     saveLink(db,studioId,'payment',payment.id,{remote_id:created.PaymentID,status:'Sent',error:'',attempts:0,synced_at:now()});sent.payments++;
    });
   }
  }
  db.prepare("UPDATE xero_connections SET last_sync_at=?,last_error='' WHERE studio_id=?").run(now(),studioId);
  return sent;
 }catch(error){
  db.prepare('UPDATE xero_connections SET last_sync_at=?,last_error=? WHERE studio_id=?').run(now(),String(error.message).slice(0,500),studioId);throw error;
 }finally{locks.delete(studioId);}
}

export async function syncAllXero(db,{env=process.env,transport=fetch}={}){
 if(!xeroConfigured(env))return 0;installXero(db);let count=0;
 for(const {studio_id:studioId} of db.prepare('SELECT studio_id FROM xero_connections').all()){
  try{await syncXero(db,studioId,{env,transport});count++;}catch(error){if(!error?.status)console.error('Xero sync failed:',error?.stack||error);}
 }
 return count;
}

function view(db,studioId,env){
 const connection=db.prepare('SELECT tenant_name,connected_at,last_sync_at,last_error FROM xero_connections WHERE studio_id=?').get(studioId);
 const recent=db.prepare("SELECT l.*,i.number,i.amount_minor,i.currency FROM xero_links l LEFT JOIN invoices i ON i.id=l.local_id AND l.kind='invoice' WHERE l.studio_id=? AND l.kind='invoice' ORDER BY COALESCE(l.synced_at,'') DESC LIMIT 12").all(studioId).map(row=>({id:row.local_id,number:row.number||'',amountMinor:row.amount_minor||0,currency:row.currency||'GBP',status:row.status,error:row.error,syncedAt:row.synced_at||''}));
 const counts=Object.fromEntries(db.prepare('SELECT kind,COUNT(*) AS n FROM xero_links WHERE studio_id=? AND remote_id<>\'\' GROUP BY kind').all(studioId).map(row=>[row.kind,row.n]));
 const problems=db.prepare("SELECT COUNT(*) AS n FROM xero_links WHERE studio_id=? AND status='Error'").get(studioId).n;
 return {configured:xeroConfigured(env),connected:!!connection,organisation:connection?.tenant_name||'',connectedAt:connection?.connected_at||'',lastSyncAt:connection?.last_sync_at||'',lastError:connection?.last_error||'',settings:xeroSettings(db,studioId),sent:{invoices:counts.invoice||0,payments:counts.payment||0},problems,recent};
}

export async function handleXero({db,req,route,body,studio,user,owner,reply,origin,env=process.env,transport=fetch,delivery=true}){
 if(route!=='/api/xero')return false;
 if(!owner)fail(403,'Only the studio owner can manage Xero.');installXero(db);
 if(req.method==='GET')return reply(200,view(db,studio.id,env)),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const redirect=origin+'/xero/callback';
 if(body.action==='save'){saveXeroSettings(db,studio.id,body.settings||{});return reply(200,view(db,studio.id,env)),true;}
 if(!xeroConfigured(env)||!delivery)fail(503,'Xero is not set up for this workspace.');
 if(body.action==='connect'){
  const appURL=new URL(origin);if(appURL.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(appURL.hostname))fail(503,'Xero needs a secure application address.');
  const state=randomBytes(32).toString('base64url');db.prepare('DELETE FROM xero_oauth WHERE expires<?').run(Date.now());db.prepare('INSERT INTO xero_oauth VALUES(?,?,?,?)').run(hash(state),studio.id,user.id,Date.now()+600000);
  const url=new URL(AUTH);url.search=new URLSearchParams({response_type:'code',client_id:env.XERO_CLIENT_ID,redirect_uri:redirect,scope:env.XERO_SCOPES||DEFAULT_SCOPES,state});
  return reply(200,{url:url.href}),true;
 }
 if(body.action==='complete'){
  if(typeof body.state!=='string'||typeof body.code!=='string'||body.code.length>4000)fail(400,'The Xero connection could not be completed.');
  const state=db.prepare('SELECT * FROM xero_oauth WHERE state=? AND studio_id=? AND user_id=? AND expires>?').get(hash(body.state),studio.id,user.id,Date.now());if(!state)fail(400,'The Xero connection expired or was already used. Try connecting again.');
  db.prepare('DELETE FROM xero_oauth WHERE state=?').run(hash(body.state));
  const token=await tokenRequest(env,{grant_type:'authorization_code',code:body.code,redirect_uri:redirect},transport);
  const response=await transport(API+'/connections',{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const tenants=response.ok?(await response.json()).filter(item=>item.tenantType==='ORGANISATION'):[];if(!tenants.length)fail(409,'No Xero organisation was shared with Caleane. Connect again and choose your organisation.');
  const tenant=tenants[0];
  // A different organisation starts fresh; the same one keeps its links so nothing is sent twice.
  if(readSetting(db,studio.id,'xero_tenant','')!==tenant.tenantId){db.prepare('DELETE FROM xero_links WHERE studio_id=?').run(studio.id);writeSetting(db,studio.id,'xero_tenant',tenant.tenantId);}
  db.prepare('INSERT INTO xero_connections(studio_id,tenant_id,tenant_name,secret,connected_by,connected_at) VALUES(?,?,?,?,?,?) ON CONFLICT(studio_id) DO UPDATE SET tenant_id=excluded.tenant_id,tenant_name=excluded.tenant_name,secret=excluded.secret,connected_by=excluded.connected_by,connected_at=excluded.connected_at,last_error=\'\'').run(studio.id,tenant.tenantId,tenant.tenantName||'Xero organisation',cipher(env).seal(token),user.id,now());
  return reply(200,view(db,studio.id,env)),true;
 }
 if(body.action==='sync'){await syncXero(db,studio.id,{env,transport});return reply(200,view(db,studio.id,env)),true;}
 if(body.action==='retry'){db.prepare("UPDATE xero_links SET attempts=0 WHERE studio_id=? AND status='Error'").run(studio.id);await syncXero(db,studio.id,{env,transport});return reply(200,view(db,studio.id,env)),true;}
 if(body.action==='disconnect'){
  const row=db.prepare('SELECT secret FROM xero_connections WHERE studio_id=?').get(studio.id);if(!row)fail(409,'Xero is not connected.');
  if(locks.has(studio.id))fail(409,'Wait for the current Xero sync to finish.');
  let token=null;try{token=cipher(env).open(row.secret);}catch{}
  db.prepare('DELETE FROM xero_connections WHERE studio_id=?').run(studio.id);
  // Links are kept so reconnecting the same organisation never sends an invoice twice.
  if(token?.refresh_token){try{await transport(REVOKE,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.XERO_CLIENT_ID+':'+env.XERO_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refresh_token}),signal:AbortSignal.timeout(15000)});}catch{}}
  return reply(200,view(db,studio.id,env)),true;
 }
 fail(400,'Choose a Xero action.');
}
