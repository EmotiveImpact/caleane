import {createHash,randomBytes} from 'node:crypto';
import {id,now,transaction,makeProject,insertProject,event,saveProject} from './store.mjs';
import {ensurePrimaryContact} from './relationships.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';
import {recordConsultation} from './notification-feed.mjs';
import {DEFAULT_WORKFLOW,isWorkflowId} from './src/lib/workflows.js';
import {CURRENCIES} from './src/lib/currencies.js';

// Self-service consultation booking. The studio publishes weekly availability;
// a prospective client picks a free slot from a public page. Each booking is
// linked to a client record and appears as a dated private follow-up, so it
// shows on Home and in the Calendar without a separate scheduling system.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,label,required=false)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);const result=value.trim();if(required&&!result)fail(400,`Add ${label}.`);return result;};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
export const locationTypes=['video','phone','in_person'];
export const defaultBookingSettings={enabled:false,title:'Discovery call',description:'A relaxed first conversation about your project, your date and what you have in mind.',durationMinutes:30,bufferMinutes:15,minNoticeHours:24,horizonDays:30,maxPerDay:4,timezone:'Europe/London',location:{type:'video',detail:''},
 weekly:{1:[{start:'10:00',end:'17:00'}],2:[{start:'10:00',end:'17:00'}],3:[{start:'10:00',end:'17:00'}],4:[{start:'10:00',end:'17:00'}],5:[{start:'10:00',end:'15:00'}]},
 // Card payment at booking. Off by default, and only used while Stripe card payments are available.
 payment:{required:false,amountMinor:5000,currency:'GBP',label:'Booking fee'}};
export const bookingCurrencies=CURRENCIES;
// A paid booking holds its time while the client is on Stripe. The Checkout page closes first
// (31 minutes, Stripe's minimum is 30), so a payment can never land after the hold has lapsed.
export const PAYMENT_HOLD_MS=34*60000;

export function installConsultations(db){db.exec(`
 CREATE TABLE IF NOT EXISTS consultations(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS consultations_studio_start ON consultations(studio_id,start_at);
 CREATE TABLE IF NOT EXISTS consultation_receipts(studio_id TEXT NOT NULL,key TEXT NOT NULL,consultation_id TEXT NOT NULL,PRIMARY KEY(studio_id,key));`);}

// Offset in milliseconds between UTC and the studio's local time at `ms`.
function zoneOffset(ms,timeZone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms)).map(part=>[part.type,part.value]));
 return Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-Math.floor(ms/1000)*1000;
}
export function localToUtc(day,time,timeZone){
 const [y,m,d]=day.split('-').map(Number),[h,mi]=time.split(':').map(Number),guess=Date.UTC(y,m-1,d,h,mi);
 let result=guess-zoneOffset(guess,timeZone);result=guess-zoneOffset(result,timeZone);return result;
}
export function localDay(ms,timeZone){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
export function localTime(ms,timeZone){return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));}
const validZone=zone=>{try{new Intl.DateTimeFormat('en-GB',{timeZone:zone});return true;}catch{return false;}};

