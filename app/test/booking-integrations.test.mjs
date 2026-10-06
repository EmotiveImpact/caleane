import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomBytes} from 'node:crypto';
import {createWorkspace} from '../server.mjs';
import {calendarCipher,installCalendarSync,syncAllCalendars} from '../calendar-sync.mjs';
import {saveBookingIntegrations,calendarBusy,completeBookingIntegrations,syncBookingIntegrations,handleBookingIntegrations,clearBusyCache} from '../booking-integrations.mjs';
import {saveBookingSettings,bookingSettings,availableSlots,bookConsultation,changeConsultation} from '../consultations.mjs';

const env={CALENDAR_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CALENDAR_GOOGLE_CLIENT_ID:'g',CALENDAR_GOOGLE_CLIENT_SECRET:'gs',CALENDAR_OUTLOOK_CLIENT_ID:'o',CALENDAR_OUTLOOK_CLIENT_SECRET:'os',ZOOM_ACCOUNT_ID:'acc',ZOOM_CLIENT_ID:'zid',ZOOM_CLIENT_SECRET:'zsecret'};
const json=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

async function setup(){
 clearBusyCache();
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-booking-int-'));const {db,server}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin:'http://localhost:4320',demo:true,webhookIntervalMs:0,calendarIntervalMs:0,reminderIntervalMs:0});
 const studio=db.prepare('SELECT * FROM studios LIMIT 1').get(),user=db.prepare("SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.studio_id=? AND m.role='owner'").get(studio.id);
 installCalendarSync(db);const connect=provider=>db.prepare('INSERT INTO calendar_connections VALUES(?,?,?,?)').run(studio.id,user.id,provider,calendarCipher(env.CALENDAR_ENCRYPTION_KEY).seal({access_token:provider+'-token',refresh_token:'r',expires_at:Date.now()+3600000}));
 saveBookingSettings(db,studio.id,{...bookingSettings(db,studio.id),enabled:true,minNoticeHours:0,durationMinutes:60,bufferMinutes:0,maxPerDay:20,location:{type:'video',detail:'https://example.com/fallback-room'},weekly:Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,[{start:'00:00',end:'23:59'}]]))});
 const calls=[];let handler=()=>json({});const transport=async(url,options={})=>{const call={url,method:options.method||'GET',headers:options.headers||{},body:options.body&&typeof options.body==='string'?JSON.parse(options.body):options.body};calls.push(call);return handler(call);};
 const book=(start,key)=>{const result=bookConsultation(db,{studio,body:{name:'Ada Byron',email:'ada@example.test',start},key});return db.prepare('SELECT consultation_id FROM consultation_receipts WHERE key=?').get(key)?.consultation_id||result;};
 return {db,studio,user,connect,calls,transport,book,setHandler:fn=>{handler=fn;},close:async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});}};
}

test('choices are checked against what is connected and configured',async()=>{
 const t=await setup();
 try{
  assert.throws(()=>saveBookingIntegrations(t.db,t.studio.id,{calendar:'google'},env),e=>e.status===409);
  t.connect('google');
  assert.throws(()=>saveBookingIntegrations(t.db,t.studio.id,{calendar:'',video:'google_meet'},env),e=>e.status===409);
  assert.throws(()=>saveBookingIntegrations(t.db,t.studio.id,{calendar:'google',video:'zoom'},{...env,ZOOM_CLIENT_SECRET:''}),e=>e.status===409);
  assert.throws(()=>saveBookingIntegrations(t.db,t.studio.id,{calendar:'yahoo'},env),e=>e.status===400);
  assert.deepEqual(saveBookingIntegrations(t.db,t.studio.id,{calendar:'google',video:'google_meet'},env),{calendar:'google',checkBusy:true,video:'google_meet'});
  let view;await handleBookingIntegrations({db:t.db,req:{method:'GET'},route:'/api/booking-integrations',studio:t.studio,owner:true,env,reply:(s,d)=>{view=d;}});
  assert.equal(view.calendars.google.connected,true);assert.equal(view.calendars.outlook.connected,false);assert.equal(view.zoom.configured,true);
  await assert.rejects(()=>handleBookingIntegrations({db:t.db,req:{method:'GET'},route:'/api/booking-integrations',studio:t.studio,owner:false,env,reply(){}}),e=>e.status===403);
 }finally{await t.close();}
});

