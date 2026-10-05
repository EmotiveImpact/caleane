import {id,now,transaction} from './store.mjs';

export const stages=['Discovery','Qualified','Proposal','Negotiation','Won','Lost'];
const currencies=['GBP','EUR','USD'];
const activityKinds=['Call','Meeting','Email','Note'];
const priorities=['Low','Normal','High'];
const error=(status,message)=>{throw Object.assign(new Error(message),{status});};
const string=(value,max,label)=>{if(typeof value!=='string'||value.length>max)error(400,`Check ${label}.`);return value.trim();};
const date=(value,label)=>{const result=string(value||'',10,label);if(result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result))error(400,`Enter a valid ${label}.`);return result;};
const clientRow=(db,studioId,clientId)=>{
 const row=db.prepare('SELECT id,name,email FROM clients WHERE id=? AND studio_id=?').get(clientId,studioId);
 if(!row)error(404,'Client not found.');return row;
};
const opportunityRow=(db,studioId,opportunityId)=>{
 const row=db.prepare('SELECT * FROM crm_opportunities WHERE id=? AND studio_id=?').get(opportunityId,studioId);
 if(!row)error(404,'Opportunity not found.');return row;
};
const dto=row=>({id:row.id,studioId:row.studio_id,clientId:row.client_id,clientName:row.client_name,clientEmail:row.client_email,
 projectId:row.project_id,title:row.title,description:row.description,stage:row.stage,amountMinor:row.amount_minor,
 currency:row.currency,probability:row.probability,expectedClose:row.expected_close,lostReason:row.lost_reason,
 source:row.source,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,
 projectStatus:row.project_status||null,projectUpdatedAt:row.project_updated_at||null,projectDate:row.project_date||'',formName:row.form_name||null,
 receivedAt:row.received_at||row.created_at,reviewedAt:row.reviewed_at||null,reviewedBy:row.reviewed_by||null,
 needsReview:row.reviewed_at===''||!row.reviewed_at&&!!(row.response_id||row.project_status==='Enquiry')});
const withClient=`SELECT o.*,c.name AS client_name,c.email AS client_email,
 json_extract(p.data,'$.updatedAt') AS project_updated_at,json_extract(p.data,'$.status') AS project_status,json_extract(p.data,'$.brief.date') AS project_date,
 r.id AS response_id,r.created_at AS received_at,json_extract(r.snapshot,'$.definition.name') AS form_name,
 review.reviewed_at,review.reviewed_by
 FROM crm_opportunities o JOIN clients c ON c.id=o.client_id AND c.studio_id=o.studio_id
 LEFT JOIN projects p ON p.id=o.project_id AND p.studio_id=o.studio_id
 LEFT JOIN enquiry_form_responses r ON r.id=(SELECT id FROM enquiry_form_responses WHERE project_id=o.project_id AND studio_id=o.studio_id ORDER BY created_at DESC,id DESC LIMIT 1)
 LEFT JOIN crm_enquiry_reviews review ON review.opportunity_id=o.id AND review.studio_id=o.studio_id`;

function fields(input,current){
 const title=string(input.title??current?.title,200,'the opportunity title');if(!title)error(400,'Add an opportunity title.');
 const description=string(input.description??current?.description??'',3000,'the opportunity description');
 const stage=input.stage??current?.stage??'Discovery';if(!stages.includes(stage))error(400,'Choose a pipeline stage.');
 const amountMinor=input.amountMinor??current?.amount_minor??0;
 if(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>100000000000)error(400,'Enter an amount between zero and one billion.');
 const currency=input.currency??current?.currency??'GBP';if(!currencies.includes(currency))error(400,'Choose a supported currency.');
 let probability=input.probability??current?.probability??20;
 if(stage==='Won')probability=100;if(stage==='Lost')probability=0;
 if(!Number.isInteger(probability)||probability<0||probability>100)error(400,'Probability must be between 0 and 100.');
 const expectedClose=date(input.expectedClose??current?.expected_close??'','expected close date');
 const lostReason=stage==='Lost'?string(input.lostReason??current?.lost_reason??'',500,'the lost reason'):'';
 if(stage==='Lost'&&!lostReason)error(400,'Add a reason before marking an opportunity lost.');
 const source=string(input.source??current?.source??'',120,'the source');
 return {title,description,stage,amountMinor,currency,probability,expectedClose,lostReason,source};
}