export function bookingSettings(db,studioId){const saved=readSetting(db,studioId,'booking',{});return {...structuredClone(defaultBookingSettings),...saved,payment:{...defaultBookingSettings.payment,...saved.payment}};}
export function saveBookingSettings(db,studioId,input,{paymentsAvailable=false}={}){
 const result={enabled:input.enabled===true,title:text(input.title,80,'the booking title',true),description:text(input.description,500,'the description')};
 for(const [key,min,max] of [['durationMinutes',15,240],['bufferMinutes',0,120],['minNoticeHours',0,336],['horizonDays',1,120],['maxPerDay',1,20]]){const value=input[key];if(!Number.isInteger(value)||value<min||value>max)fail(400,`Use a whole number between ${min} and ${max}.`);result[key]=value;}
 result.timezone=text(input.timezone||'Europe/London',60,'the time zone');if(!validZone(result.timezone))fail(400,'Choose a valid time zone.');
 const type=input.location?.type;if(!locationTypes.includes(type))fail(400,'Choose how the consultation happens.');
 result.location={type,detail:text(input.location?.detail,300,'the location details')};
 result.weekly={};
 for(const [dayKey,windows] of Object.entries(input.weekly||{})){
  if(!/^[0-6]$/.test(dayKey)||!Array.isArray(windows)||windows.length>3)fail(400,'Check your weekly hours.');
  const clean=windows.map(window=>{if(!timePattern.test(window?.start)||!timePattern.test(window?.end)||window.start>=window.end)fail(400,'Each available period needs a start before its end.');return {start:window.start,end:window.end};});
  if(clean.length)result.weekly[dayKey]=clean.sort((a,b)=>a.start.localeCompare(b.start));
 }
 const payment=input.payment||defaultBookingSettings.payment;
 if(!Number.isSafeInteger(payment.amountMinor)||payment.amountMinor<100||payment.amountMinor>1000000)fail(400,'Use a booking payment between 1 and 10,000.');
 if(!bookingCurrencies.includes(payment.currency))fail(400,'Choose a currency for the booking payment.');
 result.payment={required:payment.required===true,amountMinor:payment.amountMinor,currency:payment.currency,label:text(payment.label||'Booking fee',60,'the payment name',true)};
 if(result.payment.required&&!paymentsAvailable)fail(409,'Connect Stripe and switch on card payments before asking for payment at booking.');
 return writeSetting(db,studioId,'booking',result);
}

// Confirmed bookings, plus times held while a client pays. `exclude` leaves out a booking being moved.
function booked(db,studioId,nowMs=Date.now(),exclude=''){return db.prepare("SELECT id,start_at,end_at,status,data FROM consultations WHERE studio_id=? AND status IN ('Booked','Awaiting payment') AND end_at>?").all(studioId,new Date(nowMs-86400000).toISOString())
 .filter(row=>row.id!==exclude).filter(row=>row.status==='Booked'||Date.parse(JSON.parse(row.data).payment?.holdUntil||0)>nowMs).map(row=>({start:Date.parse(row.start_at),end:Date.parse(row.end_at)}));}

