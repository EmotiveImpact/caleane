import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {createNotificationOutbox} from '../notifications.mjs';
import {bookingIcs} from '../src/lib/booking-calendar.js';

const origin='http://127.0.0.1:4320';
async function start(options={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'consultation-follow-')),{server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,disableExternalServices:true,...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function call(route,method='GET',body,headers={}){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json()};}
 assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
 const studio=(await call('/api/me')).data.studios[0],q='?studio='+studio.id;
 const settings=(await call('/api/consultations'+q)).data.settings,weekly=Object.fromEntries([0,1,2,3,4,5,6].map(day=>[day,[{start:'09:00',end:'17:00'}]]));
 assert.equal((await call('/api/consultations'+q,'POST',{action:'save-settings',settings:{...settings,enabled:true,minNoticeHours:0,maxPerDay:20,weekly,location:{type:'video',detail:'https://meet.example.test/nay'}}})).status,200);
 let n=0;const book=(name,email,start)=>call(`/api/booking/${studio.slug}`,'POST',{name,email,notes:'Garden party for 60',start},{'Idempotency-Key':`follow-through-${++n}-key`});
 const slots=async()=>(await call(`/api/booking/${studio.slug}`)).data.slots;
 return {db,call,q,studio,book,slots,async close(){await new Promise(resolve=>server.close(resolve));db.close?.();await rm(dir,{recursive:true,force:true});}};
}

test('a booking notifies the studio, opens a Pipeline enquiry and gives the client a private link to move or cancel it',async()=>{
 const app=await start();
 try{
  const {call,q,studio,book,slots,db}=app,[first,second,third]=(await slots()).slice(-3);
  const booked=await book('Priya Booker','Priya@Example.test',first);
  assert.equal(booked.status,201);assert.equal(booked.data.status,'Booked');assert.equal(booked.data.title,'Discovery call');assert.match(booked.data.manageToken,/^[A-Za-z0-9_-]{32}$/);
  const feed=async()=>(await call('/api/notifications'+q)).data.notifications;
  const note=(await feed()).find(item=>item.title==='Priya Booker booked a Discovery call');
  assert.ok(note);assert.equal(note.kind,'enquiry');assert.match(note.detail,/priya@example\.test$/);
  const deals=(await call('/api/opportunities'+q)).data.opportunities.filter(o=>o.title==='Discovery call · Priya Booker');
  assert.equal(deals.length,1);assert.equal(deals[0].source,'Consultation booking');assert.ok(!['Won','Lost'].includes(deals[0].stage));assert.equal(note.opportunityId,deals[0].id);
  // A second call from the same person joins their open enquiry rather than starting another.
  assert.equal((await book('Priya Booker','priya@example.test',second)).status,201);
  assert.equal((await call('/api/opportunities'+q)).data.opportunities.filter(o=>o.title==='Discovery call · Priya Booker').length,1);
  const project=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(deals[0].projectId).data);
  assert.equal(project.activity.filter(item=>item.text.startsWith('Booked a Discovery call for ')).length,2);
  // A client who already has an open enquiry is attached to it too.
  const before=(await call('/api/opportunities'+q)).data.opportunities,amelia=before.find(o=>o.clientEmail==='amelia@example.test'&&!['Won','Lost'].includes(o.stage));
  assert.ok(amelia,'the sample has an open enquiry for Amelia');
  assert.equal((await book('Amelia Taylor','amelia@example.test',third)).status,201);
  assert.equal((await call('/api/opportunities'+q)).data.opportunities.length,before.length);
  assert.ok(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(amelia.projectId).data).activity[0].text.startsWith('Booked a Discovery call for '));
  // The private link: anyone without it is refused.
  const manage=body=>call(`/api/booking/${studio.slug}/manage`,'POST',{token:booked.data.manageToken,...body});
  assert.equal((await call(`/api/booking/${studio.slug}/manage`,'POST',{token:'x'.repeat(32),action:'view'})).status,404);
  assert.equal((await call(`/api/booking/${studio.slug}/manage`,'POST',{action:'view'})).status,404);
  let view=(await manage({action:'view'})).data;
  assert.equal(view.booking.start,first);assert.equal(view.booking.canChange,true);assert.equal(view.booking.timezone,'Europe/London');assert.equal(view.booking.durationMinutes,30);
  assert.ok(!view.slots.includes(first)&&!view.slots.includes(second));
  const target=view.slots[0];
  assert.equal((await manage({action:'reschedule',start:second})).status,409,'a time someone else holds cannot be taken');
  view=(await manage({action:'reschedule',start:target})).data;
  assert.equal(view.booking.start,target);assert.ok((await slots()).includes(first),'the old time opens again');
  assert.ok((await feed()).some(item=>item.title==='Priya Booker moved their Discovery call'));
  const task=db.prepare("SELECT due_date FROM crm_tasks WHERE id=(SELECT json_extract(data,'$.taskId') FROM consultations WHERE id=?)").get(view.bookingId);
  assert.equal(task.due_date,new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date(target)));
  view=(await manage({action:'cancel'})).data;
  assert.equal(view.booking.status,'Cancelled');assert.equal(view.booking.canChange,false);assert.deepEqual(view.slots,[]);
  assert.equal((await manage({action:'cancel'})).status,409);
  assert.ok((await feed()).some(item=>item.title==='Priya Booker cancelled their Discovery call'));
  assert.equal((await call('/api/consultations'+q)).data.consultations.find(c=>c.id===view.bookingId).status,'Cancelled');
  // No email switch, no queued email.
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='consultation'").get().n,0);
 }finally{await app.close();}
});

