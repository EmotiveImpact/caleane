import {now} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';
import {calendarAccess,calendarConfigured,connectedOwner} from './calendar-sync.mjs';

// What happens around a consultation booking beyond Caleane itself:
// - a video link made for each booking (Google Meet or Zoom), shown to the client straight away;
// - the booking added to the owner's connected Google or Outlook calendar;
// - busy times in that calendar kept out of the booking page.
// Every call to a provider is best effort. A booking never fails because a
// provider is down; missing pieces are retried in the background, and a
// cancelled booking has its meeting and calendar event removed.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const videoOptions=['fixed','google_meet','zoom'];
export const defaultBookingIntegrations={calendar:'',checkBusy:true,video:'fixed'};
const MAX_ATTEMPTS=5,BUSY_TTL_MS=120000;
const GOOGLE='https://www.googleapis.com/calendar/v3',GRAPH='https://graph.microsoft.com/v1.0';

export function zoomConfigured(env=process.env){return !!(env.ZOOM_ACCOUNT_ID&&env.ZOOM_CLIENT_ID&&env.ZOOM_CLIENT_SECRET);}
export function bookingIntegrations(db,studioId){return {...defaultBookingIntegrations,...readSetting(db,studioId,'booking_integrations',{})};}

function availability(db,studioId,env){
 const calendars=Object.fromEntries(['google','outlook'].map(provider=>[provider,{configured:calendarConfigured(provider,env),connected:calendarConfigured(provider,env)&&!!connectedOwner(db,studioId,provider)}]));
 return {calendars,zoom:{configured:zoomConfigured(env)}};
}
export function saveBookingIntegrations(db,studioId,input,env=process.env){
 const calendar=input.calendar||'';if(!['','google','outlook'].includes(calendar))fail(400,'Choose Google Calendar, Outlook or no calendar.');
 const video=input.video||'fixed';if(!videoOptions.includes(video))fail(400,'Choose how video links are made.');
 const status=availability(db,studioId,env);
 if(calendar&&!status.calendars[calendar].connected)fail(409,'Connect that calendar under Settings, Connections first.');
 if(video==='google_meet'&&calendar!=='google')fail(409,'Google Meet links are made through your Google Calendar. Choose Google Calendar above first.');
 if(video==='zoom'&&!status.zoom.configured)fail(409,'Zoom has not been set up for this workspace yet.');
 return writeSetting(db,studioId,'booking_integrations',{calendar,checkBusy:input.checkBusy!==false,video});
}

async function call(transport,url,{method='GET',token,body,headers={}}={}){
 const response=await transport(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 if(method==='DELETE'&&[200,202,204,404,410].includes(response.status))return {};
 if(!response.ok)fail(502,`The provider replied ${response.status}.`);
 return response.status===204?{}:response.json();
}

// Zoom Server-to-Server OAuth: one account-level app, no per-user sign-in.
let zoomToken=null;
async function zoomAccess(env,transport){
 if(zoomToken&&zoomToken.key===env.ZOOM_CLIENT_ID&&zoomToken.expires>Date.now()+60000)return zoomToken.value;
 const response=await transport('https://zoom.us/oauth/token?'+new URLSearchParams({grant_type:'account_credentials',account_id:env.ZOOM_ACCOUNT_ID}),{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.ZOOM_CLIENT_ID+':'+env.ZOOM_CLIENT_SECRET).toString('base64')},signal:AbortSignal.timeout(10000)});
 if(!response.ok)fail(502,'Zoom did not accept the workspace credentials.');
 const data=await response.json();zoomToken={key:env.ZOOM_CLIENT_ID,value:data.access_token,expires:Date.now()+(Number(data.expires_in)||3600)*1000};return zoomToken.value;
}

/** Busy periods in the connected calendar between two instants, as [{start,end}] in milliseconds. */
const busyCache=new Map();
export async function calendarBusy(db,studioId,{from,to,env=process.env,transport=fetch,maxAgeMs=BUSY_TTL_MS}={}){
 const settings=bookingIntegrations(db,studioId);if(!settings.calendar||!settings.checkBusy)return [];
 const cacheKey=studioId+':'+settings.calendar,cached=busyCache.get(cacheKey);
 if(cached&&Date.now()-cached.at<maxAgeMs&&cached.from<=from&&cached.to>=to)return cached.busy;
 const userId=connectedOwner(db,studioId,settings.calendar);if(!userId)return [];
 const token=await calendarAccess(db,{studioId,userId,provider:settings.calendar,env,transport});if(!token)return [];
 let busy=[];
 if(settings.calendar==='google'){
  const data=await call(transport,GOOGLE+'/freeBusy',{method:'POST',token,body:{timeMin:new Date(from).toISOString(),timeMax:new Date(to).toISOString(),items:[{id:'primary'}]}});
  busy=(data.calendars?.primary?.busy||[]).map(item=>({start:Date.parse(item.start),end:Date.parse(item.end)}));
 }else{
  let url=GRAPH+'/me/calendarView?'+new URLSearchParams({startDateTime:new Date(from).toISOString(),endDateTime:new Date(to).toISOString(),$select:'start,end,showAs,isCancelled',$top:'250'});
  for(let page=0;url&&page<5;page++){
   const data=await call(transport,url,{token,headers:{Prefer:'outlook.timezone="UTC"'}});
   busy.push(...(data.value||[]).filter(item=>!item.isCancelled&&item.showAs!=='free').map(item=>({start:Date.parse(item.start.dateTime+'Z'),end:Date.parse(item.end.dateTime+'Z')})));
   url=data['@odata.nextLink']||'';
  }
 }
 busy=busy.filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start);
 busyCache.set(cacheKey,{at:Date.now(),from,to,busy});return busy;
}
/** Like calendarBusy, but a provider problem means "no extra busy times" rather than an error. */
export async function safeCalendarBusy(db,studioId,options){
 try{return await calendarBusy(db,studioId,options);}catch(error){console.error('Calendar busy times unavailable:',error?.message||error);return [];}
}
export function clearBusyCache(){busyCache.clear();}

