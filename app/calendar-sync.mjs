import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {now,event,saveProject} from './store.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const providers={google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'},outlook:{auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scope:'offline_access Calendars.ReadWrite'}};
const locks=new Set();
export function installCalendarSync(db){db.exec(`CREATE TABLE IF NOT EXISTS calendar_connections(studio_id TEXT NOT NULL,user_id TEXT NOT NULL,provider TEXT NOT NULL,secret TEXT NOT NULL,PRIMARY KEY(studio_id,user_id,provider));CREATE TABLE IF NOT EXISTS calendar_oauth(state TEXT PRIMARY KEY,studio_id TEXT NOT NULL,user_id TEXT NOT NULL,provider TEXT NOT NULL,secret TEXT NOT NULL,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS calendar_mappings(studio_id TEXT NOT NULL,user_id TEXT NOT NULL,provider TEXT NOT NULL,item_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(studio_id,user_id,provider,item_key));`);}
export function calendarCipher(secret){const key=Buffer.from(secret||'','base64');if(key.length!==32)fail(503,'Calendar encryption is not configured.');return {seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');},open(value){try{const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}catch{fail(503,'Calendar credentials cannot be read. Reconnect after restoring the encryption key.');}}};}
const hash=s=>createHash('sha256').update(s).digest('hex');
const nextDay=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function items(db,sid){return db.prepare('SELECT data FROM projects WHERE studio_id=?').all(sid).flatMap(r=>{const p=JSON.parse(r.data);return [...(p.tasks||[]).filter(t=>!t.completed&&validDate(t.due)).map(t=>({key:p.id+':task:'+t.id,projectId:p.id,title:t.title,project:p.title,date:t.due})),...(p.operations?.milestones||[]).filter(t=>!t.archivedAt&&validDate(t.dueDate)).map(t=>({key:p.id+':milestone:'+t.id,projectId:p.id,title:t.title,project:p.title,date:t.dueDate}))];});}
export function calendarAdapter(provider,transport=fetch){
 const base=provider==='google'?'https://www.googleapis.com/calendar/v3/calendars/primary/events':'https://graph.microsoft.com/v1.0/me/calendar/events';
 async function call(token,url,method='GET',body,etag){const r=await transport(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(r.status===409&&provider==='google'&&method==='POST'&&body?.id)return call(token,base+'/'+encodeURIComponent(body.id));if(r.status===404||r.status===410)return null;if(r.status===412)fail(409,'The calendar event changed during sync. Sync again before resolving.');if(!r.ok)fail(r.status===401?401:502,r.status===401?'Calendar access expired. Reconnect your calendar.':'The calendar provider could not complete this request. Try again.');return r.status===204?{}:r.json();}
 const payload=(item,create=false)=>provider==='google'?{summary:item.project+' · '+item.title,start:{date:item.date},end:{date:nextDay(item.date)},...(create?{id:'caleane'+hash(item.key).slice(0,40)}:{})}:{subject:item.project+' · '+item.title,isAllDay:true,start:{dateTime:item.date+'T00:00:00',timeZone:'UTC'},end:{dateTime:nextDay(item.date)+'T00:00:00',timeZone:'UTC'},...(create?{transactionId:hash(item.key).slice(0,32)}:{})};
 return {get:(token,id)=>call(token,base+'/'+encodeURIComponent(id)),create:(token,item)=>call(token,base,'POST',payload(item,true)),update:(token,id,item,etag)=>call(token,base+'/'+encodeURIComponent(id),'PATCH',payload(item),etag),date:r=>provider==='google'?r.start?.date:r.isAllDay?r.start?.dateTime?.slice(0,10):null,etag:r=>r.etag||r['@odata.etag']||''};
}
const calendarConfigs=env=>Object.fromEntries(Object.keys(providers).map(p=>[p,{id:env['CALENDAR_'+p.toUpperCase()+'_CLIENT_ID'],secret:env['CALENDAR_'+p.toUpperCase()+'_CLIENT_SECRET']}]));
export function calendarConfigured(provider,env=process.env){const cfg=calendarConfigs(env)[provider];return !!(cfg?.id&&cfg?.secret&&env.CALENDAR_ENCRYPTION_KEY);}
async function tokenRequest(provider,env,values,transport){const cfg=calendarConfigs(env)[provider],r=await transport(providers[provider].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.id,client_secret:cfg.secret,...values}),signal:AbortSignal.timeout(15000)});if(!r.ok)fail(401,'Calendar authorization failed. Reconnect your calendar.');const t=await r.json();if(!t.access_token)fail(502,'The provider did not return calendar access.');return {...t,expires_at:Date.now()+(Number(t.expires_in)||3600)*1000};}
const putToken=(db,cipher,args,provider,t)=>db.prepare('INSERT INTO calendar_connections VALUES(?,?,?,?) ON CONFLICT(studio_id,user_id,provider) DO UPDATE SET secret=excluded.secret').run(...args,provider,cipher.seal(t));
// A current access token for one connected calendar, renewed and saved when it is about to expire.
async function freshToken(db,{args,provider,env,transport,token}){
 if(token.expires_at>=Date.now()+60000)return token;
 if(!token.refresh_token)fail(401,'Reconnect your calendar to renew access.');
 const next={...token,...await tokenRequest(provider,env,{grant_type:'refresh_token',refresh_token:token.refresh_token},transport)};putToken(db,calendarCipher(env.CALENDAR_ENCRYPTION_KEY),args,provider,next);return next;
}
/** The access token for a studio member's connected calendar, or null when it is not connected or not configured. */
export async function calendarAccess(db,{studioId,userId,provider,env=process.env,transport=fetch}){
 if(!providers[provider]||!calendarConfigured(provider,env))return null;installCalendarSync(db);
 const row=db.prepare('SELECT secret FROM calendar_connections WHERE studio_id=? AND user_id=? AND provider=?').get(studioId,userId,provider);if(!row)return null;
 return (await freshToken(db,{args:[studioId,userId],provider,env,transport,token:calendarCipher(env.CALENDAR_ENCRYPTION_KEY).open(row.secret)})).access_token;
}
/** The studio owner whose calendar a provider is connected for, if any. */
export function connectedOwner(db,studioId,provider){installCalendarSync(db);return db.prepare("SELECT c.user_id FROM calendar_connections c JOIN memberships m ON m.user_id=c.user_id AND m.studio_id=c.studio_id AND m.role='owner' WHERE c.studio_id=? AND c.provider=? LIMIT 1").get(studioId,provider)?.user_id||null;}

