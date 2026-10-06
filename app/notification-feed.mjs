import {id,now,transaction} from './store.mjs';
import {projectAccess,conversationAccess} from './relationships.mjs';

// In-app notification history. Each row belongs to one recipient and records
// what happened when it happened; access is checked again whenever it is read,
// so removing someone from a project also removes its notifications from view.
const KINDS=['enquiry','message','project_update','task_assigned','follow_up'];
const PAGE_MAX=50,UNREAD_SCAN=500;

function fail(status,message){throw Object.assign(new Error(message),{status});}
function dayLabel(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';}
function clip(value,max){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?text.slice(0,max-1)+'…':text;}

export function installNotificationFeed(db){
 // Older databases allow fewer kinds in their CHECK. Rebuild the table once, keeping every row.
 const existing=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='notification_events'").get()?.sql||'';
 if(existing&&!KINDS.every(kind=>existing.includes(`'${kind}'`)))transaction(db,()=>{
  db.exec('DROP INDEX IF EXISTS notification_events_feed;DROP INDEX IF EXISTS notification_events_unread;ALTER TABLE notification_events RENAME TO notification_events_old;');
  createFeed(db);
  db.exec('INSERT INTO notification_events SELECT * FROM notification_events_old;DROP TABLE notification_events_old;');
 });
 createFeed(db);
}
function createFeed(db){
 db.exec(`CREATE TABLE IF NOT EXISTS notification_events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,studio_id TEXT NOT NULL REFERENCES studios(id),user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN (${KINDS.map(kind=>`'${kind}'`).join(',')})),source_key TEXT NOT NULL,
  title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',actor_name TEXT NOT NULL DEFAULT '',
  project_id TEXT,conversation_id TEXT,client_id TEXT,opportunity_id TEXT,task_id TEXT,
  created_at TEXT NOT NULL,read_at TEXT,
  UNIQUE(studio_id,user_id,source_key));
 CREATE INDEX IF NOT EXISTS notification_events_feed ON notification_events(studio_id,user_id,seq DESC);
 CREATE INDEX IF NOT EXISTS notification_events_unread ON notification_events(studio_id,user_id,read_at);`);
}

const owners=(db,studioId)=>db.prepare("SELECT user_id AS id FROM memberships WHERE studio_id=? AND role='owner'").all(studioId).map(row=>row.id);
const projectClients=(db,studioId,projectId)=>db.prepare(`SELECT DISTINCT ct.user_id AS id FROM crm_project_stakeholders ps
 JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id
 JOIN memberships m ON m.user_id=ct.user_id AND m.studio_id=ps.studio_id AND m.role='client'
 WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1`).all(studioId,projectId).map(row=>row.id);
const accountClients=(db,studioId,clientId)=>db.prepare(`SELECT DISTINCT ct.user_id AS id FROM crm_client_contacts cc
 JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id
 JOIN memberships m ON m.user_id=ct.user_id AND m.studio_id=cc.studio_id AND m.role='client'
 WHERE cc.studio_id=? AND cc.client_id=? AND cc.account_access=1`).all(studioId,clientId).map(row=>row.id);
const contributors=(db,studioId,projectId)=>db.prepare(`SELECT pc.user_id AS id FROM studio_project_collaborators pc
 JOIN studio_staff ss ON ss.user_id=pc.user_id AND ss.studio_id=pc.studio_id WHERE pc.studio_id=? AND pc.project_id=?`).all(studioId,projectId).map(row=>row.id);

function deliver(db,recipients,actorUserId,row){
 const insert=db.prepare(`INSERT INTO notification_events(id,studio_id,user_id,kind,source_key,title,detail,actor_name,project_id,conversation_id,client_id,opportunity_id,task_id,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(studio_id,user_id,source_key) DO NOTHING`);
 const at=row.createdAt||now();let count=0;
 for(const userId of new Set(recipients)){
  if(!userId||userId===actorUserId)continue;
  count+=insert.run(id(),row.studioId,userId,row.kind,row.sourceKey,clip(row.title,160),clip(row.detail,240),clip(row.actorName,120),
   row.projectId||null,row.conversationId||null,row.clientId||null,row.opportunityId||null,row.taskId||null,at).changes;
 }
 return count;
}

/** Everyone who can read a conversation: owners, invited clients and, for projects, assigned contributors. */
export function conversationRecipients(db,c){
 return c.project_id?[...owners(db,c.studio_id),...projectClients(db,c.studio_id,c.project_id),...contributors(db,c.studio_id,c.project_id)]:[...owners(db,c.studio_id),...accountClients(db,c.studio_id,c.client_id)];
}

/** A message in any conversation, sent to everyone else who can read it. */
export function recordMessage(db,{studioId,conversationId,messageId,actorUserId}){
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(conversationId,studioId);
 const message=c&&db.prepare('SELECT * FROM conversation_messages WHERE id=? AND conversation_id=?').get(messageId,c.id);
 if(!message)return 0;
 const project=c.project_id?JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,studioId)?.data||'null'):null;
 return deliver(db,conversationRecipients(db,c),actorUserId,{studioId,kind:'message',sourceKey:'message:'+message.id,actorName:message.author_name,
  title:message.text.trim()?`${message.author_name}: ${message.text}`:`${message.author_name} shared a file`,detail:project?.title||c.subject,
  projectId:c.project_id,conversationId:c.id,clientId:c.client_id,createdAt:message.created_at});
}