test('with email switched on a confirmation is queued with the reschedule link, and only sent while it still holds',async()=>{
 const key=randomBytes(32).toString('base64'),app=await start({notificationKey:key});
 try{
  const {book,slots,db,studio,call}=app,[first]=(await slots()).slice(-1);
  const booked=await book('Sam Rivers','sam@example.test',first);
  const rows=db.prepare("SELECT * FROM notification_outbox WHERE kind='consultation'").all();
  assert.equal(rows.length,1);assert.equal(rows[0].recipient_email,'sam@example.test');assert.equal(rows[0].state,'pending');
  const sent=[],outbox=createNotificationOutbox(db,{encryptionKey:key,origin});
  assert.equal((await outbox.dispatchOne(async mail=>{sent.push(mail);return {id:'m1'};})).state,'sent');
  assert.match(sent[0].subject,/^Your Discovery call with .+ is booked$/);
  const link=sent[0].text.match(/reschedule or cancel here: (\S+)/)[1];
  assert.match(link,new RegExp(`^${origin}/book/${studio.slug}/manage#[A-Za-z0-9_-]{32}$`));
  assert.match(sent[0].text,/\(Europe\/London time\), for 30 minutes\./);
  // The emailed link works on its own, alongside the one on the confirmation screen.
  const fromEmail=await call(`/api/booking/${studio.slug}/manage`,'POST',{token:link.split('#')[1],action:'cancel'});
  assert.equal(fromEmail.status,200);assert.equal(fromEmail.data.booking.status,'Cancelled');
  assert.equal((await call(`/api/booking/${studio.slug}/manage`,'POST',{token:booked.data.manageToken,action:'view'})).data.booking.status,'Cancelled');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='consultation' AND state='pending'").get().n,1,'the cancellation email waits too');
 }finally{await app.close();}
});

test('the calendar file is valid, escaped and in UTC',()=>{
 const ics=bookingIcs({id:'abc',start:'2027-03-02T10:00:00.000Z',end:'2027-03-02T10:30:00Z',title:'Discovery call',studioName:'Fern, Co; Ltd',location:'https://meet.example.test/x',manageUrl:'https://app.example.test/book/fern/manage#token',now:'2027-01-01T00:00:00Z'});
 assert.match(ics,/^BEGIN:VCALENDAR\r\n/);assert.match(ics,/\r\nDTSTART:20270302T100000Z\r\nDTEND:20270302T103000Z\r\n/);
 assert.match(ics,/SUMMARY:Discovery call with Fern\\, Co\\; Ltd/);assert.match(ics,/STATUS:CONFIRMED/);assert.match(ics,/END:VCALENDAR\r\n$/);
 assert.ok(ics.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75));
});