function readConsultation(db,consultationId){const row=db.prepare('SELECT * FROM consultations WHERE id=?').get(consultationId);return row&&{row,data:JSON.parse(row.data)};}
// Merge into the latest saved record so concurrent edits elsewhere are kept.
function mergeConsultation(db,consultationId,patch){const current=readConsultation(db,consultationId);if(!current)return null;const data={...current.data,...patch};db.prepare('UPDATE consultations SET data=? WHERE id=?').run(JSON.stringify(data),consultationId);return data;}

function eventDetails(row,data){
 const lines=[`Booked through Caleane. Reference ${row.id.slice(0,8).toUpperCase()}.`,`${data.name} · ${data.email}${data.phone?' · '+data.phone:''}`,data.notes&&`Their note: ${data.notes}`].filter(Boolean);
 return {title:`${data.title||'Consultation'} with ${data.name}`,description:lines.join('\n'),start:row.start_at,end:row.end_at};
}

/**
 * Make whatever is still missing for one booking: the video link and the calendar event.
 * Safe to call again; finished parts are skipped. Returns the booking's meeting link, if any.
 */
export async function completeBookingIntegrations(db,consultationId,{env=process.env,transport=fetch}={}){
 let current=readConsultation(db,consultationId);if(!current||current.row.status!=='Booked')return null;
 const {row}=current,settings=bookingIntegrations(db,row.studio_id),wantsMeeting=row.status==='Booked'&&current.data.location?.type==='video'&&settings.video!=='fixed',wantsCalendar=!!settings.calendar;
 let data=current.data;
 if((!wantsMeeting||data.meeting?.url)&&(!wantsCalendar||data.calendarEvent?.id))return data.meeting?.url||null;
 if((data.integrationAttempts||0)>=MAX_ATTEMPTS)return data.meeting?.url||null;
 const details=eventDetails(row,data),errors=[];
 try{
  if(wantsMeeting&&settings.video==='zoom'&&!data.meeting?.url){
   if(!zoomConfigured(env))fail(503,'Zoom is not set up.');
   const meeting=await call(transport,'https://api.zoom.us/v2/users/me/meetings',{method:'POST',token:await zoomAccess(env,transport),body:{topic:details.title,type:2,start_time:row.start_at.replace(/\.\d+Z$/,'Z'),duration:Math.round((Date.parse(row.end_at)-Date.parse(row.start_at))/60000),timezone:data.timezone||'UTC',agenda:details.description.slice(0,1900),settings:{join_before_host:false,waiting_room:true}}});
   if(!meeting.join_url)fail(502,'Zoom did not return a link.');
   data=mergeConsultation(db,consultationId,{meeting:{provider:'zoom',id:String(meeting.id),url:meeting.join_url,createdAt:now()}});
  }
 }catch(error){errors.push('Zoom: '+error.message);}
 try{
  // Wait for the Zoom link before adding the event, so the calendar never holds the wrong link.
  if(wantsCalendar&&!data.calendarEvent?.id&&!(wantsMeeting&&settings.video==='zoom'&&!data.meeting?.url)){
   const userId=connectedOwner(db,row.studio_id,settings.calendar),token=userId&&await calendarAccess(db,{studioId:row.studio_id,userId,provider:settings.calendar,env,transport});
   if(!token)fail(409,'The calendar is no longer connected.');
   const location=data.meeting?.url||data.location?.detail||'',meet=wantsMeeting&&settings.video==='google_meet'&&!data.meeting?.url;
   if(settings.calendar==='google'){
    const created=await call(transport,GOOGLE+'/calendars/primary/events'+(meet?'?conferenceDataVersion=1':''),{method:'POST',token,body:{summary:details.title,description:details.description,location,start:{dateTime:details.start},end:{dateTime:details.end},...(meet?{conferenceData:{createRequest:{requestId:'caleane-'+row.id,conferenceSolutionKey:{type:'hangoutsMeet'}}}}:{})}});
    const meetUrl=created.hangoutLink||created.conferenceData?.entryPoints?.find(point=>point.entryPointType==='video')?.uri||'';
    data=mergeConsultation(db,consultationId,{calendarEvent:{provider:'google',id:created.id,userId,createdAt:now()},...(meet&&meetUrl?{meeting:{provider:'google_meet',id:created.id,url:meetUrl,createdAt:now()}}:{})});
    if(meet&&!meetUrl)errors.push('Google did not return a Meet link.');
   }else{
    const created=await call(transport,GRAPH+'/me/events',{method:'POST',token,body:{subject:details.title,body:{contentType:'text',content:details.description},start:{dateTime:details.start.replace(/Z$/,''),timeZone:'UTC'},end:{dateTime:details.end.replace(/Z$/,''),timeZone:'UTC'},location:{displayName:location},transactionId:'caleane-'+row.id}});
    data=mergeConsultation(db,consultationId,{calendarEvent:{provider:'outlook',id:created.id,userId,createdAt:now()}});
   }
  }
 }catch(error){errors.push((settings.calendar==='google'?'Google Calendar: ':'Outlook: ')+error.message);}
 data=mergeConsultation(db,consultationId,{integrationAttempts:(data.integrationAttempts||0)+(errors.length?1:0),integrationError:errors.join(' ')})||data;
 return data.meeting?.url||null;
}

