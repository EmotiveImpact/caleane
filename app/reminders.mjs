import {id,now,transaction,materializeProjectConversation,appendConversationMessage} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';
import {getPlan} from './payment-plans.mjs';
import {projectClientId} from './relationships.mjs';
import {ensureInvoiceExtras,invoiceCharges} from './invoice-adjustments.mjs';
import {applyLateFees} from './invoice-extras.mjs';

// Automatic reminders. Client reminders are posted from the studio into the
// project conversation, so they are visible and unread in the client portal.
// When the email outbox is configured they are queued there too. Payment plan
// reminders are for the owner and become private follow-ups.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const defaultReminderSettings={enabled:false,invoiceBeforeDueDays:3,invoiceOverdue:true,overdueRepeatDays:7,overdueMaxReminders:3,proposalBeforeExpiryDays:3,contractBeforeExpiryDays:3,approvalAfterDays:5,planStepTasks:true};
const dayNumber=value=>Math.floor(Date.parse(value.slice(0,10)+'T12:00:00Z')/86400000);
const money=(minor,currency)=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);}catch{return `${(minor/100).toFixed(2)} ${currency}`;}};
const longDate=value=>new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});

export function installReminders(db){ensureInvoiceExtras(db);db.exec('CREATE TABLE IF NOT EXISTS reminder_log(studio_id TEXT NOT NULL REFERENCES studios(id),key TEXT NOT NULL,project_id TEXT,kind TEXT NOT NULL,audience TEXT NOT NULL,summary TEXT NOT NULL,sent_at TEXT NOT NULL,PRIMARY KEY(studio_id,key)); CREATE INDEX IF NOT EXISTS reminder_log_recent ON reminder_log(studio_id,sent_at);');}

export function reminderSettings(db,studioId){return {...defaultReminderSettings,...readSetting(db,studioId,'reminders',{})};}
export function saveReminderSettings(db,studioId,input){
 const result={enabled:input.enabled===true,invoiceOverdue:input.invoiceOverdue!==false,planStepTasks:input.planStepTasks!==false};
 for(const [key,min,max] of [['invoiceBeforeDueDays',0,30],['overdueRepeatDays',1,60],['overdueMaxReminders',0,10],['proposalBeforeExpiryDays',0,30],['contractBeforeExpiryDays',0,30],['approvalAfterDays',0,60]]){
  const value=input[key]??defaultReminderSettings[key];if(!Number.isInteger(value)||value<min||value>max)fail(400,`Use a whole number between ${min} and ${max}.`);result[key]=value;
 }
 return writeSetting(db,studioId,'reminders',result);
}

function invoiceBalances(db,studioId,projectId){
 return db.prepare('SELECT * FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').all(studioId,projectId).map(row=>{
  const paid=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_payments WHERE studio_id=? AND invoice_id=?').get(studioId,row.id).n;
  const credited=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_credit_notes WHERE studio_id=? AND invoice_id=?').get(studioId,row.id).n;
  const refunded=db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM invoice_refunds WHERE studio_id=? AND invoice_id=?').get(studioId,row.id).n;
  return {...row,balance:row.amount_minor+invoiceCharges(db,studioId,row.id).chargesMinor-credited-(paid-refunded)};
 });
}

