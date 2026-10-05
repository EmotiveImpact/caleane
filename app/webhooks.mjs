import {randomBytes,createHmac} from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {id,now} from './store.mjs';
import {invoiceAdjustments,invoiceState} from './invoice-adjustments.mjs';

// Outgoing webhooks. A studio adds an endpoint (its own server, Zapier's
// "Catch Hook", Make, n8n) and chooses which events it wants. Events are found
// by scanning the records the rest of the app already writes, so no other
// module needs to call in here. Each event is recorded once, then delivered to
// every subscribed endpoint with a signature and retries.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const MAX_ENDPOINTS=10,SCAN_OVERLAP_MS=5*60000,BATCH=25,DISABLE_AFTER=25;
// Wait before attempt 2, 3, … 7. After the last one the delivery is marked failed.
export const RETRY_DELAYS_MS=[60000,5*60000,30*60000,2*3600000,8*3600000,24*3600000];

export const webhookEvents=[
 {type:'enquiry.received',label:'New enquiry',description:'Someone sends an enquiry from your website, planner or a form.'},
 {type:'form.submitted',label:'Form submitted',description:'A published form receives a response, with every answer.'},
 {type:'client.created',label:'New client',description:'A client record is added, by you or by a booking or enquiry.'},
 {type:'project.created',label:'New project',description:'A project is created for any reason.'},
 {type:'booking.created',label:'Consultation booked',description:'A client books a time through your booking page.'},
 {type:'booking.cancelled',label:'Consultation cancelled',description:'A booked consultation is cancelled.'},
 {type:'invoice.issued',label:'Invoice issued',description:'An invoice is issued to a client.'},
 {type:'payment.received',label:'Payment recorded',description:'A payment is recorded against an invoice.'},
 {type:'invoice.paid',label:'Invoice paid in full',description:'An invoice has nothing left to pay.'}
];
const eventTypes=new Set(webhookEvents.map(event=>event.type));

export function installWebhooks(db){db.exec(`
 CREATE TABLE IF NOT EXISTS webhook_endpoints(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),url TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',secret TEXT NOT NULL,events TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,since TEXT NOT NULL,failures INTEGER NOT NULL DEFAULT 0,disabled_reason TEXT NOT NULL DEFAULT '',last_success_at TEXT,last_failure_at TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS webhook_endpoints_studio ON webhook_endpoints(studio_id);
 CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,key TEXT NOT NULL,type TEXT NOT NULL,occurred_at TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(studio_id,key));
 CREATE TABLE IF NOT EXISTS webhook_deliveries(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,endpoint_id TEXT NOT NULL,event_id TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','delivered','failed')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,response_code INTEGER,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,delivered_at TEXT,UNIQUE(endpoint_id,event_id));
 CREATE INDEX IF NOT EXISTS webhook_deliveries_due ON webhook_deliveries(status,next_attempt_at);
 CREATE INDEX IF NOT EXISTS webhook_deliveries_studio ON webhook_deliveries(studio_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS webhook_cursors(studio_id TEXT PRIMARY KEY,scanned_until TEXT NOT NULL);`);}

