import {createHash} from 'node:crypto';
import {transaction,conversationUnreadCount} from './store.mjs';
import {projectAccess,conversationAccess} from './relationships.mjs';
import {attentionFor} from './src/lib/attention.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function installNotificationCentre(db){db.exec(`CREATE TABLE IF NOT EXISTS workspace_notifications(
 seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,
 studio_id TEXT NOT NULL REFERENCES studios(id),user_id TEXT NOT NULL REFERENCES users(id),
 source_key TEXT NOT NULL,audience TEXT NOT NULL CHECK(audience IN ('owner','project','approver','conversation')),
 project_id TEXT,conversation_id TEXT,payload TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(studio_id,user_id,source_key),
 FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id),
 FOREIGN KEY(conversation_id) REFERENCES conversations(id));
 CREATE INDEX IF NOT EXISTS workspace_notifications_recipient ON workspace_notifications(studio_id,user_id,read_at,created_at DESC,seq DESC);`);}
function context(db,{studioId,userId}){
 const user=db.prepare('SELECT id,name FROM users WHERE id=?').get(userId);
 const membership=db.prepare('SELECT role FROM memberships WHERE studio_id=? AND user_id=?').get(studioId,userId);
 const staff=!membership&&db.prepare('SELECT 1 FROM studio_staff WHERE studio_id=? AND user_id=?').get(studioId,userId);
 if(!user||(!membership&&!staff))fail(403,'You do not have access to this studio.');
 const owner=membership?.role==='owner',roles=new Map();
 const projects=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studioId).map(r=>JSON.parse(r.data)).filter(p=>{
  const role=owner?'Owner':projectAccess(db,studioId,p.id,userId)|| (staff&&db.prepare('SELECT 1 FROM studio_project_collaborators WHERE studio_id=? AND project_id=? AND user_id=?').get(studioId,p.id,userId)?'Contributor':null);
  if(role)roles.set(p.id,role);return !!role;
 });
 return {studioId,userId,user,owner,staff:!!staff,roles,projects};
}
function allowed(db,ctx,row){
 if(row.audience==='owner')return ctx.owner;
 if(row.audience==='approver')return ctx.owner||ctx.roles.get(row.project_id)==='Approver';
 if(row.audience==='project')return ctx.roles.has(row.project_id);
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(row.conversation_id,ctx.studioId);
 return !!c&&(ctx.owner||!!conversationAccess(db,c,ctx.userId));
}
function activityDestination(db,ctx,p,event){
 const text=event.text.toLowerCase();
 if(text.includes('first brief')){const o=db.prepare('SELECT id,client_id FROM crm_opportunities WHERE studio_id=? AND project_id=?').get(ctx.studioId,p.id);if(o)return {type:'opportunity',opportunityId:o.id,clientId:o.client_id};}
 const tab=text.includes('design')?'Designs':text.includes('proposal')?'Proposal':text.includes('estimate')?'Estimate':text.includes('agreement')||text.includes('contract')?'Contract':text.includes('invoice')||text.includes('payment')?'Billing':text.includes('task')?'Plan':text.includes('reference')||text.includes('inspiration')?'Inspiration':'Brief';
 return {type:'project',projectId:p.id,tab};
}
function syncUpdates(db,ctx){
 const cutoff=new Date(Date.now()-90*86400000).toISOString(),candidates=[];
 const add=(key,audience,projectId,conversationId,item)=>{if(!item.at||item.at<cutoff)return;candidates.push({key,audience,projectId,conversationId,item});};
 for(const p of ctx.projects){
  if(ctx.staff)continue;
  if(ctx.owner){for(const e of (p.activity||[]).slice(0,200)){
   if(!e.id||e.text==='Added a message'||(e.actorId?e.actorId===ctx.userId:e.actor===ctx.user.name))continue;
   add('activity:'+p.id+':'+e.id,'owner',p.id,null,{kind:'project',label:e.text,context:p.title,actor:e.actor,at:e.at,destination:activityDestination(db,ctx,p,e)});
  }}else{
   for(const d of p.designs||[])add('design:'+p.id+':'+d.id,'project',p.id,null,{kind:'design',label:'A design was shared with you',context:p.title,detail:d.title,at:d.at,destination:{type:'project',projectId:p.id,tab:'Designs',designId:d.id}});
   if(ctx.roles.get(p.id)==='Approver'){
    for(const [collection,tab,kind] of [[p.estimates||[],'Estimate','estimate'],[p.proposals||[],'Proposal','proposal']])for(const item of collection){if(item.status!=='Draft')add(kind+':'+p.id+':'+item.id,'approver',p.id,null,{kind:'document',label:kind==='estimate'?'An estimate was shared with you':'A proposal was shared with you',context:p.title,detail:item.title,at:item.issuedAt||item.sharedAt||item.at||item.createdAt,destination:{type:'project',projectId:p.id,tab}});}
    for(const row of db.prepare('SELECT id,data FROM project_agreements WHERE studio_id=? AND project_id=?').all(ctx.studioId,p.id)){const a=JSON.parse(row.data);if(a.issuedAt)add('contract:'+a.id,'approver',p.id,null,{kind:'document',label:'A contract was issued',context:p.title,detail:a.title,at:a.issuedAt,destination:{type:'project',projectId:p.id,tab:'Contract'}});}
    for(const i of db.prepare('SELECT id,number,issued_at FROM invoices WHERE studio_id=? AND project_id=?').all(ctx.studioId,p.id))add('invoice:'+i.id,'approver',p.id,null,{kind:'document',label:'An invoice was issued',context:p.title,detail:i.number,at:i.issued_at,destination:{type:'project',projectId:p.id,tab:'Billing',invoiceId:i.id}});
   }
  }
 }
 const messages=db.prepare(`SELECT m.*,c.studio_id,c.project_id,c.client_id,c.subject FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.studio_id=? AND m.created_at>=? ORDER BY m.seq`).all(ctx.studioId,cutoff);
 for(const m of messages){
  if(m.user_id?m.user_id===ctx.userId:m.author_name===ctx.user.name)continue;
  const c={id:m.conversation_id,studio_id:m.studio_id,project_id:m.project_id,client_id:m.client_id};
  if(!ctx.owner&&!conversationAccess(db,c,ctx.userId))continue;
  add('message:'+m.id,'conversation',m.project_id,m.conversation_id,{kind:'message',label:'New message from '+m.author_name,context:m.project_id?ctx.projects.find(p=>p.id===m.project_id)?.title||m.subject:m.subject,actor:m.author_name,at:m.created_at,destination:m.project_id?{type:'project',projectId:m.project_id,tab:ctx.staff?'Messages':'Conversation'}:{type:'conversation',clientId:m.client_id,conversationId:m.conversation_id}});
 }
 const insert=db.prepare('INSERT OR IGNORE INTO workspace_notifications(id,studio_id,user_id,source_key,audience,project_id,conversation_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
 transaction(db,()=>{for(const c of candidates){const id=createHash('sha256').update(JSON.stringify([ctx.studioId,ctx.userId,c.key])).digest('hex');insert.run(id,ctx.studioId,ctx.userId,c.key,c.audience,c.projectId,c.conversationId,JSON.stringify(c.item),c.item.at);}});
}
function actions(db,ctx){
 const today=todayLocal(),result=[];
 for(const p of ctx.projects){
  const c=db.prepare('SELECT * FROM conversations WHERE studio_id=? AND project_id=?').get(ctx.studioId,p.id);
  if(ctx.staff){const unread=c?conversationUnreadCount(db,c,ctx.user):0;if(unread)result.push({id:'action:conversation:'+c.id,kind:'message',label:`${unread} unread ${unread===1?'message':'messages'}`,context:p.title,destination:{type:'project',projectId:p.id,tab:'Messages'}});continue;}
  const review=ctx.owner?db.prepare('SELECT r.reviewed_at,o.id FROM crm_opportunities o LEFT JOIN crm_enquiry_reviews r ON r.opportunity_id=o.id AND r.studio_id=o.studio_id WHERE o.studio_id=? AND o.project_id=?').get(ctx.studioId,p.id):null;
  const invoice=ctx.owner||ctx.roles.get(p.id)==='Approver'?db.prepare(`SELECT i.*,COALESCE((SELECT SUM(ip.amount_minor) FROM invoice_payments ip WHERE ip.studio_id=i.studio_id AND ip.invoice_id=i.id),0) AS paid FROM invoices i WHERE i.studio_id=? AND i.project_id=? AND i.cancelled_at IS NULL AND i.amount_minor>COALESCE((SELECT SUM(ip.amount_minor) FROM invoice_payments ip WHERE ip.studio_id=i.studio_id AND ip.invoice_id=i.id),0) ORDER BY i.issued_at DESC LIMIT 1`).get(ctx.studioId,p.id):null;
  const current={...p,accessRole:ctx.roles.get(p.id),enquiryReviewedAt:review?.reviewed_at,unreadMessages:c?conversationUnreadCount(db,c,ctx.user):0,latestInvoice:invoice&&invoice.paid<invoice.amount_minor?{id:invoice.id,status:invoice.paid?'Partially paid':'Issued',number:invoice.number,dueDate:invoice.due_date}:null};
  const role=ctx.roles.get(p.id);
  for(const item of attentionFor(current,ctx.owner)){
   if(!ctx.owner&&role!=='Approver'&&!['message','approval'].includes(item.kind))continue;
   if(item.kind.startsWith('task-')){const task=p.tasks.find(t=>'task-'+t.id===item.kind);if(!task?.due||task.due>today)continue;}
   const label=!ctx.owner&&role!=='Approver'&&item.kind==='approval'?'View the shared design':item.label;
   let destination={type:'project',projectId:p.id,tab:item.tab};
   if(item.kind.startsWith('task-')&&ctx.owner)destination={type:'task',taskId:'project:'+p.id+':'+item.kind.slice(5)};
   if(item.kind==='enquiry'&&review?.id)destination={type:'opportunity',opportunityId:review.id};
   if(['approval','feedback','comment','stale'].includes(item.kind))destination.designId=p.designs.at(-1)?.id;
   if(item.kind==='invoice')destination.invoiceId=invoice?.id;
   result.push({id:'action:'+item.id,kind:item.kind,label,detail:item.detail,context:p.title,destination});
  }
  if(role==='Approver')for(const row of db.prepare('SELECT data FROM project_agreements WHERE studio_id=? AND project_id=? ORDER BY version DESC LIMIT 1').all(ctx.studioId,p.id)){const a=JSON.parse(row.data);if(a.status==='Issued'&&a.briefRevision===p.briefRevision)result.push({id:'action:contract:'+a.id,kind:'document',label:'Review your contract',context:p.title,detail:a.title,destination:{type:'project',projectId:p.id,tab:'Contract'}});}
 }
 if(ctx.owner){
  for(const t of db.prepare('SELECT t.*,c.name AS client_name FROM crm_tasks t JOIN clients c ON c.id=t.client_id AND c.studio_id=t.studio_id WHERE t.studio_id=? AND t.completed=0 AND t.due_date<>? AND t.due_date<=? ORDER BY t.due_date,t.id').all(ctx.studioId,'',today))result.unshift({id:'action:crm:'+t.id,kind:'task',label:t.title,detail:t.due_date<today?'Overdue · '+t.due_date:'Due today',context:t.client_name,destination:{type:'task',taskId:'crm:'+t.id}});
 }
 for(const c of db.prepare('SELECT * FROM conversations WHERE studio_id=? AND project_id IS NULL ORDER BY updated_at DESC').all(ctx.studioId)){
  if(!ctx.owner&&!conversationAccess(db,c,ctx.userId))continue;
  const unread=conversationUnreadCount(db,c,ctx.user);if(unread)result.unshift({id:'action:conversation:'+c.id,kind:'message',label:`${unread} unread ${unread===1?'message':'messages'}`,context:c.subject,destination:{type:'conversation',clientId:c.client_id,conversationId:c.id}});
 }
 return result;
}
function visibleRows(db,ctx){return db.prepare('SELECT * FROM workspace_notifications WHERE studio_id=? AND user_id=? ORDER BY created_at DESC,seq DESC').all(ctx.studioId,ctx.userId).filter(r=>allowed(db,ctx,r));}
export function notificationCentre(db,args,{filter='unread',offset=0}={}){
 if(!['unread','all'].includes(filter)||!Number.isInteger(offset)||offset<0)fail(400,'Choose a valid notification view.');
 const ctx=context(db,args);syncUpdates(db,ctx);const all=visibleRows(db,ctx),unreadCount=all.filter(r=>!r.read_at).length,rows=filter==='unread'?all.filter(r=>!r.read_at):all;
 const limit=25,start=Math.min(offset,Math.max(0,Math.floor((rows.length-1)/limit)*limit));
 return {actions:actions(db,ctx),updates:rows.slice(start,start+limit).map(r=>({id:r.id,...JSON.parse(r.payload),readAt:r.read_at})),unreadCount,total:rows.length,offset:start,limit,watermark:all.reduce((n,r)=>Math.max(n,r.seq),0)};
}
export function readNotifications(db,args,body){
 const ctx=context(db,args);if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Choose a valid notification action.');const rows=visibleRows(db,ctx),stamp=new Date().toISOString();let chosen;
 if(body.action==='read-all'){
  if(!Number.isSafeInteger(body.through)||body.through<0)fail(400,'Refresh the notification list before marking it read.');
  chosen=rows.filter(r=>!r.read_at&&r.seq<=body.through);
 }else if(body.action==='read'){
  if(typeof body.read!=='boolean'||typeof body.id!=='string')fail(400,'Choose a notification and read state.');
  const row=rows.find(r=>r.id===body.id);if(!row)fail(404,'Notification not found.');chosen=[row];
 }else fail(400,'Choose a valid notification action.');
 transaction(db,()=>{const update=db.prepare('UPDATE workspace_notifications SET read_at=? WHERE id=? AND studio_id=? AND user_id=?');for(const row of chosen)update.run(body.action==='read'&&!body.read?null:row.read_at||stamp,row.id,ctx.studioId,ctx.userId);});
 return {changed:chosen.length};
}