// `busy` holds extra busy periods, such as events in the owner's connected calendar. They block
// overlapping times but do not count towards the daily limit.
export function availableSlots(db,studioId,{nowMs=Date.now(),settings=bookingSettings(db,studioId),busy=[],exclude=''}={}){
 const zone=settings.timezone,duration=settings.durationMinutes*60000,buffer=settings.bufferMinutes*60000,earliest=nowMs+settings.minNoticeHours*3600000,taken=booked(db,studioId,nowMs,exclude),slots=[];
 const perDay=new Map();for(const item of taken){const day=localDay(item.start,zone);perDay.set(day,(perDay.get(day)||0)+1);}
 const firstDay=localDay(nowMs,zone);
 for(let offset=0;offset<=settings.horizonDays;offset++){
  const day=new Date(Date.parse(firstDay+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),weekday=new Date(day+'T12:00:00Z').getUTCDay();
  let count=perDay.get(day)||0;
  for(const window of settings.weekly[weekday]||[]){
   const windowEnd=localToUtc(day,window.end,zone);
   for(let start=localToUtc(day,window.start,zone);start+duration<=windowEnd;start+=duration+buffer){
    if(count>=settings.maxPerDay)break;
    if(start<earliest)continue;
    if(taken.some(item=>start<item.end+buffer&&start+duration+buffer>item.start))continue;
    if(busy.some(item=>start<item.end&&start+duration>item.start))continue;
    slots.push(new Date(start).toISOString());
   }
  }
 }
 return slots;
}

function consultationDTO(row){return {id:row.id,start:row.start_at,end:row.end_at,status:row.status,createdAt:row.created_at,...JSON.parse(row.data)};}
export function listConsultations(db,studioId){return db.prepare("SELECT * FROM consultations WHERE studio_id=? ORDER BY CASE WHEN status='Booked' AND end_at>=? THEN 0 ELSE 1 END,start_at").all(studioId,new Date().toISOString()).map(consultationDTO).slice(0,200);}

function clientFor(db,studioId,{name,email,phone}){
 let client=db.prepare('SELECT * FROM clients WHERE studio_id=? AND email=?').get(studioId,email);
 if(!client){
  const clientId=id(),at=now();
  db.prepare('INSERT INTO clients VALUES(?,?,?,?,?)').run(clientId,studioId,email,name,JSON.stringify({company:'',phone,stage:'Lead',source:'Consultation booking',tags:[],notes:[],followUp:'',createdAt:at,updatedAt:at}));
  client=db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
 }
 ensurePrimaryContact(db,client);return client;
}

// Adds the dated follow-up that puts a confirmed booking on Home and in the Calendar.
function addBookingTask(db,studioId,data,startMs){
 const taskId=id();
 db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
  .run(taskId,studioId,data.clientId,null,`${data.title} with ${data.name} at ${localTime(startMs,data.timezone)}`,[data.phone&&`Phone: ${data.phone}`,data.notes&&`Their note: ${data.notes}`,data.location?.detail&&`Where: ${data.location.detail}`].filter(Boolean).join('\n'),localDay(startMs,data.timezone),'High',now(),'Online booking');
 return taskId;
}
// The client manages their booking with a private link. Only digests are stored; a few links
// can be live at once (the confirmation screen, each confirmation email), and each one works alone.
const digest=token=>createHash('sha256').update(token).digest('hex');
export function issueManageToken(db,consultationId){
 const row=db.prepare('SELECT data FROM consultations WHERE id=?').get(consultationId),data=JSON.parse(row.data),token=randomBytes(24).toString('base64url');
 data.manageDigests=[...(data.manageDigests||[]),digest(token)].slice(-5);
 db.prepare('UPDATE consultations SET data=? WHERE id=?').run(JSON.stringify(data),consultationId);return token;
}
export function bookingForToken(db,studioId,token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))fail(404,'This booking link is not valid. Please contact the studio.');
 const wanted=digest(token),row=db.prepare('SELECT * FROM consultations WHERE studio_id=? AND data LIKE ?').all(studioId,`%${wanted}%`).find(item=>(JSON.parse(item.data).manageDigests||[]).includes(wanted));
 if(!row)fail(404,'This booking link is not valid. Please contact the studio.');
 return row;
}
function receipt(row,manageToken=''){
 const data=JSON.parse(row.data),result={ok:true,reference:row.id.slice(0,8).toUpperCase(),bookingId:row.id,status:row.status,start:row.start_at,end:row.end_at,title:data.title,...(manageToken?{manageToken}:{})};
 if(row.status==='Booked')result.location=data.location;
 if(data.payment)result.payment={amountMinor:data.payment.amountMinor,currency:data.payment.currency,label:data.payment.label,status:data.payment.status};
 return result;
}

const when=(ms,zone)=>`${new Date(ms).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:zone})} at ${localTime(ms,zone)}`;
// A confirmed booking joins the Pipeline: it attaches to the client's open enquiry when they
// already have one, or starts a new enquiry, and the studio is notified either way.
function settleBooking(db,studioId,consultationId){
 const row=db.prepare('SELECT * FROM consultations WHERE id=?').get(consultationId),data=JSON.parse(row.data),startMs=Date.parse(row.start_at),note=`Booked a ${data.title} for ${when(startMs,data.timezone)}`;
 const open=db.prepare(`SELECT o.id,o.project_id FROM crm_opportunities o JOIN projects p ON p.id=o.project_id AND p.studio_id=o.studio_id WHERE o.studio_id=? AND o.client_id=? AND o.stage NOT IN ('Won','Lost') ORDER BY o.updated_at DESC LIMIT 1`).get(studioId,data.clientId);
 let projectId=open?.project_id;
 if(projectId){const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId).data);event(p,{name:data.name},note);saveProject(db,p);}
 else{
  const brand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(studioId)?.data||'{}'),workflowType=isWorkflowId(brand.profession)?brand.profession:DEFAULT_WORKFLOW;
  const p=makeProject(studioId,{name:data.name,email:data.email,occasion:data.title,date:'',venue:'',vision:data.notes||'',colours:[],customColours:'',pinterest:'',budget:'',workflowType,details:{},intakeAnswers:[]},{name:data.name},data.clientId);
  event(p,{name:data.name},note);insertProject(db,p);projectId=p.id;
  db.prepare("UPDATE crm_opportunities SET source='Consultation booking' WHERE project_id=? AND studio_id=?").run(p.id,studioId);
 }
 data.projectId=projectId;data.opportunityId=db.prepare('SELECT id FROM crm_opportunities WHERE project_id=? AND studio_id=?').get(projectId,studioId)?.id||null;
 db.prepare('UPDATE consultations SET data=? WHERE id=?').run(JSON.stringify(data),row.id);
 recordConsultation(db,{studioId,consultationId:row.id,change:'booked'});
}