test('Google: busy times block slots, each booking gets a Meet link and calendar event, and cancelling removes it',async()=>{
 const t=await setup();
 try{
  t.connect('google');saveBookingIntegrations(t.db,t.studio.id,{calendar:'google',video:'google_meet'},env);
  const free=availableSlots(t.db,t.studio.id),blocked=free[2],start=Date.parse(blocked);
  t.setHandler(call=>call.url.endsWith('/freeBusy')?json({calendars:{primary:{busy:[{start:new Date(start+10*60000).toISOString(),end:new Date(start+20*60000).toISOString()}]}}}):json({}));
  const busy=await calendarBusy(t.db,t.studio.id,{from:Date.now(),to:Date.now()+40*86400000,env,transport:t.transport});
  assert.equal(busy.length,1);assert.equal(t.calls[0].headers.Authorization,'Bearer google-token');
  const slots=availableSlots(t.db,t.studio.id,{busy});assert.equal(slots.includes(blocked),false);assert.ok(slots.includes(free[1]));
  assert.throws(()=>bookConsultation(t.db,{studio:t.studio,body:{name:'A',email:'a@example.test',start:blocked},key:'busy-attempt-1',busy}),e=>e.status===409);

  t.setHandler(call=>call.method==='POST'&&call.url.includes('/events')?json({id:'gcal-1',hangoutLink:'https://meet.google.com/abc-defg-hij'}):json({},204));
  const id=t.book(free[0],'google-booking-1');
  assert.equal(await completeBookingIntegrations(t.db,id,{env,transport:t.transport}),'https://meet.google.com/abc-defg-hij');
  const create=t.calls.find(call=>call.method==='POST'&&call.url.includes('/events'));
  assert.match(create.url,/conferenceDataVersion=1/);assert.equal(create.body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');assert.equal(create.body.start.dateTime,free[0]);assert.match(create.body.summary,/Ada Byron/);assert.equal(create.body.attendees,undefined,'no invitations are sent');
  const before=t.calls.length;assert.equal(await completeBookingIntegrations(t.db,id,{env,transport:t.transport}),'https://meet.google.com/abc-defg-hij');assert.equal(t.calls.length,before,'finished bookings are not repeated');

  changeConsultation(t.db,{studioId:t.studio.id,user:t.user,body:{id,action:'cancel'}});
  await syncBookingIntegrations(t.db,{env,transport:t.transport});
  assert.ok(t.calls.some(call=>call.method==='DELETE'&&call.url.endsWith('/calendars/primary/events/gcal-1')));
  const data=JSON.parse(t.db.prepare('SELECT data FROM consultations WHERE id=?').get(id).data);assert.ok(data.calendarEvent.removedAt);
  const deletes=t.calls.filter(call=>call.method==='DELETE').length;await syncBookingIntegrations(t.db,{env,transport:t.transport});assert.equal(t.calls.filter(call=>call.method==='DELETE').length,deletes);
 }finally{await t.close();}
});

test('Zoom meetings are made with workspace credentials, failures are kept for retry, and Outlook gets the event',async()=>{
 const t=await setup();
 try{
  t.connect('outlook');saveBookingIntegrations(t.db,t.studio.id,{calendar:'outlook',video:'zoom'},env);
  const slot=availableSlots(t.db,t.studio.id)[0],id=t.book(slot,'zoom-booking-1');
  t.setHandler(()=>json({},500));
  assert.equal(await completeBookingIntegrations(t.db,id,{env,transport:t.transport}),null);
  let data=JSON.parse(t.db.prepare('SELECT data FROM consultations WHERE id=?').get(id).data);assert.match(data.integrationError,/Zoom/);assert.equal(data.integrationAttempts,1);
  assert.equal(t.db.prepare('SELECT status FROM consultations WHERE id=?').get(id).status,'Booked','a provider failure never undoes the booking');
  t.setHandler(call=>call.url.startsWith('https://zoom.us/oauth/token')?json({access_token:'zoom-token',expires_in:3600}):call.url.endsWith('/users/me/meetings')?json({id:987,join_url:'https://zoom.us/j/987'}):call.url.endsWith('/me/events')&&call.method==='POST'?json({id:'outlook-1'}):json({},204));
  await syncBookingIntegrations(t.db,{env,transport:t.transport});
  data=JSON.parse(t.db.prepare('SELECT data FROM consultations WHERE id=?').get(id).data);
  assert.equal(data.meeting.url,'https://zoom.us/j/987');assert.equal(data.calendarEvent.id,'outlook-1');assert.equal(data.integrationError,'');
  const token=t.calls.find(call=>call.url.startsWith('https://zoom.us/oauth/token'));assert.equal(token.headers.Authorization,'Basic '+Buffer.from('zid:zsecret').toString('base64'));
  assert.equal(t.calls.filter(call=>call.url.endsWith('/me/events')).length,1,'no event is added while the Zoom link is missing');const event=t.calls.find(call=>call.url.endsWith('/me/events')&&call.body?.location);assert.equal(event.body.location.displayName,'https://zoom.us/j/987');assert.equal(event.body.start.timeZone,'UTC');
  changeConsultation(t.db,{studioId:t.studio.id,user:t.user,body:{id,action:'cancel'}});await syncBookingIntegrations(t.db,{env,transport:t.transport});
  assert.ok(t.calls.some(call=>call.method==='DELETE'&&call.url.endsWith('/meetings/987')));assert.ok(t.calls.some(call=>call.method==='DELETE'&&call.url.endsWith('/me/events/outlook-1')));

  t.setHandler(call=>call.url.includes('/calendarView')?json({value:[{start:{dateTime:'2030-01-01T10:00:00.0000000'},end:{dateTime:'2030-01-01T11:00:00.0000000'},showAs:'busy'},{start:{dateTime:'2030-01-01T12:00:00.0000000'},end:{dateTime:'2030-01-01T13:00:00.0000000'},showAs:'free'}]}):json({}));
  const busy=await calendarBusy(t.db,t.studio.id,{from:Date.now(),to:Date.now()+86400000,env,transport:t.transport});
  assert.deepEqual(busy,[{start:Date.parse('2030-01-01T10:00:00Z'),end:Date.parse('2030-01-01T11:00:00Z')}]);
  assert.equal(t.calls.at(-1).headers.Prefer,'outlook.timezone="UTC"');
 }finally{await t.close();}
});

test('selected project dates sync in the background without pressing Sync now',async()=>{
 const t=await setup();
 try{
  t.connect('google');
  const project=t.db.prepare("SELECT id,data FROM projects WHERE studio_id=? AND data LIKE '%\"tasks\":[{%'").get(t.studio.id),task=JSON.parse(project.data).tasks[0],key=project.id+':task:'+task.id;
  t.db.prepare('INSERT INTO calendar_mappings VALUES(?,?,?,?,?)').run(t.studio.id,t.user.id,'google',key,JSON.stringify({remoteId:'evt',date:task.due,etag:'"1"',status:'Synced'}));
  t.setHandler(()=>json({id:'evt',etag:'"2"',start:{date:'2027-03-04'}}));
  assert.equal(await syncAllCalendars(t.db,{env,transport:t.transport}),1);
  assert.equal(JSON.parse(t.db.prepare('SELECT data FROM projects WHERE id=?').get(project.id).data).tasks[0].due,'2027-03-04');
  assert.equal(await syncAllCalendars(t.db,{env:{},transport:t.transport}),0,'nothing runs when calendars are not configured');
 }finally{await t.close();}
});
