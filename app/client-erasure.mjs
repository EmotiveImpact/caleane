import {now,transaction} from './store.mjs';
import {protectedReasons} from './data-governance.mjs';
// Permanent erasure of one client and everything only they own, for UK GDPR erasure requests.
// Records the studio must keep by law (issued invoices, proposals, contracts, documents) block erasure.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const columns=(db,table)=>db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
const list=values=>values.map(()=>'?').join(',')||"''";
const KEEP=new Set(['users','studios','sessions','studio_branding','studio_settings_kv','invoice_counters','credit_note_counters','stripe_webhook_events']);
// What the person wrote stays with the studio's records; only their name on it is cleared below.
const AUTHORED=new Set(['users','memberships','conversation_messages','crm_contacts']);
// The erased client's own login. Linked to another studio, only this studio's link goes. Otherwise the account,
// its sessions, tokens and settings go, and it is deleted outright unless something the studio keeps still points at it.
function eraseAccount(db,{studioId,userId,drop}){
 const linked=db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND studio_id<>? UNION SELECT 1 FROM memberships WHERE user_id=? AND studio_id=? AND role<>? UNION SELECT 1 FROM studio_staff WHERE user_id=?').get(userId,studioId,userId,studioId,'client',userId);
 drop('memberships',"user_id=? AND studio_id=? AND role='client'",[userId,studioId]);
 if(linked){for(const table of tables(db)){const cols=columns(db,table);if(!AUTHORED.has(table)&&cols.includes('user_id')&&cols.includes('studio_id'))drop(table,'user_id=? AND studio_id=?',[userId,studioId]);}return 'unlinked';}
 for(const table of tables(db)){if(AUTHORED.has(table))continue;const cols=columns(db,table);
  if(cols.includes('user_id'))drop(table,'user_id=?',[userId]);
  if(cols.includes('recipient_user_id'))drop(table,'recipient_user_id=?',[userId]);
 }
 for(const table of ['conversation_messages','crm_contacts'])db.prepare(`UPDATE ${table} SET user_id=NULL WHERE user_id=?`).run(userId);
 const referenced=tables(db).some(table=>table!=='users'&&db.prepare(`PRAGMA foreign_key_list(${table})`).all().some(fk=>fk.table==='users'&&db.prepare(`SELECT 1 FROM ${table} WHERE "${fk.from}"=?`).get(userId)));
 if(!referenced){drop('users','id=?',[userId]);return 'deleted';}
 // A design upload or activity record still names this account: keep the row, but nothing that identifies or signs in.
 db.prepare("UPDATE users SET email=?,name='Erased client',password='' WHERE id=?").run(`erased-${userId}@erased.invalid`,userId);
 return 'anonymised';
}
export function clientErasurePreview(db,studioId,clientId){
 const client=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientId,studioId);if(!client)fail(404,'Client not found.');
 const projects=db.prepare('SELECT p.data FROM crm_project_relationships r JOIN projects p ON p.id=r.project_id AND p.studio_id=r.studio_id WHERE r.studio_id=? AND r.client_id=?').all(studioId,clientId).map(r=>JSON.parse(r.data));
 const blocked=projects.map(p=>({id:p.id,title:p.title,reasons:protectedReasons(db,p,studioId)})).filter(p=>p.reasons.length);
 return {client,projects,blocked};
}
export function eraseClient(db,{studioId,clientId,confirmName}){
 const {client,projects,blocked}=clientErasurePreview(db,studioId,clientId);
 if(confirmName!==client.name)fail(400,'Type the client name exactly to confirm.');
 if(blocked.length)fail(409,`This client has records you must keep: ${blocked.map(p=>`${p.title} (${p.reasons.join(', ').toLowerCase()})`).join('; ')}. Archive the client instead.`);
 const projectIds=projects.map(p=>p.id);
 const contactIds=db.prepare('SELECT contact_id FROM crm_client_contacts WHERE studio_id=? AND client_id=?').all(studioId,clientId).map(r=>r.contact_id).filter(contactId=>!db.prepare(`SELECT 1 FROM crm_client_contacts WHERE studio_id=? AND contact_id=? AND client_id<>? UNION SELECT 1 FROM crm_project_stakeholders WHERE studio_id=? AND contact_id=? AND project_id NOT IN (${list(projectIds)})`).get(studioId,contactId,clientId,studioId,contactId,...projectIds));
 const contactUsers=contactIds.length?db.prepare(`SELECT user_id FROM crm_contacts WHERE studio_id=? AND id IN (${list(contactIds)}) AND user_id IS NOT NULL`).all(studioId,...contactIds).map(r=>r.user_id):[];
 const emails=[...new Set([client.email,...(contactIds.length?db.prepare(`SELECT email FROM crm_contacts WHERE studio_id=? AND id IN (${list(contactIds)})`).all(studioId,...contactIds).map(r=>r.email):[])])];
 // A login made from an invitation to this client, even where the contact link was never made.
 const users=[...new Set([...contactUsers,...db.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id AND m.studio_id=? AND m.role='client' WHERE u.email IN (${list(emails)})`).all(studioId,...emails).map(r=>r.id)])];
 const conversationIds=db.prepare(`SELECT id FROM conversations WHERE studio_id=? AND (client_id=? OR project_id IN (${list(projectIds)}))`).all(studioId,clientId,...projectIds).map(r=>r.id);
 const messageIds=conversationIds.length?db.prepare(`SELECT id FROM conversation_messages WHERE conversation_id IN (${list(conversationIds)})`).all(...conversationIds).map(r=>r.id):[];
 const crmTaskIds=db.prepare('SELECT id FROM crm_tasks WHERE studio_id=? AND client_id=?').all(studioId,clientId).map(r=>r.id);
 const taskKeys=[...projects.flatMap(p=>(p.tasks||[]).map(t=>`project:${p.id}:${t.id}`)),...crmTaskIds.map(t=>'crm:'+t)];
 const counts={},accounts={deleted:0,anonymised:0,unlinked:0};
 transaction(db,()=>{
  db.exec('PRAGMA defer_foreign_keys=ON');
  const drop=(table,where,args)=>{const result=db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...args);if(result.changes)counts[table]=(counts[table]||0)+result.changes;};
  for(const table of tables(db)){
   if(KEEP.has(table)||['clients','projects','conversations','crm_contacts','memberships'].includes(table))continue;
   const cols=columns(db,table),scope=cols.includes('studio_id')?' AND studio_id=?':'',scoped=args=>cols.includes('studio_id')?[...args,studioId]:args;
   if(cols.includes('message_id')&&messageIds.length)drop(table,`message_id IN (${list(messageIds)})`,messageIds);
   if(cols.includes('conversation_id')&&conversationIds.length)drop(table,`conversation_id IN (${list(conversationIds)})`+scope,scoped(conversationIds));
   if(cols.includes('project_id')&&projectIds.length)drop(table,`project_id IN (${list(projectIds)})`+scope,scoped(projectIds));
   if(cols.includes('client_id'))drop(table,'client_id=?'+scope,scoped([clientId]));
   if(cols.includes('contact_id')&&contactIds.length)drop(table,`contact_id IN (${list(contactIds)})`+scope,scoped(contactIds));
   if(cols.includes('task_key')&&taskKeys.length)drop(table,`task_key IN (${list(taskKeys)})`+scope,scoped(taskKeys));
   if(table==='calendar_mappings')for(const projectId of projectIds)drop(table,"studio_id=? AND (item_key LIKE ? OR data LIKE ?)",[studioId,`%${projectId}%`,`%${projectId}%`]);
   if(table==='webhook_events')for(const term of [client.id,client.email,...projectIds])drop(table,'studio_id=? AND payload LIKE ?',[studioId,`%"${term}"%`]);
   if(table==='consultations')drop(table,'studio_id=? AND data LIKE ?',[studioId,`%"${client.email}"%`]);
  }
  if(conversationIds.length)drop('conversations',`id IN (${list(conversationIds)})`,conversationIds);
  if(projectIds.length){drop('files',`project_id IN (${list(projectIds)})`,projectIds);drop('projects',`studio_id=? AND id IN (${list(projectIds)})`,[studioId,...projectIds]);}
  if(contactIds.length)drop('crm_contacts',`studio_id=? AND id IN (${list(contactIds)})`,[studioId,...contactIds]);
  // Invitations hold their email and could still create a login, and queued emails would still reach them.
  drop('invitations',`studio_id=? AND email IN (${list(emails)})`,[studioId,...emails]);
  if(tables(db).includes('notification_outbox'))drop('notification_outbox',`studio_id=? AND recipient_email IN (${list(emails)})`,[studioId,...emails]);
  for(const userId of users)if(!db.prepare('SELECT 1 FROM crm_contacts WHERE studio_id=? AND user_id=?').get(studioId,userId))accounts[eraseAccount(db,{studioId,userId,drop})]++;
  // Files kept in the client's and their projects' custom fields go with them, unless another record still names one.
  const fieldFiles=[client.data,...projects.map(p=>JSON.stringify(p))].flatMap(data=>Object.values(JSON.parse(data).customFields||{}).map(v=>v?.fileId).filter(Boolean));
  if(tables(db).includes('custom_field_files'))for(const fileId of new Set(fieldFiles)){const pattern=`%"fileId":"${fileId}"%`;if(!db.prepare(`SELECT 1 FROM clients WHERE studio_id=? AND id<>? AND data LIKE ? UNION ALL SELECT 1 FROM projects WHERE studio_id=? AND data LIKE ? LIMIT 1`).get(studioId,clientId,pattern,studioId,pattern))drop('custom_field_files','id=? AND studio_id=?',[fileId,studioId]);}
  drop('clients','id=? AND studio_id=?',[clientId,studioId]);
 });
 return {erasedAt:now(),client:{id:client.id,name:client.name},projects:projectIds.length,records:counts,accounts};
}