/** Public: `takePayment` is decided by the server from the studio setting and Stripe availability. */
export function bookConsultation(db,{studio,body,key,nowMs=Date.now(),busy=[],takePayment=false}){
 const settings=bookingSettings(db,studio.id);if(!settings.enabled)fail(404,'Online booking is not available for this studio.');
 if(body.website)fail(400,'Please leave the website field empty.');
 if(typeof key!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(key))fail(400,'Refresh the page and try again.');
 const prior=db.prepare('SELECT c.* FROM consultation_receipts r JOIN consultations c ON c.id=r.consultation_id WHERE r.studio_id=? AND r.key=?').get(studio.id,key);
 if(prior)return {status:200,data:receipt(prior,issueManageToken(db,prior.id))};
 const name=text(body.name,120,'your name',true),email=text(body.email,254,'your email',true).toLowerCase();if(!emailPattern.test(email))fail(400,'Enter a valid email address.');
 const phone=text(body.phone,40,'your phone number'),notes=text(body.notes,2000,'your note'),start=text(body.start,40,'the time');
 return transaction(db,()=>{
  if(!availableSlots(db,studio.id,{nowMs,settings,busy}).includes(start))fail(409,'That time has just been taken. Please choose another.');
  const startMs=Date.parse(start),end=new Date(startMs+settings.durationMinutes*60000).toISOString(),client=clientFor(db,studio.id,{name,email,phone});
  const consultationId=id(),data={name,email,phone,notes,title:settings.title,timezone:settings.timezone,location:settings.location,clientId:client.id};
  const paid=takePayment&&settings.payment.required;
  if(paid)data.payment={amountMinor:settings.payment.amountMinor,currency:settings.payment.currency,label:settings.payment.label,status:'pending',holdUntil:new Date(nowMs+PAYMENT_HOLD_MS).toISOString()};
  else data.taskId=addBookingTask(db,studio.id,data,startMs);
  db.prepare('INSERT INTO consultations VALUES(?,?,?,?,?,?,?)').run(consultationId,studio.id,start,end,paid?'Awaiting payment':'Booked',JSON.stringify(data),now());
  db.prepare('INSERT INTO consultation_receipts VALUES(?,?,?)').run(studio.id,key,consultationId);
  if(!paid)settleBooking(db,studio.id,consultationId);
  return {status:201,data:receipt(db.prepare('SELECT * FROM consultations WHERE id=?').get(consultationId),issueManageToken(db,consultationId))};
 });
}

/** Confirms a held booking once Stripe has verified its payment. Runs inside the webhook transaction. */
export function confirmPaidBooking(db,row,payment){
 const data=JSON.parse(row.data);
 data.payment={...data.payment,...payment,status:'paid'};
 data.taskId=addBookingTask(db,row.studio_id,data,Date.parse(row.start_at));
 if(db.prepare("UPDATE consultations SET status='Booked',data=? WHERE id=? AND status='Awaiting payment'").run(JSON.stringify(data),row.id).changes)settleBooking(db,row.studio_id,row.id);
}
export function releaseHeldBooking(db,row,{reason='abandoned',review=''}={}){
 const data=JSON.parse(row.data);data.payment={...data.payment,status:reason,...(review?{review}:{})};
 db.prepare('UPDATE consultations SET status=?,data=? WHERE id=?').run(review?'Needs review':'Unpaid',JSON.stringify(data),row.id);
}
export function bookingRow(db,studioId,bookingId){
 if(typeof bookingId!=='string'||!/^[a-f0-9-]{36}$/.test(bookingId))fail(404,'Booking not found.');
 const row=db.prepare('SELECT * FROM consultations WHERE id=? AND studio_id=?').get(bookingId,studioId);if(!row)fail(404,'Booking not found.');
 return row;
}
export function publicBookingStatus(db,studio,bookingId){return receipt(bookingRow(db,studio.id,bookingId));}