/** Remove the meeting and calendar event of a cancelled booking. */
async function removeBookingIntegrations(db,consultationId,{env,transport}){
 const current=readConsultation(db,consultationId);if(!current)return;let {data}=current;const studioId=current.row.studio_id;
 if(data.meeting?.provider==='zoom'&&!data.meeting.removedAt&&zoomConfigured(env)){
  await call(transport,'https://api.zoom.us/v2/meetings/'+encodeURIComponent(data.meeting.id),{method:'DELETE',token:await zoomAccess(env,transport)});
  data=mergeConsultation(db,consultationId,{meeting:{...data.meeting,removedAt:now()}});
 }
 if(data.calendarEvent?.id&&!data.calendarEvent.removedAt){
  const {provider,id,userId}=data.calendarEvent,token=await calendarAccess(db,{studioId,userId,provider,env,transport});
  if(token)await call(transport,provider==='google'?`${GOOGLE}/calendars/primary/events/${encodeURIComponent(id)}`:`${GRAPH}/me/events/${encodeURIComponent(id)}`,{method:'DELETE',token});
  data=mergeConsultation(db,consultationId,{calendarEvent:{...data.calendarEvent,removedAt:now()},...(data.meeting?.provider==='google_meet'?{meeting:{...data.meeting,removedAt:now()}}:{})});
 }
}

/** Background pass: finish recent bookings that are missing a link or event, and tidy up cancelled ones. */
export async function syncBookingIntegrations(db,{env=process.env,transport=fetch}={}){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='consultations'").get())return;
 const studios=new Set(db.prepare("SELECT studio_id FROM studio_settings_kv WHERE key='booking_integrations'").all().map(row=>row.studio_id));
 const cutoff=new Date().toISOString();
 for(const row of db.prepare("SELECT id,studio_id,status,data FROM consultations WHERE end_at>?").all(cutoff)){
  try{
   const data=JSON.parse(row.data);
   if(row.status==='Booked'&&studios.has(row.studio_id))await completeBookingIntegrations(db,row.id,{env,transport});
   else if(row.status==='Cancelled'&&((data.meeting?.provider==='zoom'&&!data.meeting.removedAt)||(data.calendarEvent?.id&&!data.calendarEvent.removedAt)))await removeBookingIntegrations(db,row.id,{env,transport});
  }catch(error){console.error('Booking integration sync failed:',error?.message||error);}
 }
}

export async function handleBookingIntegrations({db,req,route,body,studio,owner,reply,env=process.env,transport=fetch}){
 if(route!=='/api/booking-integrations')return false;
 if(!owner)fail(403,'Only the studio owner can manage booking connections.');
 const view=()=>{
  const upcoming=db.prepare("SELECT id,data FROM consultations WHERE studio_id=? AND status='Booked' AND end_at>? ORDER BY start_at LIMIT 50").all(studio.id,new Date().toISOString()).map(row=>{const data=JSON.parse(row.data);return {id:row.id,meetingUrl:data.meeting?.url||'',meetingProvider:data.meeting?.provider||'',calendar:data.calendarEvent?.provider||'',error:data.integrationError||''};});
  return {settings:bookingIntegrations(db,studio.id),...availability(db,studio.id,env),upcoming};
 };
 if(req.method==='GET')return reply(200,view()),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(body.action==='save'){saveBookingIntegrations(db,studio.id,body.settings||{},env);clearBusyCache();}
 else if(body.action==='retry'){
  const row=db.prepare("SELECT id FROM consultations WHERE id=? AND studio_id=? AND status='Booked'").get(String(body.id||''),studio.id);if(!row)fail(404,'Booking not found.');
  mergeConsultation(db,row.id,{integrationAttempts:0,integrationError:''});await completeBookingIntegrations(db,row.id,{env,transport});
 }else fail(400,'Choose an action.');
 return reply(200,view()),true;
}
