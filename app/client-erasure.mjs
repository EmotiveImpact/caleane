import {now,transaction} from './store.mjs';
import {protectedReasons} from './data-governance.mjs';
// Permanent erasure of one client and everything only they own, for UK GDPR erasure requests.
// Records the studio must keep by law (issued invoices, proposals, contracts, documents) block erasure.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const columns=(db,table)=>db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
const list=values=>values.map(()=>'?').join(',')||"''";
const KEEP=new Set(['users','studios','sessions','studio_branding','studio_settings_kv','invoice_counters','credit_note_counters','stripe_webhook_events']);
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
 const conversationIds=db.prepare(`SELECT id FROM conversations WHERE studio_id=? AND (client_id=? OR project_id IN (${list(projectIds)}))`).all(studioId,clientId,...projectIds).map(r=>r.id);
 const messageIds=conversationIds.length?db.prepare(`SELECT id FROM conversation_messages WHERE conversation_id IN (${list(conversationIds)})`).all(...conversationIds).map(r=>r.id):[];
 const crmTaskIds=db.prepare('SELECT id FROM crm_tasks WHERE studio_id=? AND client_id=?').all(studioId,clientId).map(r=>r.id);
 const taskKeys=[...projects.flatMap(p=>(p.tasks||[]).map(t=>`project:${p.id}:${t.id}`)),...crmTaskIds.map(t=>'crm:'+t)];
 const counts={};
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
   if(table==='consultations')drop(table,'studio_id=? AND data LIKE ?',[studioId,`%"${client.email}"%`]);
  }
  if(conversationIds.length)drop('conversations',`id IN (${list(conversationIds)})`,conversationIds);
  if(projectIds.length){drop('files',`project_id IN (${list(projectIds)})`,projectIds);drop('projects',`studio_id=? AND id IN (${list(projectIds)})`,[studioId,...projectIds]);}
  if(contactIds.length)drop('crm_contacts',`studio_id=? AND id IN (${list(contactIds)})`,[studioId,...contactIds]);
  for(const userId of contactUsers)if(!db.prepare('SELECT 1 FROM crm_contacts WHERE studio_id=? AND user_id=?').get(studioId,userId))drop('memberships',"user_id=? AND studio_id=? AND role='client'",[userId,studioId]);
  drop('clients','id=? AND studio_id=?',[clientId,studioId]);
 });
 return {erasedAt:now(),client:{id:client.id,name:client.name},projects:projectIds.length,records:counts};
}