export function changeConsultation(db,{studioId,user,body}){
 const row=db.prepare('SELECT * FROM consultations WHERE id=? AND studio_id=?').get(text(body.id,64,'the booking'),studioId);if(!row)fail(404,'Booking not found.');
 const data=JSON.parse(row.data);
 if(!['cancel','complete','no_show'].includes(body.action))fail(400,'Choose a booking action.');
 if(row.status!=='Booked')fail(409,'This booking has already been closed.');
 const status={cancel:'Cancelled',complete:'Completed',no_show:'No-show'}[body.action];
 data.closedBy=user.name;data.closedAt=now();data.closeNote=text(body.note,500,'the note');
 transaction(db,()=>{
  db.prepare('UPDATE consultations SET status=?,data=? WHERE id=?').run(status,JSON.stringify(data),row.id);
  if(data.taskId)db.prepare("UPDATE crm_tasks SET completed=1,completed_at=?,title=CASE WHEN ?='Cancelled' AND title NOT LIKE 'Cancelled: %' THEN 'Cancelled: '||title ELSE title END WHERE id=? AND studio_id=?").run(now(),status,data.taskId,studioId);
 });
 return consultationDTO(db.prepare('SELECT * FROM consultations WHERE id=?').get(row.id));
}

/** Public, by private link: view, move or cancel a booking. Returns what changed so the server can email the client. */
export function manageBooking(db,{studio,body,nowMs=Date.now(),busy=[]}){
 const settings=bookingSettings(db,studio.id),action=body?.action||'view';
 if(!['view','reschedule','cancel'].includes(action))fail(400,'Choose what to do with your booking.');
 return transaction(db,()=>{
  let row=bookingForToken(db,studio.id,body.token),changed='';
  const data=JSON.parse(row.data),open=row.status==='Booked'&&Date.parse(row.start_at)>nowMs;
  if(action!=='view'){
   if(!open)fail(409,row.status==='Cancelled'?'This booking has already been cancelled.':'This booking can no longer be changed online. Please contact the studio.');
   const previous=row.start_at;
   if(action==='reschedule'){
    const start=text(body.start,40,'the new time');
    if(!settings.enabled||!availableSlots(db,studio.id,{nowMs,settings,busy,exclude:row.id}).includes(start))fail(409,'That time is no longer free. Please choose another.');
    const startMs=Date.parse(start),end=new Date(startMs+settings.durationMinutes*60000).toISOString();
    data.history=[...(data.history||[]),{at:now(),from:previous,to:start}];
    if(data.taskId)db.prepare('UPDATE crm_tasks SET title=?,due_date=? WHERE id=? AND studio_id=?').run(`${data.title} with ${data.name} at ${localTime(startMs,data.timezone)}`,localDay(startMs,data.timezone),data.taskId,studio.id);
    db.prepare('UPDATE consultations SET start_at=?,end_at=?,data=? WHERE id=?').run(start,end,JSON.stringify(data),row.id);changed='rescheduled';
   }else{
    data.closedBy=data.name;data.closedAt=now();data.closeNote='Cancelled by the client';
    db.prepare("UPDATE consultations SET status='Cancelled',data=? WHERE id=?").run(JSON.stringify(data),row.id);
    if(data.taskId)db.prepare("UPDATE crm_tasks SET completed=1,completed_at=?,title=CASE WHEN title NOT LIKE 'Cancelled: %' THEN 'Cancelled: '||title ELSE title END WHERE id=? AND studio_id=?").run(now(),data.taskId,studio.id);
    changed='cancelled';
   }
   row=db.prepare('SELECT * FROM consultations WHERE id=?').get(row.id);
   if(data.projectId){const project=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(data.projectId,studio.id);if(project){const p=JSON.parse(project.data);event(p,{name:data.name},changed==='cancelled'?`Cancelled the ${data.title} on ${when(Date.parse(previous),data.timezone)}`:`Moved the ${data.title} to ${when(Date.parse(row.start_at),data.timezone)}`);saveProject(db,p);}}
   recordConsultation(db,{studioId:studio.id,consultationId:row.id,change:changed});
  }
  const live=row.status==='Booked'&&Date.parse(row.start_at)>nowMs;
  return {changed,bookingId:row.id,booking:{...receipt(row),durationMinutes:Math.round((Date.parse(row.end_at)-Date.parse(row.start_at))/60000),timezone:data.timezone,canChange:live},
   studio:{name:studio.name,slug:studio.slug,accent:studio.accent},slots:live&&settings.enabled?availableSlots(db,studio.id,{nowMs,settings,busy,exclude:row.id}).filter(slot=>slot!==row.start_at):[]};
 });
}

