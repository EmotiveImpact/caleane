import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHmac} from 'node:crypto';
import {createWorkspace} from '../server.mjs';
import {handleWebhooks,detectWebhookEvents,deliverDueWebhooks,runWebhooks,privateAddress,endpointURL,sendWebhook,signature,RETRY_DELAYS_MS} from '../webhooks.mjs';
import {saveBookingSettings,bookingSettings,availableSlots,bookConsultation,changeConsultation} from '../consultations.mjs';
import {eraseClient} from '../client-erasure.mjs';
import {id,now} from '../store.mjs';

async function workspace(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-webhooks-'));const {db,server}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin:'http://localhost:4320',demo:true,webhookIntervalMs:0,reminderIntervalMs:0});
 const studio=db.prepare('SELECT * FROM studios LIMIT 1').get(),user=db.prepare("SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.studio_id=? AND m.role='owner'").get(studio.id);
 const sent=[];let respond=()=>({status:200});const transport=async(url,options)=>{sent.push({url,...options,payload:JSON.parse(options.body)});return respond(url,options);};
 async function call(body,extra={}){let result;await handleWebhooks({db,req:{method:body?'POST':'GET'},route:'/api/webhooks',body,studio,owner:true,user,transport,reply:(status,data)=>{result={status,...data};},...extra});return result;}
 return {db,studio,user,sent,transport,call,setResponse:fn=>{respond=fn;},close:async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});}};
}
const addClient=(db,studioId,name,email,createdAt=now())=>{const clientId=id();db.prepare('INSERT INTO clients VALUES(?,?,?,?,?)').run(clientId,studioId,email,name,JSON.stringify({company:'',phone:'',stage:'Lead',source:'Manual',tags:[],notes:[],followUp:'',createdAt,updatedAt:createdAt}));return clientId;};

test('endpoint addresses must be public https links',()=>{
 for(const bad of ['http://hooks.example.com/x','https://localhost/x','https://127.0.0.1/x','https://10.1.2.3/x','https://[::1]/x','https://169.254.169.254/latest','https://user:pass@hooks.example.com/','ftp://example.com','not a url',''])assert.throws(()=>endpointURL(bad),e=>e.status===400,bad);
 assert.equal(endpointURL('https://hooks.zapier.com/hooks/catch/123/abc/#frag'),'https://hooks.zapier.com/hooks/catch/123/abc/');
 for(const address of ['127.0.0.1','10.0.0.8','192.168.1.1','172.20.0.1','100.64.0.1','::1','fd00::1','fe80::1','::ffff:127.0.0.1','0.0.0.0'])assert.equal(privateAddress(address),true,address);
 for(const address of ['8.8.8.8','2606:4700:4700::1111','hooks.zapier.com'])assert.equal(privateAddress(address),false,address);
});

test('the sender refuses private addresses even when asked directly',async()=>{
 await assert.rejects(()=>sendWebhook('http://127.0.0.1:9/hook',{headers:{},body:'{}'}),/private network/);
 await assert.rejects(()=>sendWebhook('http://localhost:9/hook',{headers:{},body:'{}'}),/private network/);
});

test('new records become signed webhook deliveries, once, for subscribed endpoints only',async()=>{
 const w=await workspace();
 try{
  const before=addClient(w.db,w.studio.id,'Earlier Client','earlier@example.test',new Date(Date.now()-3600000).toISOString());
  await assert.rejects(()=>w.call({action:'create',url:'http://hooks.example.com/x',events:['client.created']}),e=>e.status===400);
  await assert.rejects(()=>w.call({action:'create',url:'https://hooks.example.com/x',events:[]}),e=>e.status===400);
  await assert.rejects(()=>w.call({action:'create',url:'https://hooks.example.com/x',events:['made.up']}),e=>e.status===400);
  await assert.rejects(()=>w.call(undefined,{owner:false}),e=>e.status===403);
  const view=await w.call({action:'create',url:'https://hooks.zapier.com/hooks/catch/1/abc/',description:'Zapier',events:['client.created','booking.created','booking.cancelled']});
  const endpoint=view.endpoints[0];assert.match(endpoint.secret,/^whsec_/);assert.equal(endpoint.active,true);
  await w.call({action:'create',url:'https://example.org/invoices',events:['invoice.issued']});

  const clientId=addClient(w.db,w.studio.id,'Rosa Hart','rosa@example.test');
  assert.equal(detectWebhookEvents(w.db),1);assert.equal(detectWebhookEvents(w.db),0,'an event is only queued once');
  assert.equal(await deliverDueWebhooks(w.db,{transport:w.transport}),1);
  const [delivery]=w.sent;assert.equal(delivery.url,endpoint.url);assert.equal(delivery.payload.type,'client.created');assert.equal(delivery.payload.data.client.id,clientId);assert.equal(delivery.payload.data.client.email,'rosa@example.test');assert.equal(delivery.payload.studio.slug,w.studio.slug);
  assert.equal(w.sent.some(item=>item.payload.data?.client?.id===before),false,'records from before the endpoint existed are not sent');
  assert.equal(delivery.headers['Caleane-Event'],'client.created');assert.equal(delivery.headers['Caleane-Delivery'],delivery.payload.id);
  const [, t, v1]=delivery.headers['Caleane-Signature'].match(/^t=(\d+),v1=([a-f0-9]{64})$/);
  assert.equal(v1,createHmac('sha256',endpoint.secret).update(`${t}.${delivery.body}`).digest('hex'));assert.equal(signature(endpoint.secret,t,delivery.body),delivery.headers['Caleane-Signature']);

  saveBookingSettings(w.db,w.studio.id,{...bookingSettings(w.db,w.studio.id),enabled:true,minNoticeHours:0,weekly:Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,[{start:'00:00',end:'23:30'}]]))});
  const start=availableSlots(w.db,w.studio.id)[0];const booked=bookConsultation(w.db,{studio:w.studio,body:{name:'Sam Lee',email:'sam@example.test',start},key:'webhook-booking-1'});assert.equal(booked.status,201);
  await runWebhooks(w.db,{transport:w.transport});
  const types=w.sent.map(item=>item.payload.type);assert.ok(types.includes('booking.created'));assert.ok(types.includes('client.created'),'the booking created a client record');
  const booking=w.sent.find(item=>item.payload.type==='booking.created').payload.data.booking;assert.equal(booking.start,start);assert.equal(booking.email,'sam@example.test');
  const consultation=w.db.prepare('SELECT id FROM consultations').get();changeConsultation(w.db,{studioId:w.studio.id,user:w.user,body:{id:consultation.id,action:'cancel',note:'Moved abroad'}});
  await runWebhooks(w.db,{transport:w.transport});
  const cancelled=w.sent.find(item=>item.payload.type==='booking.cancelled');assert.equal(cancelled.payload.data.booking.cancelNote,'Moved abroad');
  assert.equal(w.sent.filter(item=>item.url==='https://example.org/invoices').length,0,'unsubscribed endpoints receive nothing');
  const listed=await w.call();assert.equal(listed.deliveries.every(item=>item.status==='delivered'),true);assert.ok(listed.events.length>=9);
 }finally{await w.close();}
});

