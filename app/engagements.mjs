import sanitizeHtml from 'sanitize-html';
import {id,now,hash,transaction} from './store.mjs';
import {projectAccess} from './relationships.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max)fail(400,'Check the length and format of the details.');const v=value.trim();if(required&&!v)fail(400,'Complete the required details.');return v;};
const day=value=>{const v=text(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Choose a valid date.');return v;};
export const sameName=(typed,name)=>{const fold=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase().toLowerCase();return fold(typed)===fold(name);};
export function agreementDocument(body){
 if(body.termsHtml===undefined)return {terms:text(body.terms,24000,true)};
 const raw=text(body.termsHtml,48000,true);
 const termsHtml=sanitizeHtml(raw,{allowedTags:['p','br','strong','b','em','i','u','s','h1','h2','h3','h4','blockquote','ul','ol','li','table','thead','tbody','tr','th','td','span','div','hr'],allowedAttributes:{'*':['style'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedStyles:{'*':{'text-align':[/^(left|right|center|justify)$/],'font-weight':[/^(bold|normal|[1-9]00)$/],'font-style':[/^(italic|normal)$/],'text-decoration':[/^(underline|line-through)$/]}}});
 const terms=sanitizeHtml(termsHtml.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|h[1-4]|li|tr|blockquote)>/gi,'\n'),{allowedTags:[],allowedAttributes:{}}).trim();
 if(!terms.replace(/&nbsp;/g,' ').trim())fail(400,'Write the agreement terms before saving.');
 return {terms:text(terms,24000,true),termsHtml,documentFormat:'pagedly-html-v1'};
}
export function installEngagements(db){db.exec(`CREATE TABLE IF NOT EXISTS project_agreements(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),version INTEGER NOT NULL,data TEXT NOT NULL,UNIQUE(project_id,version)); CREATE TABLE IF NOT EXISTS resource_bookings(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS agreements_studio_project ON project_agreements(studio_id,project_id); CREATE INDEX IF NOT EXISTS bookings_studio_project ON resource_bookings(studio_id,project_id);`);}
function access(db,studioId,projectId,userId){const row=db.prepare('SELECT data FROM projects WHERE studio_id=? AND id=?').get(studioId,projectId);const member=db.prepare('SELECT u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.studio_id=? AND m.user_id=?').get(studioId,userId);if(!row||!member)fail(404,'Project not found.');const role=member.role==='owner'?'Owner':projectAccess(db,studioId,projectId,userId);if(!role)fail(404,'Project not found.');return {project:JSON.parse(row.data),role,actor:{id:userId,name:member.name}};}
const agreements=(db,s,p)=>db.prepare('SELECT data FROM project_agreements WHERE studio_id=? AND project_id=? ORDER BY version DESC').all(s,p).map(row=>JSON.parse(row.data));
const bookings=(db,s,p)=>db.prepare('SELECT data FROM resource_bookings WHERE studio_id=? AND project_id=?').all(s,p).map(row=>JSON.parse(row.data));
function agreementView(list,role){return list.filter(a=>role==='Owner'||role==='Approver'&&a.status!=='Draft');}
function bookingView(list,role){return list.filter(b=>role==='Owner'||b.shared).map(b=>role==='Owner'?b:{id:b.id,title:b.title,kind:b.kind,startDate:b.startDate,endDate:b.endDate,status:b.status,location:b.location});}
export function getEngagements(db,{studioId,projectId,userId}){const {role}=access(db,studioId,projectId,userId);return {agreements:agreementView(agreements(db,studioId,projectId),role),bookings:bookingView(bookings(db,studioId,projectId),role)};}
export function changeEngagements(db,{studioId,projectId,userId,action,body}){return transaction(db,()=>{
 const {project,role,actor}=access(db,studioId,projectId,userId),stamp=now();
 if(action==='respond-agreement'){
  if(role!=='Approver')fail(403,'Only a project approver can respond to an agreement.');
  const list=agreements(db,studioId,projectId),a=list.find(item=>item.id===body.id);
  if(!a||a.status!=='Issued'||a.revision!==body.revision||a.digest!==body.digest||a.briefRevision!==project.briefRevision)fail(409,'This agreement changed or is no longer current. Refresh before responding.');
  if(a.expiresOn<stamp.slice(0,10))fail(409,'This agreement expired. Ask the studio for a new version.');
  if(!['accept','decline'].includes(body.decision))fail(400,'Choose a response.');
  if(body.decision==='accept'&&(body.consent!==true||!sameName(text(body.signerName||'',120,true),actor.name)))fail(400,'Type your name as it appears on your account, and tick the box to confirm you accept these terms.');
  a.status=body.decision==='accept'?'Accepted':'Declined';a.response={decision:body.decision,name:actor.name,userId:actor.id,at:stamp,digest:a.digest,note:text(body.note||'',2000),consent:body.decision==='accept'};a.revision++;
  db.prepare('UPDATE project_agreements SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(a),a.id,studioId);
 }else{
  if(role!=='Owner')fail(403,'Only the studio owner can change this record.');
  if(action==='create-agreement'){
   const list=agreements(db,studioId,projectId),a={id:id(),version:(list[0]?.version||0)+1,title:text(body.title,160,true),...agreementDocument(body),briefRevision:project.briefRevision,status:'Draft',revision:1,createdAt:stamp,createdBy:actor.name,expiresOn:day(body.expiresOn)};
   if(a.expiresOn<stamp.slice(0,10))fail(400,'Choose a future expiry date.');
   db.prepare('INSERT INTO project_agreements VALUES(?,?,?,?,?)').run(a.id,studioId,projectId,a.version,JSON.stringify(a));
  }else if(action==='update-agreement'){
   const a=agreements(db,studioId,projectId).find(item=>item.id===body.id);
   if(!a||a.status!=='Draft'||a.revision!==body.revision)fail(409,'Only the current draft can be edited. Refresh before saving.');
   const expiresOn=day(body.expiresOn);if(expiresOn<stamp.slice(0,10))fail(400,'Choose a future expiry date.');
   if(body.termsHtml===undefined){delete a.termsHtml;delete a.documentFormat;}
   Object.assign(a,agreementDocument(body),{title:text(body.title,160,true),expiresOn,briefRevision:project.briefRevision,revision:a.revision+1,updatedAt:stamp,updatedBy:actor.name});
   db.prepare('UPDATE project_agreements SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(a),a.id,studioId);
  }else if(action==='issue-agreement'||action==='withdraw-agreement'){
   const list=agreements(db,studioId,projectId),a=list.find(item=>item.id===body.id);
   if(!a||a.revision!==body.revision)fail(409,'The agreement changed. Refresh before continuing.');
   if(action==='issue-agreement'){
    if(a.status!=='Draft'||a.briefRevision!==project.briefRevision||a.expiresOn<stamp.slice(0,10))fail(409,'Create a fresh draft against the current brief before issuing.');
    for(const previous of list.filter(item=>item.status==='Issued')){previous.status='Superseded';previous.revision++;db.prepare('UPDATE project_agreements SET data=? WHERE id=?').run(JSON.stringify(previous),previous.id);}
    a.status='Issued';a.issuedAt=stamp;a.issuedBy=actor.name;a.digest=hash(JSON.stringify({title:a.title,terms:a.terms,...(a.termsHtml?{termsHtml:a.termsHtml,documentFormat:a.documentFormat}:{}),version:a.version,briefRevision:a.briefRevision,expiresOn:a.expiresOn}));
   }else{if(!['Draft','Issued'].includes(a.status))fail(409,'This agreement is already part of the decision history.');a.status='Withdrawn';a.withdrawal={reason:text(body.reason,1000,true),at:stamp,by:actor.name};}
   a.revision++;db.prepare('UPDATE project_agreements SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(a),a.id,studioId);
  }else if(action==='save-booking'){
   const existing=body.id?bookings(db,studioId,projectId).find(item=>item.id===body.id):null;
   if(body.id&&(!existing||existing.revision!==body.revision))fail(409,'This booking changed. Refresh before saving.');
   const kind=text(body.kind,30,true),status=text(body.status,30,true),startDate=day(body.startDate),endDate=day(body.endDate||body.startDate),resource=text(body.resource,200,true);
   if(!['Venue','Supplier','Equipment','Studio time'].includes(kind)||!['Tentative','Confirmed','Cancelled'].includes(status)||endDate<startDate||typeof body.shared!=='boolean')fail(400,'Check the booking dates, type and status.');
   const confirmation=text(body.confirmation||'',2000);if(status==='Confirmed'&&!confirmation)fail(400,'Record the supplier or venue confirmation reference.');
   const clashes=db.prepare('SELECT data FROM resource_bookings WHERE studio_id=?').all(studioId).map(row=>JSON.parse(row.data)).filter(b=>b.id!==existing?.id&&b.status!=='Cancelled'&&status!=='Cancelled'&&b.kind===kind&&b.resource.toLowerCase()===resource.toLowerCase()&&b.startDate<=endDate&&startDate<=b.endDate);
   if(clashes.length)fail(409,'This resource is already held for an overlapping date. Resolve the existing booking first.');
   const b={id:existing?.id||id(),title:text(body.title,160,true),kind,resource,startDate,endDate,status,shared:body.shared,location:text(body.location||'',300),confirmation,note:text(body.note||'',2000),revision:(existing?.revision||0)+1,updatedAt:stamp,updatedBy:actor.name,history:[...(existing?.history||[]),...(existing?[{at:stamp,by:actor.name,previous:{title:existing.title,resource:existing.resource,startDate:existing.startDate,endDate:existing.endDate,status:existing.status,confirmation:existing.confirmation}}]:[])]};
   if(existing)db.prepare('UPDATE resource_bookings SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(b),b.id,studioId);else db.prepare('INSERT INTO resource_bookings VALUES(?,?,?,?)').run(b.id,studioId,projectId,JSON.stringify(b));
  }else fail(404,'Action not found.');
 }
 return getEngagements(db,{studioId,projectId,userId});
});}
const escapeICS=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const nextDay=value=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
export function projectCalendar(db,{studioId,projectId,userId}){
 const {project,role}=access(db,studioId,projectId,userId),items=[];
 const add=(key,title,start,end,location='',status='CONFIRMED')=>{if(start)items.push(['BEGIN:VEVENT','UID:'+key+'@caleane.local','DTSTAMP:'+now().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+start.replaceAll('-',''),'DTEND;VALUE=DATE:'+nextDay(end||start).replaceAll('-',''),'SUMMARY:'+escapeICS(title),'LOCATION:'+escapeICS(location),'STATUS:'+status,'END:VEVENT'].join('\r\n'));};
 const hold=project.operations?.holds?.at(-1);if(hold&&['Held','Confirmed'].includes(hold.status)&&!(hold.status==='Held'&&hold.holdUntil<now().slice(0,10)))add(hold.id,project.title,hold.startDate,hold.endDate,hold.location,hold.status==='Held'?'TENTATIVE':'CONFIRMED');
 for(const m of project.operations?.milestones||[])if(!m.archivedAt&&(role==='Owner'||m.visibleToClient))add(m.id,m.title,m.dueDate,m.dueDate);
 for(const b of bookingView(bookings(db,studioId,projectId),role))add(b.id,b.title,b.startDate,b.endDate,b.location,b.status==='Cancelled'?'CANCELLED':b.status==='Tentative'?'TENTATIVE':'CONFIRMED');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Caleane//Project calendar//EN','CALSCALE:GREGORIAN',...items,'END:VCALENDAR',''].join('\r\n').split('\r\n').map(line=>{let part='',out=[];for(const char of line){if(Buffer.byteLength(part+char)>73){out.push(part);part=' '+char;}else part+=char;}out.push(part);return out.join('\r\n');}).join('\r\n');
}