/** A saved project activity entry or project message, as used by the email outbox. */
export function recordProjectEvent(db,{studioId,projectId,actorUserId,eventId}){
 if(typeof eventId!=='string'||!eventId)return 0;
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);
 if(!row)return 0;
 const c=db.prepare('SELECT id FROM conversations WHERE project_id=? AND studio_id=?').get(projectId,studioId);
 if(c&&db.prepare('SELECT 1 FROM conversation_messages WHERE id=? AND conversation_id=?').get(eventId,c.id))return recordMessage(db,{studioId,conversationId:c.id,messageId:eventId,actorUserId});
 const project=JSON.parse(row.data),item=(project.activity||[]).find(entry=>entry.id===eventId);
 if(!item||item.text==='Added a message')return 0;
 // Activity is visible to the owner and invited clients. Contributors only see chat and their own tasks.
 return deliver(db,[...owners(db,studioId),...projectClients(db,studioId,projectId)],actorUserId,{studioId,kind:'project_update',sourceKey:'event:'+item.id,
  actorName:item.actor,title:item.text,detail:project.title,projectId,createdAt:item.at});
}

/** A client opening a proposal, contract, estimate or invoice for the first time. Only studio owners are told. */
export function recordDocumentOpened(db,{studioId,projectId,kind,itemId,actorName,title,detail,opportunityId,clientId,createdAt}){
 return deliver(db,owners(db,studioId),null,{studioId,kind:'project_update',sourceKey:`opened:${kind}:${itemId}`,actorName,title,detail,projectId,clientId,opportunityId,createdAt});
}

/** A public enquiry or form submission. Only studio owners can see enquiries. */
export function recordEnquiry(db,{studioId,projectId}){
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);
 if(!row)return 0;
 const project=JSON.parse(row.data),opportunity=db.prepare('SELECT id,client_id FROM crm_opportunities WHERE project_id=? AND studio_id=?').get(projectId,studioId);
 return deliver(db,owners(db,studioId),null,{studioId,kind:'enquiry',sourceKey:'enquiry:'+projectId,actorName:project.brief?.name,
  title:`New enquiry from ${project.brief?.name||'a website visitor'}`,detail:[project.brief?.occasion,dayLabel(project.brief?.date)].filter(Boolean).join(' · '),
  projectId,clientId:opportunity?.client_id,opportunityId:opportunity?.id,createdAt:project.createdAt});
}

/** A task handed to someone else. Repeated assignments notify again; self-assignment does not. */
export function recordTaskAssignment(db,{studioId,taskKind,taskId,projectId=null,title,assigneeId,actor}){
 if(!assigneeId)return 0;
 const project=projectId?JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId)?.data||'null'):null;
 return deliver(db,[assigneeId],actor.id,{studioId,kind:'task_assigned',sourceKey:`task:${taskKind}:${taskId}:${id()}`,actorName:actor.name,
  title:`${actor.name} assigned you: ${title}`,detail:project?.title||'Private follow-up',projectId,taskId:taskKind==='project'?`project:${projectId}:${taskId}`:taskId});
}

/** A private nudge for the studio about a conversation that has gone quiet. Only owners see these. */
export function recordFollowUp(db,{studioId,conversationId,sourceKey,title,detail}){
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(conversationId,studioId);
 if(!c)return 0;
 return deliver(db,owners(db,studioId),null,{studioId,kind:'follow_up',sourceKey,title,detail,projectId:c.project_id,conversationId:c.id,clientId:c.client_id});
}