test('failed deliveries retry with backoff, a 410 switches the endpoint off, and tests and redelivery work',async()=>{
 const w=await workspace();
 try{
  const view=await w.call({action:'create',url:'https://hooks.example.com/a',events:['client.created']}),endpointId=view.endpoints[0].id;
  w.setResponse(()=>({status:500}));addClient(w.db,w.studio.id,'Retry Client','retry@example.test');
  const t0=Date.now();detectWebhookEvents(w.db,{nowMs:t0});await deliverDueWebhooks(w.db,{transport:w.transport,nowMs:t0});
  let row=w.db.prepare('SELECT * FROM webhook_deliveries').get();assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.equal(row.response_code,500);assert.equal(row.next_attempt_at,t0+RETRY_DELAYS_MS[0]);
  await deliverDueWebhooks(w.db,{transport:w.transport,nowMs:t0+1000});assert.equal(w.sent.length,1,'not retried before its time');
  w.setResponse(()=>{throw new Error('connect ECONNREFUSED');});await deliverDueWebhooks(w.db,{transport:w.transport,nowMs:t0+RETRY_DELAYS_MS[0]});
  row=w.db.prepare('SELECT * FROM webhook_deliveries').get();assert.equal(row.attempts,2);assert.match(row.error,/ECONNREFUSED/);
  w.setResponse(()=>({status:204}));const redelivered=await w.call({action:'redeliver',deliveryId:row.id});assert.equal(redelivered.deliveries[0].status,'delivered');assert.equal(redelivered.endpoints[0].failures,0);
  const tested=await w.call({action:'test',id:endpointId});assert.equal(w.sent.at(-1).payload.type,'webhook.test');assert.equal(tested.deliveries[0].type,'webhook.test');
  w.setResponse(()=>({status:410}));await w.call({action:'test',id:endpointId});
  const off=(await w.call()).endpoints[0];assert.equal(off.active,false);assert.match(off.disabledReason,/410/);
  addClient(w.db,w.studio.id,'While Off','off@example.test');detectWebhookEvents(w.db);assert.equal(w.db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE status='pending'").get().n,0);
  w.setResponse(()=>({status:200}));const resumed=await w.call({action:'update',id:endpointId,active:true});assert.equal(resumed.endpoints[0].active,true);assert.equal(resumed.endpoints[0].disabledReason,'');
  assert.equal(detectWebhookEvents(w.db),0,'switching back on does not replay what happened while off');
  const oldSecret=resumed.endpoints[0].secret,rotated=await w.call({action:'rotate',id:endpointId});assert.notEqual(rotated.endpoints[0].secret,oldSecret);
  assert.equal((await w.call({action:'delete',id:endpointId})).endpoints.length,0);
  assert.equal(w.db.prepare('SELECT COUNT(*) AS n FROM webhook_deliveries').get().n,0);
 }finally{await w.close();}
});

test('test sends are refused where delivery is switched off',async()=>{
 const w=await workspace();
 try{const view=await w.call({action:'create',url:'https://hooks.example.com/a',events:['client.created']});
  assert.equal((await w.call(undefined,{delivery:false})).delivery,'off');
  await assert.rejects(()=>w.call({action:'test',id:view.endpoints[0].id},{delivery:false}),e=>e.status===503);
 }finally{await w.close();}
});

test('erasing a client removes their webhook history',async()=>{
 const w=await workspace();
 try{await w.call({action:'create',url:'https://hooks.example.com/a',events:['client.created']});const clientId=addClient(w.db,w.studio.id,'Erase Me','erase@example.test');await runWebhooks(w.db,{transport:w.transport});
  assert.equal(w.db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get().n,1);
  eraseClient(w.db,{studioId:w.studio.id,clientId,confirmName:'Erase Me'});
  assert.equal(w.db.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE payload LIKE '%erase@example.test%'").get().n,0);
 }finally{await w.close();}
});
