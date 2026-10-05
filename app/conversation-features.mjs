import {randomUUID} from 'node:crypto';
import {conversationAccess} from './relationships.mjs';
import {assertQuota} from './uploads.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installConversationFeatures(db){db.exec(`
 CREATE TABLE IF NOT EXISTS conversation_message_details(message_id TEXT PRIMARY KEY REFERENCES conversation_messages(id),parent_id TEXT REFERENCES conversation_messages(id),attachment_ids TEXT NOT NULL DEFAULT '[]',mention_ids TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS conversation_files(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),uploaded_by TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS conversation_files_scope ON conversation_files(conversation_id);
`);}
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