function visible(db,row,{owner,userId}){
 if(row.kind==='follow_up')return owner&&!!db.prepare('SELECT 1 FROM conversations WHERE id=? AND studio_id=?').get(row.conversation_id,row.studio_id);
 if(owner)return row.kind==='message'?!!db.prepare('SELECT 1 FROM conversations WHERE id=? AND studio_id=?').get(row.conversation_id,row.studio_id)
  :row.project_id?!!db.prepare('SELECT 1 FROM projects WHERE id=? AND studio_id=?').get(row.project_id,row.studio_id):true;
 if(row.kind==='enquiry')return false;
 if(row.kind==='message'){const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(row.conversation_id,row.studio_id);return !!c&&!!conversationAccess(db,c,userId);}
 if(row.kind==='project_update')return !!projectAccess(db,row.studio_id,row.project_id,userId);
 if(row.kind==='task_assigned')return !!row.project_id&&!!db.prepare(`SELECT 1 FROM studio_project_collaborators pc JOIN studio_staff ss ON ss.user_id=pc.user_id AND ss.studio_id=pc.studio_id
  WHERE pc.studio_id=? AND pc.project_id=? AND pc.user_id=?`).get(row.studio_id,row.project_id,userId);
 return false;
}

const dto=row=>({id:row.id,kind:row.kind,title:row.title,detail:row.detail,actorName:row.actor_name,projectId:row.project_id,conversationId:row.conversation_id,
 clientId:row.client_id,opportunityId:row.opportunity_id,taskId:row.task_id,createdAt:row.created_at,read:!!row.read_at});

export function listNotifications(db,{studioId,userId,owner,limit=20,before=''}){
 const size=Number.isInteger(limit)&&limit>0?Math.min(limit,PAGE_MAX):20;
 if(before&&!/^[1-9][0-9]{0,15}$/.test(String(before)))fail(400,'Check the notification page.');
 // Insertion order is the feed order, so equal timestamps still page deterministically.
 const page=db.prepare('SELECT * FROM notification_events WHERE studio_id=? AND user_id=? AND seq<? ORDER BY seq DESC LIMIT ?');
 const items=[];let last=before?Number(before):Number.MAX_SAFE_INTEGER,more=true;
 while(items.length<=size&&more){
  const rows=page.all(studioId,userId,last,PAGE_MAX);
  more=rows.length===PAGE_MAX;
  for(const row of rows){last=row.seq;if(visible(db,row,{owner,userId}))items.push(row);if(items.length>size)break;}
 }
 const unreadRows=db.prepare('SELECT * FROM notification_events WHERE studio_id=? AND user_id=? AND read_at IS NULL ORDER BY seq DESC LIMIT ?').all(studioId,userId,UNREAD_SCAN)
  .filter(row=>visible(db,row,{owner,userId})),unread=unreadRows.length;
 const unreadByKind=Object.fromEntries(KINDS.map(kind=>[kind,unreadRows.filter(row=>row.kind===kind).length]));
 const shown=items.slice(0,size),next=items.length>size?shown.at(-1):null;
 return {notifications:shown.map(dto),unread,unreadByKind,nextCursor:next?String(next.seq):null};
}

export function markNotificationsRead(db,{studioId,userId,ids,all=false}){
 const at=now();
 if(all)return db.prepare('UPDATE notification_events SET read_at=? WHERE studio_id=? AND user_id=? AND read_at IS NULL').run(at,studioId,userId).changes;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(value=>typeof value!=='string'||value.length>60))fail(400,'Choose notifications to mark as read.');
 const update=db.prepare('UPDATE notification_events SET read_at=? WHERE id=? AND studio_id=? AND user_id=? AND read_at IS NULL');
 return ids.reduce((sum,value)=>sum+update.run(at,value,studioId,userId).changes,0);
}

export function markNotificationsUnread(db,{studioId,userId,ids}){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(value=>typeof value!=='string'||value.length>60))fail(400,'Choose notifications to mark as unread.');
 const update=db.prepare('UPDATE notification_events SET read_at=NULL WHERE id=? AND studio_id=? AND user_id=?');
 return ids.reduce((sum,value)=>sum+update.run(value,studioId,userId).changes,0);
}

export function handleNotificationFeed({db,req,url,route,body,user,studio,owner,reply}){
 if(route!=='/api/notifications'&&route!=='/api/notifications/read'&&route!=='/api/notifications/unread')return false;
 const args={studioId:studio.id,userId:user.id};
 if(route==='/api/notifications'){
  if(req.method!=='GET')fail(405,'Method not allowed.');
  const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20;
  reply(200,listNotifications(db,{...args,owner,limit,before:url.searchParams.get('before')||''}));return true;
 }
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(route==='/api/notifications/read')markNotificationsRead(db,{...args,ids:body.ids,all:body.all===true});
 else markNotificationsUnread(db,{...args,ids:body.ids});
 reply(200,listNotifications(db,{...args,owner,limit:Number.isInteger(body.limit)?body.limit:20}));return true;
}
