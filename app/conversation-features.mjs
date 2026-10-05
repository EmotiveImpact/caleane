import {randomUUID} from 'node:crypto';
import {conversationAccess} from './relationships.mjs';
import {assertQuota} from './uploads.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installConversationFeatures(db){db.exec(`
 CREATE TABLE IF NOT EXISTS conversation_message_details(message_id TEXT PRIMARY KEY REFERENCES conversation_messages(id),parent_id TEXT REFERENCES conversation_messages(id),attachment_ids TEXT NOT NULL DEFAULT '[]',mention_ids TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS conversation_files(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),uploaded_by TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS conversation_files_scope ON conversation_files(conversation_id);
 CREATE TABLE IF NOT EXISTS conversation_pins(conversation_id TEXT NOT NULL REFERENCES conversations(id),message_id TEXT NOT NULL REFERENCES conversation_messages(id),user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,message_id));
 CREATE TABLE IF NOT EXISTS conversation_asks(conversation_id TEXT NOT NULL REFERENCES conversations(id),message_id TEXT NOT NULL REFERENCES conversation_messages(id),task_kind TEXT NOT NULL CHECK(task_kind IN ('project','crm')),task_id TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,message_id));
 CREATE TABLE IF NOT EXISTS conversation_scheduled(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('owner','client')),text TEXT NOT NULL,details TEXT NOT NULL DEFAULT '{}',send_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','sending','sent','cancelled','failed')),message_id TEXT,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS conversation_scheduled_due ON conversation_scheduled(state,send_at);
 CREATE INDEX IF NOT EXISTS conversation_scheduled_mine ON conversation_scheduled(conversation_id,user_id,state);