// Check every selected date against the calendar. Shared by Sync now and the background run.
async function syncMappings(db,{studioId,user,provider,accessToken,transport,key,resolution}){
 const args=[studioId,user.id],rows=()=>db.prepare('SELECT provider,item_key,data FROM calendar_mappings WHERE studio_id=? AND user_id=? AND provider=?').all(...args,provider).map(r=>({provider:r.provider,key:r.item_key,...JSON.parse(r.data)}));
 const adapter=calendarAdapter(provider,transport),save=(itemKey,value)=>db.prepare('INSERT INTO calendar_mappings VALUES(?,?,?,?,?) ON CONFLICT(studio_id,user_id,provider,item_key) DO UPDATE SET data=excluded.data').run(...args,provider,itemKey,JSON.stringify(value));
 for(const mapping of rows()){
  const local=items(db,studioId).find(i=>i.key===mapping.key);if(!local){save(mapping.key,{...mapping,status:'Local item no longer active'});continue;}
  const remote=await adapter.get(accessToken,mapping.remoteId);if(!remote||remote.status==='cancelled'||remote.isCancelled){save(mapping.key,{...mapping,status:'Calendar event removed'});continue;}
  const remoteDate=adapter.date(remote);if(!validDate(remoteDate)){save(mapping.key,{...mapping,status:'Use an all-day date in the calendar'});continue;}
  const latest=items(db,studioId).find(i=>i.key===mapping.key);if(!latest||latest.date!==local.date){save(mapping.key,{...mapping,status:'Changed during sync; try again'});continue;}
  const localChanged=local.date!==mapping.date,remoteChanged=remoteDate!==mapping.date,choice=key===mapping.key?resolution:null;
  if(localChanged&&remoteChanged&&local.date!==remoteDate&&!['local','remote'].includes(choice)){save(mapping.key,{...mapping,status:'Conflict',localDate:local.date,remoteDate});continue;}
  let date=local.date,etag=adapter.etag(remote);
  if((remoteChanged&&!localChanged)||choice==='remote'){
   const [pid,type,tid]=mapping.key.split(':'),p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(pid,studioId).data),target=type==='task'?p.tasks.find(t=>t.id===tid):p.operations.milestones.find(t=>t.id===tid);target[type==='task'?'due':'dueDate']=remoteDate;if(type==='milestone')p.operations.revision=(p.operations.revision||0)+1;event(p,user,'Updated a selected date from '+provider+' calendar');saveProject(db,p);date=remoteDate;
  }else if(local.date!==remoteDate){const updated=await adapter.update(accessToken,mapping.remoteId,local,etag);if(!updated)fail(409,'The calendar event disappeared during sync.');etag=adapter.etag(updated);}
  save(mapping.key,{remoteId:mapping.remoteId,date,etag,status:'Synced',syncedAt:now()});
 }
 return rows();
}