// Endpoints must be public. Private, loopback and link-local addresses are
// refused when the link is saved and again for every address DNS returns at
// send time, so a hostname cannot later be pointed at the server's own network.
const blocked=new net.BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',96],['::1',128],['fc00::',7],['fe80::',10],['64:ff9b::',96],['2001:db8::',32]])blocked.addSubnet(address,prefix,'ipv6');
export function privateAddress(address){
 const bare=String(address).replace(/^\[|\]$/g,'');
 if(net.isIPv4(bare))return blocked.check(bare,'ipv4');
 if(net.isIPv6(bare)){const mapped=bare.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);return mapped?blocked.check(mapped[1],'ipv4'):blocked.check(bare,'ipv6');}
 return false;
}
function safeLookup(hostname,options,callback){
 dns.lookup(hostname,{all:true,family:options?.family||0},(error,addresses)=>{
  if(error)return callback(error);
  if(!addresses.length||addresses.some(entry=>privateAddress(entry.address)))return callback(Object.assign(new Error('This address points at a private network.'),{code:'EBLOCKED'}));
  options?.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);
 });
}
export function endpointURL(value,{allowInsecure=false}={}){
 if(typeof value!=='string'||!value.trim()||value.length>2000)fail(400,'Paste the full https:// address of your endpoint.');
 let url;try{url=new URL(value.trim());}catch{fail(400,'Paste the full https:// address of your endpoint.');}
 if(url.protocol!=='https:'&&!(allowInsecure&&url.protocol==='http:'))fail(400,'Webhook addresses must start with https://.');
 if(url.username||url.password)fail(400,'Remove the username and password from the address.');
 const host=url.hostname.toLowerCase();
 if(!allowInsecure&&(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.internal')||privateAddress(host)))fail(400,'Use a public address. Private and local networks cannot receive webhooks.');
 url.hash='';return url.href;
}

/** Send one POST. Redirects are not followed and only the status code is read. */
export function sendWebhook(url,{headers,body,timeoutMs=10000}){
 return new Promise((resolve,reject)=>{
  const target=new URL(url);
  if(privateAddress(target.hostname))return reject(new Error('This address points at a private network.'));
  const request=(target.protocol==='https:'?https:http).request(target,{method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(body)},lookup:safeLookup,timeout:timeoutMs},response=>{resolve({status:response.statusCode});response.destroy();});
  request.on('timeout',()=>request.destroy(new Error(`No response within ${timeoutMs/1000} seconds.`)));
  request.on('error',reject);
  request.end(body);
 });
}

export function signature(secret,timestamp,body){return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`;}
const newSecret=()=>'whsec_'+randomBytes(24).toString('base64url');

// Event detection. Each finder returns the events whose moment falls at or
// after `since`; the unique key means an event is only ever recorded once.
const json=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
const money=(minor,currency)=>({amountMinor:minor,amount:(minor/100).toFixed(2),currency});
function projectSummary(db,studioId,projectId){
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);if(!row)return null;
 const p=json(row.data),b=p.brief||{};
 return {id:p.id,title:p.title,status:p.status,createdAt:p.createdAt,brief:{name:b.name||'',email:b.email||'',occasion:b.occasion||'',date:b.date||'',venue:b.venue||'',budget:b.budget||'',vision:b.vision||'',workflowType:b.workflowType||''}};
}
function clientSummary(db,studioId,clientId){
 const row=clientId&&db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientId,studioId);if(!row)return null;
 const data=json(row.data);return {id:row.id,name:row.name,email:row.email,company:data.company||'',phone:data.phone||'',stage:data.stage||'',source:data.source||''};
}
function invoiceSummary(db,row){
 const project=json(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(row.project_id,row.studio_id)?.data),snapshot=json(row.snapshot);
 const grossPaidMinor=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_payments WHERE studio_id=? AND invoice_id=?').get(row.studio_id,row.id).n,adjustments=invoiceAdjustments(db,row.studio_id,row.id);
 const state=invoiceState({amountMinor:row.amount_minor,grossPaidMinor,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,cancelled:!!row.cancelled_at});
 return {id:row.id,number:row.number,kind:row.kind,label:row.label||'',status:state.status,issuedAt:row.issued_at,dueDate:row.due_date,total:money(row.amount_minor,row.currency),net:money(row.net_minor,row.currency),tax:money(row.tax_minor,row.currency),taxRate:row.tax_rate,paid:money(state.paidMinor,row.currency),balance:money(state.balanceMinor,row.currency),
  project:{id:row.project_id,title:project.title||''},client:{name:snapshot.client?.name||project.brief?.name||'',email:snapshot.client?.email||project.clientEmail||''}};
}
function consultationSummary(row){const data=json(row.data);return {id:row.id,reference:row.id.slice(0,8).toUpperCase(),status:row.status,start:row.start_at,end:row.end_at,title:data.title||'',timezone:data.timezone||'',location:data.location||{},name:data.name||'',email:data.email||'',phone:data.phone||'',notes:data.notes||'',clientId:data.clientId||''};}
const has=(db,table)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);

const finders={
 'enquiry.received':(db,studioId,since)=>has(db,'notification_events')?db.prepare("SELECT project_id,MIN(created_at) AS at FROM notification_events WHERE studio_id=? AND kind='enquiry' AND created_at>=? GROUP BY project_id").all(studioId,since).map(row=>{const project=projectSummary(db,studioId,row.project_id);return project&&{key:'enquiry:'+row.project_id,at:row.at,data:{project,client:clientSummary(db,studioId,db.prepare('SELECT client_id FROM crm_opportunities WHERE studio_id=? AND project_id=?').get(studioId,row.project_id)?.client_id)}};}):[],
 'form.submitted':(db,studioId,since)=>has(db,'enquiry_form_responses')?db.prepare('SELECT r.*,f.name AS form_name,f.slug AS form_slug FROM enquiry_form_responses r JOIN enquiry_forms f ON f.id=r.form_id WHERE r.studio_id=? AND r.created_at>=?').all(studioId,since).map(row=>{const snapshot=json(row.snapshot);return {key:'form:'+row.id,at:row.created_at,data:{response:{id:row.id,submittedAt:row.created_at,consent:!!snapshot.consent},form:{id:row.form_id,name:row.form_name,slug:row.form_slug,version:row.version},answers:snapshot.brief||{},project:{id:row.project_id},client:clientSummary(db,studioId,row.client_id)}};}):[],
 'client.created':(db,studioId,since)=>db.prepare("SELECT id,json_extract(data,'$.createdAt') AS at FROM clients WHERE studio_id=? AND json_extract(data,'$.createdAt')>=?").all(studioId,since).map(row=>({key:'client:'+row.id,at:row.at,data:{client:clientSummary(db,studioId,row.id)}})),
 'project.created':(db,studioId,since)=>db.prepare("SELECT id,json_extract(data,'$.createdAt') AS at FROM projects WHERE studio_id=? AND json_extract(data,'$.createdAt')>=?").all(studioId,since).map(row=>({key:'project:'+row.id,at:row.at,data:{project:projectSummary(db,studioId,row.id)}})),
 'booking.created':(db,studioId,since)=>has(db,'consultations')?db.prepare('SELECT * FROM consultations WHERE studio_id=? AND created_at>=?').all(studioId,since).map(row=>({key:'booking:'+row.id,at:row.created_at,data:{booking:consultationSummary(row)}})):[],
 'booking.cancelled':(db,studioId,since)=>has(db,'consultations')?db.prepare("SELECT *,json_extract(data,'$.closedAt') AS at FROM consultations WHERE studio_id=? AND status='Cancelled' AND json_extract(data,'$.closedAt')>=?").all(studioId,since).map(row=>({key:'booking-cancelled:'+row.id,at:row.at,data:{booking:{...consultationSummary(row),cancelNote:json(row.data).closeNote||''}}})):[],
 'invoice.issued':(db,studioId,since)=>db.prepare('SELECT * FROM invoices WHERE studio_id=? AND issued_at>=?').all(studioId,since).map(row=>({key:'invoice:'+row.id,at:row.issued_at,data:{invoice:invoiceSummary(db,row)}})),
 'payment.received':(db,studioId,since)=>db.prepare('SELECT p.*,i.currency FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id AND i.studio_id=p.studio_id WHERE p.studio_id=? AND p.recorded_at>=?').all(studioId,since).map(row=>({key:'payment:'+row.id,at:row.recorded_at,data:{payment:{id:row.id,...money(row.amount_minor,row.currency),method:row.method,reference:row.reference,receivedAt:row.received_at},invoice:invoiceSummary(db,db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(row.invoice_id,studioId))}})),
 'invoice.paid':(db,studioId,since)=>db.prepare('SELECT i.*,MAX(p.recorded_at) AS at FROM invoices i JOIN invoice_payments p ON p.invoice_id=i.id AND p.studio_id=i.studio_id WHERE i.studio_id=? AND p.recorded_at>=? GROUP BY i.id').all(studioId,since).map(row=>{const invoice=invoiceSummary(db,row);return invoice.status==='Paid'&&{key:'invoice-paid:'+row.id,at:row.at,data:{invoice}};})
};

function studioInfo(db,studioId){const s=db.prepare('SELECT id,slug,name FROM studios WHERE id=?').get(studioId);return {id:s.id,slug:s.slug,name:s.name};}
function recordEvent(db,studioId,type,{key,at,data}){
 const eventId='evt_'+id().replaceAll('-','');
 const payload={id:eventId,type,createdAt:at,studio:studioInfo(db,studioId),data};
 const inserted=db.prepare('INSERT INTO webhook_events VALUES(?,?,?,?,?,?,?) ON CONFLICT(studio_id,key) DO NOTHING').run(eventId,studioId,key,type,at,JSON.stringify(payload),now()).changes;
 return inserted?{id:eventId,type,at}:null;
}
function queue(db,studioId,endpointId,event,nowMs){db.prepare("INSERT INTO webhook_deliveries(id,studio_id,endpoint_id,event_id,type,status,next_attempt_at,created_at) VALUES(?,?,?,?,?,'pending',?,?) ON CONFLICT(endpoint_id,event_id) DO NOTHING").run(id(),studioId,endpointId,event.id,event.type,nowMs,now());}

// Event payloads hold client details, so history is kept for 30 days only.
export function pruneWebhookHistory(db,{nowMs=Date.now()}={}){
 const cutoff=new Date(nowMs-30*86400000).toISOString();
 db.prepare("DELETE FROM webhook_deliveries WHERE (status<>'pending' AND created_at<?) OR event_id NOT IN (SELECT id FROM webhook_events)").run(cutoff);
 db.prepare('DELETE FROM webhook_events WHERE created_at<? AND id NOT IN (SELECT event_id FROM webhook_deliveries)').run(cutoff);
}

/** Find new events for every studio with an active endpoint and queue their deliveries. */
export function detectWebhookEvents(db,{nowMs=Date.now()}={}){
 let queued=0;
 for(const {studio_id:studioId} of db.prepare('SELECT DISTINCT studio_id FROM webhook_endpoints WHERE active=1').all()){
  const endpoints=db.prepare('SELECT * FROM webhook_endpoints WHERE studio_id=? AND active=1').all(studioId).map(row=>({...row,events:JSON.parse(row.events)}));
  const floor=endpoints.reduce((min,endpoint)=>endpoint.since<min?endpoint.since:min,endpoints[0].since),cursor=db.prepare('SELECT scanned_until FROM webhook_cursors WHERE studio_id=?').get(studioId)?.scanned_until;
  const since=cursor?new Date(Math.max(Date.parse(floor),Date.parse(cursor)-SCAN_OVERLAP_MS)).toISOString():floor,scanAt=new Date(nowMs).toISOString();
  const wanted=new Set(endpoints.flatMap(endpoint=>endpoint.events));
  for(const type of wanted){
   if(!finders[type])continue;
   for(const found of finders[type](db,studioId,since).filter(Boolean)){
    const event=recordEvent(db,studioId,type,found);if(!event)continue;
    for(const endpoint of endpoints)if(endpoint.events.includes(type)&&event.at>=endpoint.since){queue(db,studioId,endpoint.id,event,nowMs);queued++;}
   }
  }
  db.prepare('INSERT INTO webhook_cursors VALUES(?,?) ON CONFLICT(studio_id) DO UPDATE SET scanned_until=excluded.scanned_until').run(studioId,scanAt);
 }
 return queued;
}

const sending=new Set();
/** Attempt every delivery that is due. Safe to call often; a delivery is never sent twice at once. */
export async function deliverDueWebhooks(db,{transport=sendWebhook,nowMs=Date.now(),limit=BATCH}={}){
 const due=db.prepare("SELECT d.*,e.payload,w.url,w.secret,w.active FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id JOIN webhook_endpoints w ON w.id=d.endpoint_id WHERE d.status='pending' AND d.next_attempt_at<=? ORDER BY d.next_attempt_at LIMIT ?").all(nowMs,limit);
 let delivered=0;
 for(const row of due){
  if(sending.has(row.id))continue;
  if(!row.active){db.prepare("UPDATE webhook_deliveries SET status='failed',error=? WHERE id=?").run('The endpoint was switched off before this could be sent.',row.id);continue;}
  sending.add(row.id);
  try{
   const timestamp=Math.floor(nowMs/1000),body=row.payload;let status=null,error='';
   try{status=(await transport(row.url,{body,headers:{'Content-Type':'application/json','User-Agent':'Caleane-Webhooks/1.0','Caleane-Event':row.type,'Caleane-Delivery':row.event_id,'Caleane-Signature':signature(row.secret,timestamp,body)}})).status;}catch(e){error=String(e?.message||e).slice(0,300);}
   const attempts=row.attempts+1,ok=status>=200&&status<300,at=new Date(nowMs).toISOString();
   if(ok){
    db.prepare("UPDATE webhook_deliveries SET status='delivered',attempts=?,response_code=?,error='',delivered_at=? WHERE id=?").run(attempts,status,at,row.id);
    db.prepare('UPDATE webhook_endpoints SET failures=0,last_success_at=? WHERE id=?').run(at,row.endpoint_id);delivered++;continue;
   }
   if(!error)error=`Your endpoint replied ${status}.`;
   // 410 Gone is how Zapier says a Zap was turned off: stop sending.
   const gone=status===410,final=gone||attempts>RETRY_DELAYS_MS.length;
   db.prepare('UPDATE webhook_deliveries SET status=?,attempts=?,response_code=?,error=?,next_attempt_at=? WHERE id=?').run(final?'failed':'pending',attempts,status,error,final?nowMs:nowMs+RETRY_DELAYS_MS[attempts-1],row.id);
   const failures=db.prepare('UPDATE webhook_endpoints SET failures=failures+1,last_failure_at=? WHERE id=? RETURNING failures').get(at,row.endpoint_id)?.failures||0;
   if(gone||failures>=DISABLE_AFTER){
    db.prepare('UPDATE webhook_endpoints SET active=0,disabled_reason=? WHERE id=?').run(gone?'Switched off because the endpoint said it no longer exists (410).':`Switched off after ${failures} failed attempts in a row.`,row.endpoint_id);
    db.prepare("UPDATE webhook_deliveries SET status='failed',error='The endpoint was switched off before this could be sent.' WHERE endpoint_id=? AND status='pending'").run(row.endpoint_id);
   }
  }finally{sending.delete(row.id);}
 }
 return delivered;
}

export async function runWebhooks(db,options={}){pruneWebhookHistory(db,options);detectWebhookEvents(db,options);return deliverDueWebhooks(db,options);}

function endpointDTO(row){return {id:row.id,url:row.url,description:row.description,secret:row.secret,events:JSON.parse(row.events),active:!!row.active,failures:row.failures,disabledReason:row.disabled_reason,lastSuccessAt:row.last_success_at||'',lastFailureAt:row.last_failure_at||'',createdAt:row.created_at};}
function deliveryDTO(row){return {id:row.id,endpointId:row.endpoint_id,eventId:row.event_id,type:row.type,status:row.status,attempts:row.attempts,responseCode:row.response_code,error:row.error,createdAt:row.created_at,deliveredAt:row.delivered_at||'',nextAttemptAt:row.status==='pending'?new Date(row.next_attempt_at).toISOString():''};}
function chosenEvents(value){if(!Array.isArray(value)||!value.length)fail(400,'Choose at least one event to send.');const events=[...new Set(value)];if(events.some(type=>!eventTypes.has(type)))fail(400,'Choose events from the list.');return events;}
const text=(value,max)=>{if(value==null)return '';if(typeof value!=='string'||value.length>max)fail(400,'Keep the label under '+max+' characters.');return value.trim();};

export function webhookView(db,studioId,{delivery=true}={}){
 return {delivery:delivery?'on':'off',events:webhookEvents,
  endpoints:db.prepare('SELECT * FROM webhook_endpoints WHERE studio_id=? ORDER BY created_at').all(studioId).map(endpointDTO),
  deliveries:db.prepare('SELECT * FROM webhook_deliveries WHERE studio_id=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(studioId).map(deliveryDTO)};
}

export async function handleWebhooks({db,req,route,body,studio,owner,user,reply,delivery=true,allowInsecure=false,transport=sendWebhook}){
 if(route!=='/api/webhooks')return false;
 if(!owner)fail(403,'Only the studio owner can manage webhooks.');
 installWebhooks(db);
 if(req.method==='GET')return reply(200,webhookView(db,studio.id,{delivery})),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const find=()=>{const row=db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND studio_id=?').get(String(body.id||''),studio.id);if(!row)fail(404,'Endpoint not found.');return row;};
 const at=now();
 if(body.action==='create'){
  if(db.prepare('SELECT COUNT(*) AS n FROM webhook_endpoints WHERE studio_id=?').get(studio.id).n>=MAX_ENDPOINTS)fail(409,`You can add up to ${MAX_ENDPOINTS} endpoints.`);
  db.prepare('INSERT INTO webhook_endpoints(id,studio_id,url,description,secret,events,active,since,created_at,created_by) VALUES(?,?,?,?,?,?,1,?,?,?)').run(id(),studio.id,endpointURL(body.url,{allowInsecure}),text(body.description,80),newSecret(),JSON.stringify(chosenEvents(body.events)),at,at,user.id);
 }else if(body.action==='update'){
  const row=find(),url=body.url==null?row.url:endpointURL(body.url,{allowInsecure}),events=body.events==null?JSON.parse(row.events):chosenEvents(body.events),description=body.description==null?row.description:text(body.description,80);
  const active=body.active==null?!!row.active:body.active===true,resumed=active&&!row.active;
  // Turning an endpoint back on starts from now, so it never receives a backlog.
  db.prepare('UPDATE webhook_endpoints SET url=?,events=?,description=?,active=?,since=?,failures=CASE WHEN ? THEN 0 ELSE failures END,disabled_reason=CASE WHEN ? THEN \'\' ELSE disabled_reason END WHERE id=?').run(url,JSON.stringify(events),description,active?1:0,resumed?at:row.since,resumed?1:0,active?1:0,row.id);
  if(!active)db.prepare("UPDATE webhook_deliveries SET status='failed',error='The endpoint was switched off before this could be sent.' WHERE endpoint_id=? AND status='pending'").run(row.id);
 }else if(body.action==='rotate'){
  db.prepare('UPDATE webhook_endpoints SET secret=? WHERE id=?').run(newSecret(),find().id);
 }else if(body.action==='delete'){
  const row=find();db.prepare('DELETE FROM webhook_deliveries WHERE endpoint_id=?').run(row.id);db.prepare('DELETE FROM webhook_endpoints WHERE id=?').run(row.id);
 }else if(body.action==='test'){
  if(!delivery)fail(503,'Webhook delivery is switched off in this workspace.');
  const row=find();if(!row.active)fail(409,'Switch the endpoint on before sending a test.');
  const event=recordEvent(db,studio.id,'webhook.test',{key:'test:'+id(),at,data:{message:'A test event from Caleane. If you can see this, your endpoint is connected.',endpoint:{id:row.id,description:row.description}}});
  queue(db,studio.id,row.id,event,Date.now());await deliverDueWebhooks(db,{transport});
 }else if(body.action==='redeliver'){
  if(!delivery)fail(503,'Webhook delivery is switched off in this workspace.');
  const target=db.prepare('SELECT d.*,w.active FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id=d.endpoint_id WHERE d.id=? AND d.studio_id=?').get(String(body.deliveryId||''),studio.id);if(!target)fail(404,'Delivery not found.');
  if(!target.active)fail(409,'Switch the endpoint on before sending again.');
  db.prepare("UPDATE webhook_deliveries SET status='pending',attempts=0,next_attempt_at=? WHERE id=?").run(Date.now(),target.id);await deliverDueWebhooks(db,{transport});
 }else fail(400,'Choose a webhook action.');
 return reply(200,webhookView(db,studio.id,{delivery})),true;
}