`);}
/** The current person's own scheduled messages. Nobody else sees them until they are posted. */
export function scheduledDTO(db,c,user){
 return db.prepare("SELECT * FROM conversation_scheduled WHERE conversation_id=? AND user_id=? AND state IN ('scheduled','failed') ORDER BY send_at").all(c.id,user.id)
  .map(row=>{const details=JSON.parse(row.details);return {id:row.id,text:row.text,sendAt:row.send_at,state:row.state,error:row.last_error||'',parentId:details.parentId||null,attachmentIds:details.attachmentIds||[],mentionIds:details.mentionIds||[]};});
}
const studioSide=role=>role!=='client';
export function isStudioOwner(db,studioId,userId){return !!db.prepare("SELECT 1 FROM memberships WHERE studio_id=? AND user_id=? AND role='owner'").get(studioId,userId);}
// Triage fields are derived from the message history so existing conversations need no migration.
export function conversationExtras(db,c,user,rows,messages,seen,participants){
 const last=rows.at(-1),lastSide=last?(studioSide(last.role)?'studio':'client'):null,open=c.status!=='Resolved';
 const mine=m=>m.user_id?m.user_id===user.id:m.author_name===user.name,myLast=rows.reduce((at,m)=>mine(m)?m.seq:at,0);
 const reads=db.prepare('SELECT user_id,message_seq FROM conversation_reads WHERE conversation_id=?').all(c.id);
 const seenBy=participants.filter(p=>p.id!==user.id).map(p=>{const seq=reads.find(r=>r.user_id===p.id)?.message_seq||0;const at=rows.filter(m=>m.seq<=seq).at(-1);return at?{userId:p.id,name:p.name,messageId:at.id}:null;}).filter(Boolean);
 const pins=db.prepare('SELECT p.message_id,p.created_at,u.name FROM conversation_pins p JOIN users u ON u.id=p.user_id WHERE p.conversation_id=? ORDER BY p.created_at').all(c.id).map(p=>({messageId:p.message_id,by:p.name,at:p.created_at}));
 const asks=isStudioOwner(db,c.studio_id,user.id)?conversationAsks(db,c):[];
 return {lastSide,needsReply:open&&lastSide==='client',waitingSince:open&&lastSide==='studio'?last.created_at:null,
  firstUnreadId:rows.find(m=>m.seq>seen&&!mine(m))?.id||null,
  mentionsMe:messages.filter((m,i)=>rows[i].seq>myLast&&m.mentionIds.includes(user.id)).length,
  seenBy,pins,asks,scheduled:scheduledDTO(db,c,user)};
}
// Open asks are real tasks: project tasks for project conversations, CRM tasks for direct ones.
export function conversationAsks(db,c){
 const project=c.project_id?JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,c.studio_id)?.data||'{}'):null;
 return db.prepare('SELECT * FROM conversation_asks WHERE conversation_id=? ORDER BY created_at').all(c.id).map(a=>{
  const task=a.task_kind==='project'?(project?.tasks||[]).find(t=>t.id===a.task_id):db.prepare('SELECT title,completed,due_date AS due FROM crm_tasks WHERE id=? AND studio_id=?').get(a.task_id,c.studio_id);
  return task?{messageId:a.message_id,taskId:a.task_id,kind:a.task_kind,title:task.title,due:task.due||'',completed:!!task.completed,at:a.created_at}:null;
 }).filter(Boolean);
}
export function messageDetails(db,messageId){const row=db.prepare('SELECT * FROM conversation_message_details WHERE message_id=?').get(messageId);return {parentId:row?.parent_id||null,attachmentIds:JSON.parse(row?.attachment_ids||'[]'),mentionIds:JSON.parse(row?.mention_ids||'[]')};}
export function messageDetailsDTO(db,c,messageId){const data=messageDetails(db,messageId);return {...data,attachments:data.attachmentIds.map(fileId=>{const f=db.prepare('SELECT id,name,mime,length(content) AS size FROM conversation_files WHERE id=? AND conversation_id=?').get(fileId,c.id);return f?{fileId:f.id,name:f.name,mime:f.mime,size:f.size}:null;}).filter(Boolean)};}
export function validateMessageDetails(db,c,user,body,participants){
 const parentId=body.parentId||null,attachmentIds=body.attachmentIds??[],mentionIds=body.mentionIds??[];
 if(parentId&&(typeof parentId!=='string'||!db.prepare('SELECT id FROM conversation_messages WHERE id=? AND conversation_id=?').get(parentId,c.id)))fail(400,'Choose a message in this conversation.');
 if(parentId&&messageDetails(db,parentId).parentId)fail(400,'Reply to the original message in this thread.');
 for(const [ids,max,label] of [[attachmentIds,5,'attachments'],[mentionIds,30,'mentions']])if(!Array.isArray(ids)||ids.length>max||ids.some(v=>typeof v!=='string')||new Set(ids).size!==ids.length)fail(400,'Choose valid '+label+'.');
 for(const fileId of attachmentIds)if(!db.prepare('SELECT id FROM conversation_files WHERE id=? AND conversation_id=? AND uploaded_by=?').get(fileId,c.id,user.id))fail(400,'Choose files you uploaded to this conversation.');
 const allowed=new Set(participants.map(p=>p.id));if(mentionIds.some(v=>!allowed.has(v)))fail(400,'Only mention people with access to this conversation.');
 return {parentId,attachmentIds,mentionIds};
}
export function saveMessageDetails(db,id,data){db.prepare('INSERT INTO conversation_message_details VALUES(?,?,?,?)').run(id,data.parentId,JSON.stringify(data.attachmentIds),JSON.stringify(data.mentionIds));}
export async function handleConversationFileUpload({db,req,res,route,body,user,studio,owner,staffViewer,reply}){
 const match=route.match(/^\/api\/conversations\/([a-f0-9-]+)\/files(?:\/([a-f0-9-]+))?$/);if(!match)return false;
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(match[1],studio.id),access=c&&(owner?'Owner':conversationAccess(db,c,user.id));if(!access)fail(404,'Conversation not found.');
 if(req.method==='GET'&&match[2]){const file=db.prepare('SELECT * FROM conversation_files WHERE id=? AND conversation_id=?').get(match[2],c.id);if(!file)fail(404,'File not found.');const shared=db.prepare("SELECT 1 FROM conversation_message_details d JOIN conversation_messages m ON m.id=d.message_id JOIN json_each(d.attachment_ids) a WHERE m.conversation_id=? AND a.value=?").get(c.id,file.id);if(file.uploaded_by!==user.id&&!shared)fail(404,'File not found.');res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(Buffer.from(file.content));return true;}
 if(req.method!=='POST'||match[2])fail(405,'Method not allowed.');if(access==='Viewer')fail(403,'This participant has view-only access.');
 const name=typeof body.name==='string'?body.name.trim().slice(0,180):'',content=typeof body.content==='string'?body.content:'';if(!name||content.length>8400000)fail(400,'Choose a file smaller than 6 MB.');const data=Buffer.from(content,'base64');if(data.length<12||data.length>6000000)fail(400,'Choose a file smaller than 6 MB.');let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');
 assertQuota(db,studio.id,data.length);const fileId=randomUUID();db.prepare('INSERT INTO conversation_files VALUES(?,?,?,?,?,?,?)').run(fileId,c.id,user.id,name,mime,data,new Date().toISOString());reply(201,{file:{fileId,name,mime,size:data.length}});return true;
}
