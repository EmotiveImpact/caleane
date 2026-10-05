import {id,now,transaction,appendConversationMessage,conversationDTO} from './store.mjs';
import {conversationAccess} from './relationships.mjs';
import {validateMessageDetails} from './conversation-features.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const MAX_WAITING=20,EARLIEST_MS=30_000,LATEST_MS=366*86400000;

// Scheduled messages: written now, posted later as the author. Only the author sees them until they go.
function writerRole(db,c,userId){
 const role=db.prepare('SELECT role FROM memberships WHERE user_id=? AND studio_id=?').get(userId,c.studio_id)?.role;
 if(role==='owner')return 'owner';
 const access=conversationAccess(db,c,userId);
 if(!access||access==='Viewer')return null;
 return role==='client'?'client':'owner';
}

function post(db,row,afterSend){
 const c=db.prepare('SELECT * FROM conversations WHERE id=?').get(row.conversation_id),user=c&&db.prepare('SELECT id,name,email FROM users WHERE id=?').get(row.user_id);
 const role=c&&user&&writerRole(db,c,user.id);
 if(!role){db.prepare("UPDATE conversation_scheduled SET state='failed',last_error=?,updated_at=? WHERE id=?").run('You no longer have access to this conversation.',now(),row.id);return null;}
 try{
  // The schedule id doubles as the message reference, so a retried send never posts twice.
  const messageId=transaction(db,()=>{
   const messageId=appendConversationMessage(db,c,user,role,row.text,'scheduled:'+row.id,JSON.parse(row.details));
   db.prepare("UPDATE conversation_scheduled SET state='sent',message_id=?,last_error=NULL,updated_at=? WHERE id=?").run(messageId,now(),row.id);
   return messageId;
  });
  afterSend?.(c.studio_id,c,user.id,messageId);
  return messageId;
 }catch(error){
  db.prepare("UPDATE conversation_scheduled SET state='failed',last_error=?,updated_at=? WHERE id=?").run(String(error.message||'The message could not be sent.').slice(0,200),now(),row.id);
  return null;
 }
}

/** Post every scheduled message that is due. Safe to call often: each one is claimed before it is posted. */
export function sendDueScheduled(db,{at=new Date().toISOString(),afterSend}={}){
 const sent=[];
 for(const row of db.prepare("SELECT * FROM conversation_scheduled WHERE state='scheduled' AND send_at<=? ORDER BY send_at LIMIT 50").all(at)){
  if(!db.prepare("UPDATE conversation_scheduled SET state='sending',updated_at=? WHERE id=? AND state='scheduled'").run(now(),row.id).changes)continue;
  const messageId=post(db,row,afterSend);if(messageId)sent.push(messageId);
 }
 return sent;
}

export function handleScheduledMessages({db,route,req,body,user,studio,owner,reply,afterSend}){
 const match=route.match(/^\/api\/conversations\/([a-f0-9-]+)\/scheduled(?:\/([a-f0-9-]+))?$/);if(!match)return false;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(match[1],studio.id),access=c&&(owner?'Owner':conversationAccess(db,c,user.id));if(!access)fail(404,'Conversation not found.');
 if(access==='Viewer')fail(403,'This participant has view-only access.');
 if(!match[2]){
  const text=typeof body.text==='string'?body.text.slice(0,5000):'',sendAt=Date.parse(body.sendAt),time=Date.now();
  if(typeof body.sendAt!=='string'||!Number.isFinite(sendAt))fail(400,'Choose when to send this message.');
  if(sendAt<time+EARLIEST_MS)fail(400,'Choose a time in the future.');
  if(sendAt>time+LATEST_MS)fail(400,'Choose a time within the next year.');
  if(db.prepare("SELECT COUNT(*) AS n FROM conversation_scheduled WHERE conversation_id=? AND user_id=? AND state IN ('scheduled','failed')").get(c.id,user.id).n>=MAX_WAITING)fail(400,`You can schedule up to ${MAX_WAITING} messages in one conversation.`);
  const details=validateMessageDetails(db,c,user,body,conversationDTO(db,c,user).participants);
  if(!text.trim()&&!details.attachmentIds.length)fail(400,'Write a message or attach a file first.');
  const at=now(),role=writerRole(db,c,user.id);if(!role)fail(403,'This participant has view-only access.');
  db.prepare('INSERT INTO conversation_scheduled(id,studio_id,conversation_id,user_id,role,text,details,send_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(id(),studio.id,c.id,user.id,role,text,JSON.stringify(details),new Date(sendAt).toISOString(),at,at);
 }else{
  const row=db.prepare("SELECT * FROM conversation_scheduled WHERE id=? AND conversation_id=? AND user_id=? AND state IN ('scheduled','failed')").get(match[2],c.id,user.id);
  if(!row)fail(404,'This scheduled message has already been sent or cancelled.');
  if(body.action==='cancel')db.prepare("UPDATE conversation_scheduled SET state='cancelled',updated_at=? WHERE id=?").run(now(),row.id);
  else if(body.action==='send'){
   if(!db.prepare("UPDATE conversation_scheduled SET state='sending',updated_at=? WHERE id=? AND state IN ('scheduled','failed')").run(now(),row.id).changes)fail(409,'This message is already on its way.');
   if(!post(db,row,afterSend))fail(400,db.prepare('SELECT last_error FROM conversation_scheduled WHERE id=?').get(row.id).last_error||'The message could not be sent.');
  }else fail(400,'Choose to send or cancel this message.');
 }
 reply(200,{conversation:conversationDTO(db,c,user)});return true;
}