export function listOpportunities(db,studioId){
 return db.prepare(`${withClient} WHERE o.studio_id=? ORDER BY o.updated_at DESC,o.id`).all(studioId).map(dto);
}
export function getOpportunity(db,studioId,opportunityId){
 opportunityRow(db,studioId,opportunityId);
 const row=db.prepare(`${withClient} WHERE o.id=? AND o.studio_id=?`).get(opportunityId,studioId);
 const response=row.response_id?db.prepare('SELECT version,snapshot FROM enquiry_form_responses WHERE id=? AND studio_id=?').get(row.response_id,studioId):null;
 const project=row.project_id?JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(row.project_id,studioId)?.data||'null'):null;
 const snapshot=response?JSON.parse(response.snapshot):null;
 return {...dto(row),intake:snapshot?{formName:snapshot.definition.name,version:response.version,submittedAt:snapshot.submittedAt||row.received_at,brief:snapshot.brief,consentText:snapshot.definition.consentText||'',consent:snapshot.consent,original:true}:project?{formName:null,version:null,submittedAt:project.createdAt,brief:project.brief,original:false}:null,activities:listActivities(db,studioId,row.client_id,opportunityId),tasks:listTasks(db,studioId,opportunityId)};
}
export function createOpportunity(db,studioId,user,input){
 const client=clientRow(db,studioId,string(input.clientId,100,'the client'));
 const v=fields(input),oid=id(),at=now();
 transaction(db,()=>{
  db.prepare(`INSERT INTO crm_opportunities
  (id,studio_id,client_id,project_id,title,description,stage,amount_minor,currency,probability,expected_close,lost_reason,source,revision,created_at,updated_at)
  VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,?,1,?,?)`).run(oid,studioId,client.id,v.title,v.description,v.stage,v.amountMinor,v.currency,v.probability,v.expectedClose,v.lostReason,v.source,at,at);
  insertActivity(db,{studioId,clientId:client.id,opportunityId:oid,kind:'System',title:'Opportunity opened',detail:v.title,user,at});
 });return getOpportunity(db,studioId,oid);
}
export function reviewOpportunity(db,studioId,user,opportunityId,input){
 const current=opportunityRow(db,studioId,opportunityId);
 if(!Number.isInteger(input.revision)||input.revision!==current.revision)error(409,'This enquiry changed. Close and reopen it before reviewing.');
 if(typeof input.reviewed!=='boolean')error(400,'Choose a review state.');
 const at=now();transaction(db,()=>{
  const changed=db.prepare('UPDATE crm_opportunities SET revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND revision=?').run(at,opportunityId,studioId,input.revision);
  if(!changed.changes)error(409,'This enquiry changed. Close and reopen it before reviewing.');
  if(input.reviewed)db.prepare('INSERT INTO crm_enquiry_reviews VALUES(?,?,?,?) ON CONFLICT(opportunity_id,studio_id) DO UPDATE SET reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by').run(opportunityId,studioId,at,user.name);
  else db.prepare('INSERT INTO crm_enquiry_reviews VALUES(?,?,?,?) ON CONFLICT(opportunity_id,studio_id) DO UPDATE SET reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by').run(opportunityId,studioId,'',user.name);
  insertActivity(db,{studioId,clientId:current.client_id,opportunityId,kind:'System',title:input.reviewed?'Enquiry reviewed':'Enquiry marked for review',detail:'',user,at});
 });return getOpportunity(db,studioId,opportunityId);
}
export function updateOpportunity(db,studioId,user,opportunityId,input){
 const current=opportunityRow(db,studioId,opportunityId),v=fields(input,current);
 if(!Number.isInteger(input.revision)||input.revision!==current.revision)error(409,'This opportunity changed while you were editing. Refresh and try again.');
 const at=now();
 transaction(db,()=>{
  const result=db.prepare(`UPDATE crm_opportunities SET title=?,description=?,stage=?,amount_minor=?,currency=?,probability=?,expected_close=?,lost_reason=?,source=?,revision=revision+1,updated_at=?
   WHERE id=? AND studio_id=? AND revision=?`).run(v.title,v.description,v.stage,v.amountMinor,v.currency,v.probability,v.expectedClose,v.lostReason,v.source,at,opportunityId,studioId,input.revision);
  if(!result.changes)error(409,'This opportunity changed while you were editing. Refresh and try again.');
  if(v.stage!==current.stage)insertActivity(db,{studioId,clientId:current.client_id,opportunityId,kind:'System',title:`Moved from ${current.stage} to ${v.stage}`,detail:v.stage==='Lost'?v.lostReason:'',user,at});
  else insertActivity(db,{studioId,clientId:current.client_id,opportunityId,kind:'System',title:'Opportunity details updated',detail:'',user,at});
 });return getOpportunity(db,studioId,opportunityId);
}