// Everything that is due on `today`, whether or not it was already sent.
export function dueReminders(db,studioId,today,settings=reminderSettings(db,studioId)){
 const items=[],t=dayNumber(today);
 const projects=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studioId).map(row=>JSON.parse(row.data)).filter(p=>!['Archived','Complete'].includes(p.status));
 for(const p of projects){
  for(const invoice of invoiceBalances(db,studioId,p.id).filter(item=>item.balance>0)){
   const until=dayNumber(invoice.due_date)-t,amount=money(invoice.balance,invoice.currency);
   if(until>=0&&until<=settings.invoiceBeforeDueDays)items.push({key:`invoice-due:${invoice.id}`,kind:'Invoice due',audience:'client',project:p,summary:`${invoice.number} due ${longDate(invoice.due_date)}`,
    text:`A gentle reminder that invoice ${invoice.number} (${amount}) is due on ${longDate(invoice.due_date)}. You can find it, with the payment details, under Billing in this project.`});
   if(until<0&&settings.invoiceOverdue&&settings.overdueMaxReminders>0){
    // One reminder per overdue period; a missed run catches up with the latest period only.
    const round=Math.min(Math.floor((-until-1)/settings.overdueRepeatDays),settings.overdueMaxReminders-1);
    items.push({key:`invoice-overdue:${invoice.id}:${round}`,kind:'Invoice overdue',audience:'client',project:p,summary:`${invoice.number} overdue, ${amount} outstanding`,
     text:`Invoice ${invoice.number} was due on ${longDate(invoice.due_date)} and ${amount} is still outstanding. If you have already paid, thank you, and please let us know so we can update our records.`});
   }
  }
  const proposal=(p.proposals||[]).at(-1);
  if(proposal?.status==='Awaiting response'&&proposal.expiresOn){const until=dayNumber(proposal.expiresOn)-t;if(until>=0&&until<=settings.proposalBeforeExpiryDays)items.push({key:`proposal-expiry:${proposal.id}`,kind:'Proposal expiring',audience:'client',project:p,summary:`Proposal open until ${longDate(proposal.expiresOn)}`,
   text:`Your proposal “${proposal.title}” is open until ${longDate(proposal.expiresOn)}. You can review it and respond under Proposals in this project.`});}
  for(const row of db.prepare('SELECT data FROM project_agreements WHERE studio_id=? AND project_id=?').all(studioId,p.id)){
   const agreement=JSON.parse(row.data);if(agreement.status!=='Issued'||!agreement.expiresOn)continue;
   const until=dayNumber(agreement.expiresOn)-t;if(until>=0&&until<=settings.contractBeforeExpiryDays)items.push({key:`contract-expiry:${agreement.id}`,kind:'Contract waiting',audience:'client',project:p,summary:`Agreement open until ${longDate(agreement.expiresOn)}`,
    text:`The agreement “${agreement.title}” is waiting for your response and is open until ${longDate(agreement.expiresOn)}. You can read and respond to it under Contract in this project.`});
  }
  const design=(p.designs||[]).filter(item=>item.status==='Awaiting approval').at(-1);
  if(design&&design.briefRevision===p.briefRevision&&settings.approvalAfterDays>0&&t-dayNumber(design.sharedAt||design.at)>=settings.approvalAfterDays)items.push({key:`approval:${design.id}`,kind:'Review waiting',audience:'client',project:p,summary:`${design.title} awaiting review`,
   text:`“${design.title}” (version ${String(design.version).padStart(2,'0')}) is ready for your review whenever you have a moment. Your approval or comments help us keep things moving.`});
  const plan=settings.planStepTasks?getPlan(db,studioId,p.id):null;
  for(const step of plan?.steps||[])if(!step.invoiceId&&dayNumber(step.dueDate)<=t)items.push({key:`plan-step:${step.id}`,kind:'Payment to invoice',audience:'studio',project:p,summary:`Issue the ${step.label.toLowerCase()} invoice (${money(step.amountMinor,plan.currency)})`,step,plan});
 }
 return items;
}

function hasPortalClient(db,studioId,projectId){return !!db.prepare('SELECT 1 FROM crm_project_stakeholders WHERE studio_id=? AND project_id=? AND portal_access=1').get(studioId,projectId);}

