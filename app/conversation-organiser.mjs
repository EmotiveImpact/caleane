import {id,now,event,saveProject,transaction,conversationDTO} from './store.mjs';
import {createTask,updateTask} from './crm.mjs';
import {conversationAccess} from './relationships.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const snippet=text=>{const line=String(text||'').replace(/^Replying to [^\n]+:\n(?:>[^\n]*\n?)+/,'').replace(/\s+/g,' ').trim();return line.length>120?line.slice(0,119).trimEnd()+'…':line;};

// Pins, open asks and mark-as-unread for one conversation. Each action returns the refreshed conversation.
export async function handleConversationOrganiser({db,route,req,body,user,studio,owner,reply}){
 const match=route.match(/^\/api\/conversations\/([a-f0-9-]+)\/(pins|asks|unseen)$/);if(!match)return false;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(match[1],studio.id),access=c&&(owner?'Owner':conversationAccess(db,c,user.id));if(!access)fail(404,'Conversation not found.');
 const message=typeof body.messageId==='string'&&db.prepare('SELECT * FROM conversation_messages WHERE id=? AND conversation_id=?').get(body.messageId,c.id);if(!message)fail(400,'Choose a message in this conversation.');
 const action=match[2];
 if(action==='unseen'){
  // Rewind this person's read marker to just before the chosen message.
  const previous=db.prepare('SELECT seq,created_at FROM conversation_messages WHERE conversation_id=? AND seq<? ORDER BY seq DESC LIMIT 1').get(c.id,message.seq);
  transaction(db,()=>{
   db.prepare('INSERT INTO conversation_reads VALUES(?,?,?) ON CONFLICT(user_id,conversation_id) DO UPDATE SET message_seq=excluded.message_seq').run(user.id,c.id,previous?.seq||0);
   if(c.project_id)db.prepare('UPDATE project_reads SET seen=? WHERE user_id=? AND project_id=?').run(previous?.created_at||'',user.id,c.project_id);
  });
 }else if(action==='pins'){
  if(access==='Viewer')fail(403,'This participant has view-only access.');
  if(typeof body.pinned!=='boolean')fail(400,'Choose whether to pin this message.');
  if(body.pinned){if(db.prepare('SELECT COUNT(*) AS n FROM conversation_pins WHERE conversation_id=?').get(c.id).n>=10&&!db.prepare('SELECT 1 FROM conversation_pins WHERE conversation_id=? AND message_id=?').get(c.id,message.id))fail(400,'Pin up to ten messages. Unpin one first.');db.prepare('INSERT OR IGNORE INTO conversation_pins VALUES(?,?,?,?)').run(c.id,message.id,user.id,now());}
  else db.prepare('DELETE FROM conversation_pins WHERE conversation_id=? AND message_id=?').run(c.id,message.id);
 }else{
  if(!owner)fail(403,'Only the studio can track open asks.');
  const existing=db.prepare('SELECT * FROM conversation_asks WHERE conversation_id=? AND message_id=?').get(c.id,message.id);
  if(body.completed!==undefined){
   if(typeof body.completed!=='boolean')fail(400,'Choose a completion state.');if(!existing)fail(404,'This message is not an open ask.');
   transaction(db,()=>{
    if(existing.task_kind==='crm'){updateTask(db,studio.id,user,existing.task_id,{completed:body.completed});return;}
    const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,studio.id).data),task=(p.tasks||[]).find(t=>t.id===existing.task_id);if(!task)fail(404,'Task not found.');
    Object.assign(task,{completed:body.completed,status:body.completed?'Completed':'To do',completedBy:body.completed?user.name:'',completedAt:body.completed?now():''});event(p,user,`${body.completed?'Completed':'Reopened'} task: ${task.title}`);saveProject(db,p);
   });
  }else{
   if(existing)fail(409,'This message is already an open ask.');
   const title=typeof body.title==='string'&&body.title.trim()?body.title.trim().slice(0,200):snippet(message.text)||'Follow up on '+message.author_name+'’s files',detail=`From ${message.author_name}’s message: “${snippet(message.text)}”`.slice(0,2000);
   transaction(db,()=>{
    let kind='crm',taskId;
    if(c.project_id){const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,studio.id).data);p.tasks||=[];taskId=id();p.tasks.push({id:taskId,title,detail,due:'',assignee:'studio',status:'To do',completed:false,createdBy:user.name,at:now()});event(p,user,'Added a task from a message');saveProject(db,p);kind='project';}
    else taskId=createTask(db,studio.id,user,{clientId:c.client_id,title,detail}).id;
    db.prepare('INSERT INTO conversation_asks VALUES(?,?,?,?,?,?)').run(c.id,message.id,kind,taskId,user.id,now());
   });
  }
 }
 reply(200,{conversation:conversationDTO(db,db.prepare('SELECT * FROM conversations WHERE id=?').get(c.id),user)});return true;
}