function insertActivity(db,{studioId,clientId,opportunityId,kind,title,detail,user,at}){
 db.prepare(`INSERT INTO crm_activities (id,studio_id,client_id,opportunity_id,kind,title,detail,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
  .run(id(),studioId,clientId,opportunityId||null,kind,title,detail||'',user.id,user.name,at);
}
export function listActivities(db,studioId,clientId,opportunityId=null){
 clientRow(db,studioId,clientId);
 const where=opportunityId?' AND a.opportunity_id=?':'';
 return db.prepare(`SELECT a.* FROM crm_activities a WHERE a.studio_id=? AND a.client_id=?${where} ORDER BY a.created_at DESC,a.rowid DESC`)
  .all(...(opportunityId?[studioId,clientId,opportunityId]:[studioId,clientId]))
  .map(a=>({id:a.id,clientId:a.client_id,opportunityId:a.opportunity_id,kind:a.kind,title:a.title,detail:a.detail,by:a.actor_name,at:a.created_at}));
}
export function logActivity(db,studioId,user,clientId,input,opportunityId=null){
 clientRow(db,studioId,clientId);
 if(opportunityId&&opportunityRow(db,studioId,opportunityId).client_id!==clientId)error(404,'This opportunity does not belong to the client.');
 const kind=input.kind;if(!activityKinds.includes(kind))error(400,'Choose an activity type.');
 const title=string(input.title,160,'the activity title'),detail=string(input.detail||'',3000,'the activity detail');if(!title)error(400,'Add an activity title.');
 const at=now();insertActivity(db,{studioId,clientId,opportunityId,kind,title,detail,user,at});
 if(opportunityId)db.prepare('UPDATE crm_opportunities SET updated_at=? WHERE id=? AND studio_id=?').run(at,opportunityId,studioId);
 return listActivities(db,studioId,clientId,opportunityId);
}

export function listTasks(db,studioId,opportunityId=null){
 const where=opportunityId?' AND t.opportunity_id=?':'';
 return db.prepare(`SELECT t.*,c.name AS client_name,o.title AS opportunity_title FROM crm_tasks t JOIN clients c ON c.id=t.client_id AND c.studio_id=t.studio_id LEFT JOIN crm_opportunities o ON o.id=t.opportunity_id AND o.studio_id=t.studio_id WHERE t.studio_id=?${where} ORDER BY t.completed,t.due_date='',t.due_date,t.created_at DESC`)
  .all(...(opportunityId?[studioId,opportunityId]:[studioId]))
  .map(t=>({id:t.id,clientId:t.client_id,clientName:t.client_name,opportunityId:t.opportunity_id,opportunityTitle:t.opportunity_title,title:t.title,detail:t.detail,dueDate:t.due_date,priority:t.priority,completed:!!t.completed,createdAt:t.created_at,completedAt:t.completed_at,createdBy:t.created_by}));
}
export function createTask(db,studioId,user,input){
 const clientId=string(input.clientId,100,'the client');clientRow(db,studioId,clientId);
 const opportunityId=input.opportunityId?string(input.opportunityId,100,'the opportunity'):null;
 if(opportunityId&&opportunityRow(db,studioId,opportunityId).client_id!==clientId)error(404,'This opportunity does not belong to the client.');
 const title=string(input.title,200,'the task title'),detail=string(input.detail||'',2000,'the task detail'),dueDate=date(input.dueDate||'','task due date'),priority=input.priority||'Normal';
 if(!title||!priorities.includes(priority))error(400,'Add a task title and priority.');
 const taskId=id(),at=now();transaction(db,()=>{
  db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
   .run(taskId,studioId,clientId,opportunityId,title,detail,dueDate,priority,at,user.name);
  insertActivity(db,{studioId,clientId,opportunityId,kind:'System',title:`Task created: ${title}`,detail:'',user,at});
 });return listTasks(db,studioId).find(t=>t.id===taskId);
}
export function deleteTask(db,studioId,user,taskId){
 const current=db.prepare('SELECT * FROM crm_tasks WHERE id=? AND studio_id=?').get(taskId,studioId);if(!current)error(404,'Task not found.');
 transaction(db,()=>{db.prepare('DELETE FROM crm_tasks WHERE id=? AND studio_id=?').run(taskId,studioId);insertActivity(db,{studioId,clientId:current.client_id,opportunityId:current.opportunity_id,kind:'System',title:`Task deleted: ${current.title}`,detail:'',user,at:now()});});
 return {id:taskId};
}
export function updateTask(db,studioId,user,taskId,input){
 const current=db.prepare('SELECT * FROM crm_tasks WHERE id=? AND studio_id=?').get(taskId,studioId);if(!current)error(404,'Task not found.');
 const title=string(input.title??current.title,200,'the task title'),detail=string(input.detail??current.detail,2000,'the task detail'),dueDate=date(input.dueDate??current.due_date,'task due date'),priority=input.priority??current.priority,completed=input.completed??!!current.completed;
 if(!title||!priorities.includes(priority)||typeof completed!=='boolean')error(400,'Check the task details.');
 const at=now();transaction(db,()=>{
  db.prepare('UPDATE crm_tasks SET title=?,detail=?,due_date=?,priority=?,completed=?,completed_at=? WHERE id=? AND studio_id=?')
   .run(title,detail,dueDate,priority,completed?1:0,completed?(current.completed_at||at):'',taskId,studioId);
  if(completed!==!!current.completed)insertActivity(db,{studioId,clientId:current.client_id,opportunityId:current.opportunity_id,kind:'System',title:`Task ${completed?'completed':'reopened'}: ${title}`,detail:'',user,at});
 });return listTasks(db,studioId).find(t=>t.id===taskId);
}