export function upcomingReminders(db,studioId,today=now().slice(0,10)){
 const settings=reminderSettings(db,studioId),sent=new Set(db.prepare('SELECT key FROM reminder_log WHERE studio_id=?').all(studioId).map(row=>row.key));
 const result=[];
 for(let offset=0;offset<14;offset++){
  const day=new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  for(const item of dueReminders(db,studioId,day,settings))if(!sent.has(item.key)&&!result.some(other=>other.key===item.key))result.push({key:item.key,on:day,kind:item.kind,audience:item.audience,projectId:item.project.id,projectTitle:item.project.title,summary:item.summary,deliverable:item.audience==='studio'||hasPortalClient(db,studioId,item.project.id)});
 }
 return result;
}

export function recentReminders(db,studioId){return db.prepare('SELECT * FROM reminder_log WHERE studio_id=? ORDER BY sent_at DESC LIMIT 30').all(studioId).map(row=>({key:row.key,kind:row.kind,audience:row.audience,projectId:row.project_id,summary:row.summary,sentAt:row.sent_at}));}

export function runReminders(db,{studioId,today=now().slice(0,10),outbox=null}){
 const settings=reminderSettings(db,studioId);if(!settings.enabled)return [];
 const owner=db.prepare("SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.studio_id=? AND m.role='owner' ORDER BY u.rowid LIMIT 1").get(studioId);if(!owner)return [];
 const sent=[];
 for(const item of dueReminders(db,studioId,today,settings)){
  if(db.prepare('SELECT 1 FROM reminder_log WHERE studio_id=? AND key=?').get(studioId,item.key))continue;
  if(item.audience==='client'&&!hasPortalClient(db,studioId,item.project.id))continue;
  let messageId=null;
  transaction(db,()=>{
   if(item.audience==='client'){
    const conversation=materializeProjectConversation(db,item.project);
    messageId=appendConversationMessage(db,conversation,owner,'owner',item.text);
   }else{
    const clientId=projectClientId(db,studioId,item.project.id);
    if(clientId)db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
     .run(id(),studioId,clientId,null,`${item.summary} · ${item.project.title}`,`Scheduled in the payment plan for ${item.step.dueDate}. Open Billing on the project to issue it.`,item.step.dueDate,'High',now(),'Caleane reminders');
   }
   db.prepare('INSERT INTO reminder_log VALUES(?,?,?,?,?,?,?)').run(studioId,item.key,item.project.id,item.kind,item.audience,item.summary,now());
  });
  if(messageId&&outbox){try{outbox.enqueueProjectActivity({studioId,projectId:item.project.id,actorUserId:owner.id,eventId:messageId});}catch{/* In-app delivery has already happened. */}}
  sent.push({key:item.key,kind:item.kind,audience:item.audience,projectId:item.project.id,summary:item.summary});
 }
 return sent;
}

export function runAllReminders(db,{outbox=null,today}={}){
 installReminders(db);const results=[];
 for(const studio of db.prepare('SELECT id FROM studios').all()){
  // Late fees follow their own billing setting, which is off unless the studio turns it on.
  try{applyLateFees(db,{studioId:studio.id,today});}catch(error){console.error('Late fee run failed for a studio:',error.message);}
  try{results.push(...runReminders(db,{studioId:studio.id,today,outbox}));}catch(error){console.error('Reminder run failed for a studio:',error.message);}
 }
 return results;
}

export async function handleReminders({db,req,route,body,studio,owner,reply,outbox}){
 if(route!=='/api/reminders')return false;
 if(!owner)fail(403,'Only the studio owner can manage reminders.');
 installReminders(db);
 const view=extra=>({settings:reminderSettings(db,studio.id),upcoming:upcomingReminders(db,studio.id),recent:recentReminders(db,studio.id),emailQueued:!!outbox,...extra});
 if(req.method==='GET')return reply(200,view()),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(body.action==='save'){saveReminderSettings(db,studio.id,body.settings||{});return reply(200,view()),true;}
 if(body.action==='run'){applyLateFees(db,{studioId:studio.id});const sent=runReminders(db,{studioId:studio.id,outbox});return reply(200,view({sent})),true;}
 fail(400,'Choose a reminder action.');
}