/** Background sync for every connection with selected dates. Errors are recorded per connection and never stop the others. */
export async function syncAllCalendars(db,{env=process.env,transport=fetch}={}){
 installCalendarSync(db);let synced=0;
 for(const c of db.prepare('SELECT DISTINCT studio_id,user_id,provider FROM calendar_mappings').all()){
  const lock=[c.studio_id,c.user_id,c.provider].join(':');if(locks.has(lock)||!calendarConfigured(c.provider,env))continue;
  const user=db.prepare('SELECT id,name,email FROM users WHERE id=?').get(c.user_id);if(!user)continue;
  locks.add(lock);
  try{const accessToken=await calendarAccess(db,{studioId:c.studio_id,userId:c.user_id,provider:c.provider,env,transport});if(accessToken){await syncMappings(db,{studioId:c.studio_id,user,provider:c.provider,accessToken,transport});synced++;}}
  catch(error){if(!error?.status)console.error('Calendar sync failed:',error?.stack||error);}
  finally{locks.delete(lock);}
 }
 return synced;
}

export async function handleCalendarSync({db,req,url,route,body,user,studio,owner,reply,origin,calendarEnv=process.env,calendarTransport=fetch}){
 if(route!=='/api/calendar-sync')return false;if(!owner)fail(403,'Only the studio owner can manage calendar sync.');installCalendarSync(db);
 const configured=p=>calendarConfigured(p,calendarEnv);
 const args=[studio.id,user.id],rows=()=>db.prepare('SELECT provider,item_key,data FROM calendar_mappings WHERE studio_id=? AND user_id=?').all(...args).map(r=>({provider:r.provider,key:r.item_key,...JSON.parse(r.data)}));
 if(req.method==='GET'){reply(200,{providers:Object.keys(providers).map(p=>({id:p,configured:configured(p),connected:!!db.prepare('SELECT 1 FROM calendar_connections WHERE studio_id=? AND user_id=? AND provider=?').get(...args,p)})),items:items(db,studio.id),mappings:rows()});return true;}
 if(req.method!=='POST')fail(405,'Method not allowed.');const provider=body.provider;if(!providers[provider])fail(400,'Choose Google or Outlook.');if(!configured(provider))fail(503,'This calendar provider has not been configured.');const appURL=new URL(origin);if(appURL.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(appURL.hostname))fail(503,'Calendar OAuth requires a secure application origin.');const cipher=calendarCipher(calendarEnv.CALENDAR_ENCRYPTION_KEY),cfg=calendarConfigs(calendarEnv)[provider],spec=providers[provider],redirect=origin+'/?view=settings&calendar_callback='+provider;
 if(body.action==='connect'){
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');db.prepare('DELETE FROM calendar_oauth WHERE expires<?').run(Date.now());db.prepare('INSERT INTO calendar_oauth VALUES(?,?,?,?,?,?)').run(hash(state),...args,provider,cipher.seal({verifier}),Date.now()+600000);
  const auth=new URL(spec.auth);auth.search=new URLSearchParams({client_id:cfg.id,redirect_uri:redirect,response_type:'code',scope:spec.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(provider==='google'?{access_type:'offline',prompt:'consent'}:{response_mode:'query'})});reply(200,{url:auth.href});return true;
 }
 if(body.action==='complete'){
  if(typeof body.state!=='string'||typeof body.code!=='string'||body.code.length>4000)fail(400,'Invalid calendar callback.');const state=db.prepare('SELECT * FROM calendar_oauth WHERE state=? AND studio_id=? AND user_id=? AND provider=? AND expires>?').get(hash(body.state),...args,provider,Date.now());if(!state)fail(400,'Calendar authorization expired or was already used.');db.prepare('DELETE FROM calendar_oauth WHERE state=?').run(hash(body.state));const {verifier}=cipher.open(state.secret);putToken(db,cipher,args,provider,await tokenRequest(provider,calendarEnv,{grant_type:'authorization_code',code:body.code,redirect_uri:redirect,code_verifier:verifier},calendarTransport));db.prepare('DELETE FROM calendar_mappings WHERE studio_id=? AND user_id=? AND provider=?').run(...args,provider);reply(200,{connected:true});return true;
 }
 const row=db.prepare('SELECT secret FROM calendar_connections WHERE studio_id=? AND user_id=? AND provider=?').get(...args,provider);if(!row)fail(409,'Connect your calendar first.');let token=cipher.open(row.secret);
 if(['disconnect','unmap'].includes(body.action)&&locks.has(args.join(':')+':'+provider))fail(409,'Wait for the current calendar sync to finish.');
 if(body.action==='disconnect'){
  // Always remove local access even when provider revocation is unavailable.
  db.prepare('DELETE FROM calendar_mappings WHERE studio_id=? AND user_id=? AND provider=?').run(...args,provider);
  db.prepare('DELETE FROM calendar_connections WHERE studio_id=? AND user_id=? AND provider=?').run(...args,provider);db.prepare('DELETE FROM calendar_oauth WHERE studio_id=? AND user_id=? AND provider=?').run(...args,provider);
  let revoked=false;if(provider==='google'){try{const r=await calendarTransport('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refresh_token||token.access_token}),signal:AbortSignal.timeout(15000)});revoked=r.ok;}catch{}}
  reply(200,{disconnected:true,revoked,note:provider==='outlook'?'Local access removed. You can also remove Caleane consent in your Microsoft account permissions.':revoked?'Google access revoked.':'Local access removed. Remove Caleane access in your Google account if needed.'});return true;
 }
 if(body.action==='unmap'){if(typeof body.key!=='string')fail(400,'Choose an event.');db.prepare('DELETE FROM calendar_mappings WHERE studio_id=? AND user_id=? AND provider=? AND item_key=?').run(...args,provider,body.key);reply(200,{ok:true,note:'Sync stopped. The calendar event has been kept.'});return true;}
 if(!['map','sync'].includes(body.action))fail(400,'Choose a calendar action.');
 const lock=args.join(':')+':'+provider;if(locks.has(lock))fail(409,'Calendar sync is already running.');locks.add(lock);
 try{
  token=await freshToken(db,{args,provider,env:calendarEnv,transport:calendarTransport,token});
  if(body.action==='map'){
   const adapter=calendarAdapter(provider,calendarTransport),item=items(db,studio.id).find(i=>i.key===body.key);if(!item)fail(404,'Choose an active task or milestone with a date.');if(rows().some(r=>r.provider===provider&&r.key===item.key))fail(409,'This date is already connected.');const remote=await adapter.create(token.access_token,item);if(!remote?.id)fail(502,'The provider did not create this event.');db.prepare('INSERT INTO calendar_mappings VALUES(?,?,?,?,?) ON CONFLICT(studio_id,user_id,provider,item_key) DO UPDATE SET data=excluded.data').run(...args,provider,item.key,JSON.stringify({remoteId:remote.id,date:item.date,etag:adapter.etag(remote),status:'Synced',syncedAt:now()}));reply(200,{ok:true});return true;
  }
  await syncMappings(db,{studioId:studio.id,user,provider,accessToken:token.access_token,transport:calendarTransport,key:body.key,resolution:body.resolution});
  reply(200,{ok:true,mappings:rows()});return true;
 }finally{locks.delete(lock);}
}