/** The confirmation email for a booking: queued behind the email switch, sent only when email delivery is on. */
export function bookingEmail(db,{studio,consultationId,change,manageUrl}){
 const row=db.prepare('SELECT * FROM consultations WHERE id=? AND studio_id=?').get(consultationId,studio.id),data=JSON.parse(row.data),at=when(Date.parse(row.start_at),data.timezone),zone=data.timezone.replaceAll('_',' ');
 const subject={booked:`Your ${data.title} with ${studio.name} is booked`,rescheduled:`Your ${data.title} with ${studio.name} has moved`,cancelled:`Your ${data.title} with ${studio.name} is cancelled`}[change];
 const lines=change==='cancelled'?[`Hi ${data.name},`,'',`Your ${data.title} with ${studio.name} on ${at} (${zone} time) has been cancelled. Nothing more is needed from you.`,'',`To book another time: ${new URL(`/book/${studio.slug}`,manageUrl).href}`]
  :[`Hi ${data.name},`,'',`Your ${data.title} with ${studio.name} is ${change==='rescheduled'?'now':'booked'} for ${at} (${zone} time), for ${Math.round((Date.parse(row.end_at)-Date.parse(row.start_at))/60000)} minutes.`,...(data.location?.detail?['',`Where: ${data.location.detail}`]:[]),'',`Add it to your calendar, reschedule or cancel here: ${manageUrl}`,'',`Reference ${row.id.slice(0,8).toUpperCase()}`];
 return {to:data.email,subject,text:lines.join('\n')};
}

export function publicBooking(db,studio,{nowMs=Date.now(),busy=[],takePayment=false}={}){
 const settings=bookingSettings(db,studio.id);if(!settings.enabled)fail(404,'Online booking is not available for this studio.');
 const brand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(studio.id)?.data||'{}');
 return {studio:{name:studio.name,slug:studio.slug,accent:studio.accent,logoUrl:brand.logoUrl||'',portalTitle:brand.portalTitle||studio.name},
  booking:{title:settings.title,description:settings.description,durationMinutes:settings.durationMinutes,timezone:settings.timezone,location:{type:settings.location.type},payment:takePayment&&settings.payment.required?{amountMinor:settings.payment.amountMinor,currency:settings.payment.currency,label:settings.payment.label}:null},slots:availableSlots(db,studio.id,{nowMs,settings,busy})};
}

export async function handleConsultations({db,req,route,body,studio,owner,user,reply,origin,paymentsAvailable=false}){
 if(route!=='/api/consultations')return false;
 if(!owner)fail(403,'Only the studio owner can manage bookings.');
 installConsultations(db);
 const view=()=>({settings:bookingSettings(db,studio.id),consultations:listConsultations(db,studio.id),bookingUrl:`${origin}/book/${studio.slug}`,paymentsAvailable});
 if(req.method==='GET')return reply(200,view()),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(body.action==='save-settings')saveBookingSettings(db,studio.id,body.settings||{},{paymentsAvailable});
 else changeConsultation(db,{studioId:studio.id,user,body});
 return reply(200,view()),true;
}
