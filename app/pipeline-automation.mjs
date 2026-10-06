import {id,now,transaction,materializeProjectConversation,appendConversationMessage,saveProject} from './store.mjs';
import {readSetting,writeSetting,currencies,installStudioCommerce,billingDefaults} from './studio-commerce.mjs';
import {installConsultations} from './consultations.mjs';
import {getProjectOperations,changeProjectOperations} from './studio-operations.mjs';
import {createPlan,getPlan,installPaymentPlans} from './payment-plans.mjs';
import {firstOpenedAt} from './document-opens.mjs';

// The pipeline reads what already happened on the linked project (quotes,
// proposals, date holds, deposits, client replies) and keeps each enquiry in
// step with it. Every automatic change is recorded once per trigger, so an
// owner who moves an enquiry back by hand is not overruled on the next run.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const ORDER=['Discovery','Qualified','Proposal','Negotiation','Won'];
const PROBABILITY={Qualified:40,Proposal:50,Negotiation:65,Won:100};
const DAY=86400000;
const dayNumber=value=>Math.floor(Date.parse(value.slice(0,10)+'T12:00:00Z')/DAY);
const addDays=(value,days)=>new Date(Date.parse(value.slice(0,10)+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);
const isDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const longDate=value=>new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const shortDay=value=>new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});

export const defaultFollowUpMessages=[
 'Hi {client_first_name},\n\nJust checking in on your proposal for {project_title}. If anything is unclear or you would like to adjust the scope, reply here and we can talk it through.\n\n{studio_name}',
 'Hi {client_first_name},\n\nA quick note that your proposal for {project_title} is open until {expires_on}. We are keeping your date pencilled in while you decide.\n\n{studio_name}',
 'Hi {client_first_name},\n\nYour proposal for {project_title} closes on {expires_on}. If you would like to go ahead, you can accept it in your project space. If the timing is not right, just let us know.\n\n{studio_name}'
];
export const defaultPipelineSettings={autoStages:true,holdOnProposal:true,planOnAccept:true,confirmOnDeposit:true,
 followUps:false,followUpDays:[3,7,12],followUpMessages:defaultFollowUpMessages,
 dailyCapacity:1,minimumSpend:0,minimumCurrency:'GBP',serviceAreas:'',silentDays:7,
 prepBeforeConsultation:false,closeSilent:false,closeSilentDays:21,
 nudgeOpened:false,nudgeOpenedDays:2};

export function installPipeline(db){installStudioCommerce(db);installConsultations(db);installPaymentPlans(db);db.exec('CREATE TABLE IF NOT EXISTS crm_pipeline_triggers(studio_id TEXT NOT NULL REFERENCES studios(id),key TEXT NOT NULL,opportunity_id TEXT,detail TEXT NOT NULL DEFAULT \'\',at TEXT NOT NULL,PRIMARY KEY(studio_id,key));');}

export function pipelineSettings(db,studioId){
 const saved=readSetting(db,studioId,'pipeline',{});
 return {...structuredClone(defaultPipelineSettings),...saved};
}
export function savePipelineSettings(db,studioId,input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Check the automation settings.');
 const current=pipelineSettings(db,studioId),result={...current};
 for(const key of ['autoStages','holdOnProposal','planOnAccept','confirmOnDeposit','followUps','prepBeforeConsultation','closeSilent','nudgeOpened'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')fail(400,'Switch each automation on or off.');result[key]=input[key];}
 for(const [key,min,max,message] of [['dailyCapacity',1,20,'Events a day must be between 1 and 20.'],['minimumSpend',0,10000000,'Enter a minimum spend between zero and ten million.'],['silentDays',1,60,'Quiet days must be between 1 and 60.'],['closeSilentDays',7,120,'Days before closing a silent enquiry must be between 7 and 120.'],['nudgeOpenedDays',1,30,'Days after opening must be between 1 and 30.']])
  if(input[key]!==undefined){if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)fail(400,message);result[key]=input[key];}
 if(input.minimumCurrency!==undefined){if(!currencies.includes(input.minimumCurrency))fail(400,'Choose a supported currency.');result.minimumCurrency=input.minimumCurrency;}
 if(input.serviceAreas!==undefined){if(typeof input.serviceAreas!=='string'||input.serviceAreas.length>500)fail(400,'Keep service areas under 500 characters.');result.serviceAreas=input.serviceAreas.trim();}
 if(input.followUpDays!==undefined){
  const days=input.followUpDays;
  if(!Array.isArray(days)||days.length<1||days.length>3||days.some(d=>!Number.isInteger(d)||d<1||d>60)||days.some((d,i)=>i&&d<=days[i-1]))fail(400,'Follow-ups need one to three increasing days between 1 and 60.');
  result.followUpDays=days;
 }
 if(input.followUpMessages!==undefined){
  const messages=input.followUpMessages;
  if(!Array.isArray(messages)||messages.length!==3||messages.some(m=>typeof m!=='string'||!m.trim()||m.length>3000))fail(400,'Each follow-up message needs some text, up to 3,000 characters.');
  result.followUpMessages=messages.map(m=>m.trim());
 }
 return writeSetting(db,studioId,'pipeline',result);
}

// "£5,000 to £7,500", "5k", "around 6000" → the highest figure, in minor units.
export function budgetMinor(text){
 if(typeof text!=='string')return null;
 const values=[...text.replace(/,(?=\d{3})/g,'').matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/gi)].map(m=>Number(m[1])*(m[2]?1000:1)).filter(n=>Number.isFinite(n)&&n>0);
 return values.length?Math.round(Math.max(...values)*100):null;
}
export function areaTerms(text){return (text||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(Boolean);}

function ownerOf(db,studioId){return db.prepare("SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.studio_id=? AND m.role='owner' ORDER BY u.rowid LIMIT 1").get(studioId);}
function projectOf(db,studioId,projectId){const row=projectId&&db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);return row?JSON.parse(row.data):null;}
function fired(db,studioId,key){return !!db.prepare('SELECT 1 FROM crm_pipeline_triggers WHERE studio_id=? AND key=?').get(studioId,key);}
function mark(db,studioId,key,opportunityId,detail=''){db.prepare('INSERT OR IGNORE INTO crm_pipeline_triggers VALUES(?,?,?,?,?)').run(studioId,key,opportunityId,detail,now());}
function activity(db,studioId,opp,owner,title,detail=''){
 db.prepare('INSERT INTO crm_activities (id,studio_id,client_id,opportunity_id,kind,title,detail,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(id(),studioId,opp.client_id,opp.id,'System',title,detail,owner?.id||null,'Caleane automation',now());
}
function currentEstimate(p){const e=p.estimates?.at(-1);return e&&e.briefRevision===p.briefRevision&&e.status!=='Superseded'?e:null;}
function currentProposal(p){const q=p.proposals?.at(-1);return q&&q.briefRevision===p.briefRevision&&!['Superseded','Withdrawn'].includes(q.status)?q:null;}
function lastClientMessage(db,projectId){return db.prepare("SELECT MAX(m.created_at) AS at FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=? AND m.role='client'").get(projectId)?.at||null;}
function currentAgreement(db,studioId,projectId){const row=db.prepare('SELECT data FROM project_agreements WHERE studio_id=? AND project_id=? ORDER BY version DESC LIMIT 1').get(studioId,projectId);return row?JSON.parse(row.data):null;}
// A client who opened a proposal or contract days ago and has not answered or written since: a task for the owner to check in by hand.
function nudgeOpened(db,{studioId,opp,owner,p,item,kind,asOf,days}){
 const key=`opened-nudge:${item.id}`;if(fired(db,studioId,key))return false;
 const opened=firstOpenedAt(db,studioId,kind,item.id);if(!opened||dayNumber(asOf)-dayNumber(opened)<days)return false;
 const replied=lastClientMessage(db,p.id);if(replied&&replied>=opened)return false;
 transaction(db,()=>{
  mark(db,studioId,key,opp.id);
  const client=db.prepare('SELECT name FROM clients WHERE id=? AND studio_id=?').get(opp.client_id,studioId)?.name||'the client',what=kind==='contract'?'contract':'proposal';
  db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
   .run(id(),studioId,opp.client_id,opp.id,`Check in with ${client} about the ${what}`,`They opened “${item.title}” on ${longDate(opened)} but have not replied or answered it yet. A short personal note usually helps.`,asOf,'Normal',now(),'Caleane automation');
  activity(db,studioId,opp,owner,`Check-in task added for the opened ${what}`,`Automatic: opened ${longDate(opened)}, no reply since.`);
 });
 return true;
}
function hasPortalClient(db,studioId,projectId){return !!db.prepare('SELECT 1 FROM crm_project_stakeholders WHERE studio_id=? AND project_id=? AND portal_access=1').get(studioId,projectId);}

// Move forward only, once per trigger. Returns true when the stage changed.
function advance(db,{studioId,opp,owner,to,key,reason}){
 if(fired(db,studioId,key))return false;
 mark(db,studioId,key,opp.id,reason);
 if(['Won','Lost'].includes(opp.stage)||ORDER.indexOf(opp.stage)>=ORDER.indexOf(to))return false;
 const probability=to==='Won'?100:Math.max(opp.probability,PROBABILITY[to]||opp.probability),at=now();
 db.prepare('UPDATE crm_opportunities SET stage=?,probability=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=?').run(to,probability,at,opp.id,studioId);
 activity(db,studioId,opp,owner,`Moved from ${opp.stage} to ${to}`,'Automatic: '+reason);
 opp.stage=to;opp.probability=probability;opp.revision++;
 return true;
}
function syncValue(db,{studioId,opp,owner,estimate}){
 const key='value:'+estimate.id;if(fired(db,studioId,key))return;mark(db,studioId,key,opp.id);
 if(opp.amount_minor===estimate.total&&opp.currency===estimate.currency)return;
 db.prepare('UPDATE crm_opportunities SET amount_minor=?,currency=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=?').run(estimate.total,estimate.currency,now(),opp.id,studioId);
 activity(db,studioId,opp,owner,'Value updated from the quote',`Estimate version ${estimate.version}`);
 opp.amount_minor=estimate.total;opp.currency=estimate.currency;opp.revision++;
}

function fill(template,values){return template.replace(/\{(\w+)\}/g,(match,key)=>values[key]??match);}

function nextFollowUpIndex(db,studioId,proposal,settings){return settings.followUpDays.findIndex((d,i)=>!fired(db,studioId,`follow:${proposal.id}:${i}`));}
function sendFollowUp(db,{studioId,opp,p,proposal,owner,studio,settings,index,outbox,reason}){
 const text=fill(settings.followUpMessages[index]||defaultFollowUpMessages[index],{client_first_name:(p.brief?.name||'there').split(' ')[0],client_name:p.brief?.name||'',project_title:p.title,proposal_title:proposal.title,expires_on:longDate(proposal.expiresOn),project_date:p.brief?.date?longDate(p.brief.date):'',studio_name:studio?.name||''});
 let messageId=null;
 transaction(db,()=>{
  messageId=appendConversationMessage(db,materializeProjectConversation(db,p),owner,'owner',text);
  mark(db,studioId,`follow:${proposal.id}:${index}`,opp.id,messageId);
  activity(db,studioId,opp,owner,`Follow-up ${index+1} sent`,reason);
 });
 if(messageId&&outbox){try{outbox.enqueueMessage({studioId,conversationId:materializeProjectConversation(db,p).id,messageId,actorUserId:owner.id});}catch{/* The message is already in the project conversation. */}}
 return messageId;
}

// The owner sends the next follow-up early, or pauses and resumes the sequence for one proposal.
export function followUpAction(db,studioId,{opportunityId,action,outbox=null}){
 installPipeline(db);
 const owner=ownerOf(db,studioId),settings=pipelineSettings(db,studioId),studio=db.prepare('SELECT name FROM studios WHERE id=?').get(studioId);
 const opp=db.prepare('SELECT * FROM crm_opportunities WHERE id=? AND studio_id=?').get(opportunityId,studioId);if(!opp)fail(404,'Enquiry not found.');
 const p=projectOf(db,studioId,opp.project_id),proposal=p&&currentProposal(p);
 if(!proposal||proposal.status!=='Awaiting response')fail(409,'Follow-ups only run while a proposal is waiting for a reply.');
 if(action==='pause'){if(!fired(db,studioId,'pause:'+proposal.id))transaction(db,()=>{mark(db,studioId,'pause:'+proposal.id,opp.id);activity(db,studioId,opp,owner,'Follow-ups paused');});return;}
 if(action==='resume'){transaction(db,()=>{db.prepare('DELETE FROM crm_pipeline_triggers WHERE studio_id=? AND key=?').run(studioId,'pause:'+proposal.id);activity(db,studioId,opp,owner,'Follow-ups resumed');});return;}
 if(action!=='send')fail(400,'Choose a follow-up action.');
 if(!hasPortalClient(db,studioId,p.id))fail(409,'Invite the client to their project space before sending follow-ups.');
 const index=nextFollowUpIndex(db,studioId,proposal,settings);if(index<0)fail(409,'Every follow-up for this proposal has been sent.');
 sendFollowUp(db,{studioId,opp,p,proposal,owner,studio,settings,index,outbox,reason:'Sent early by the studio.'});
}

export function syncPipeline(db,studioId,{asOf=now().slice(0,10),outbox=null}={}){
 installPipeline(db);
 const settings=pipelineSettings(db,studioId),owner=ownerOf(db,studioId),log=[];
 if(!owner)return log;
 const studio=db.prepare('SELECT name FROM studios WHERE id=?').get(studioId);
 const opps=db.prepare("SELECT * FROM crm_opportunities WHERE studio_id=? AND stage NOT IN ('Won','Lost') ORDER BY created_at").all(studioId);
 for(const opp of opps){
  try{
   if(settings.autoStages){
    const booked=db.prepare("SELECT id FROM consultations WHERE studio_id=? AND status IN ('Booked','Completed') AND json_extract(data,'$.clientId')=? AND created_at>=? ORDER BY created_at LIMIT 1").get(studioId,opp.client_id,opp.created_at.slice(0,10));
    if(booked&&transaction(db,()=>advance(db,{studioId,opp,owner,to:'Qualified',key:`consultation:${booked.id}:${opp.id}`,reason:'the client booked a consultation'})))log.push({opportunityId:opp.id,action:'Qualified'});
   }
   if(settings.prepBeforeConsultation){
    const next=db.prepare("SELECT id,start_at FROM consultations WHERE studio_id=? AND status='Booked' AND json_extract(data,'$.clientId')=? AND start_at>=? ORDER BY start_at LIMIT 1").get(studioId,opp.client_id,asOf);
    if(next&&!fired(db,studioId,`prep:${next.id}:${opp.id}`))transaction(db,()=>{
     mark(db,studioId,`prep:${next.id}:${opp.id}`,opp.id);
     const client=db.prepare('SELECT name FROM clients WHERE id=? AND studio_id=?').get(opp.client_id,studioId)?.name||'the client',due=[addDays(next.start_at,-1),asOf].sort().at(-1);
     db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
      .run(id(),studioId,opp.client_id,opp.id,`Prepare for the consultation with ${client}`,`Read their brief and gather examples before the call on ${longDate(next.start_at)}.`,due,'Normal',now(),'Caleane automation');
     activity(db,studioId,opp,owner,'Consultation prep task added',`Automatic: due ${longDate(due)}.`);
     log.push({opportunityId:opp.id,action:'Prep'});
    });
   }
   const p=projectOf(db,studioId,opp.project_id);if(!p)continue;
   const estimate=currentEstimate(p),proposal=currentProposal(p);
   if(estimate)transaction(db,()=>syncValue(db,{studioId,opp,owner,estimate}));
   if(settings.autoStages&&estimate&&['Awaiting review','Budget confirmed'].includes(estimate.status)&&transaction(db,()=>advance(db,{studioId,opp,owner,to:'Negotiation',key:'estimate:'+estimate.id,reason:'a quote was shared with the client'})))log.push({opportunityId:opp.id,action:'Negotiation'});
   if(settings.autoStages&&proposal&&transaction(db,()=>advance(db,{studioId,opp,owner,to:'Negotiation',key:'proposal:'+proposal.id,reason:'a proposal was shared with the client'})))log.push({opportunityId:opp.id,action:'Negotiation'});

   let ops=getProjectOperations(db,{studioId,projectId:p.id,userId:owner.id,asOf});
   const hold=ops.booking.hold,activeHold=hold&&(hold.status==='Confirmed'||hold.status==='Held'&&hold.holdUntil>=asOf);
   // Hold the client's date while the proposal is out.
   const date=p.brief?.date;
   if(settings.holdOnProposal&&proposal?.status==='Awaiting response'&&!activeHold&&isDay(date)&&date>=asOf&&!fired(db,studioId,'hold:'+proposal.id)){
    const holdUntil=[proposal.expiresOn,date].filter(isDay).sort()[0];
    try{
     ops=changeProjectOperations(db,{studioId,projectId:p.id,userId:owner.id,action:'place-hold',asOf,body:{revision:ops.revision,startDate:date,endDate:date,holdUntil:holdUntil>=asOf?holdUntil:asOf,location:p.brief?.venue||'',note:'Held automatically while the proposal is out.'}}).operations;
     transaction(db,()=>{mark(db,studioId,'hold:'+proposal.id,opp.id);activity(db,studioId,opp,owner,`Date held until ${longDate(ops.booking.hold.holdUntil)}`,'Automatic: the proposal was shared');});
     log.push({opportunityId:opp.id,action:'Hold'});
    }catch(error){transaction(db,()=>mark(db,studioId,'hold:'+proposal.id,opp.id,'Not held: '+error.message));}
   }
   // Accepted scope: the accepted proposal confirms the quoted investment, and the payment plan follows.
   if(settings.planOnAccept&&proposal?.status==='Scope accepted'&&!fired(db,studioId,'accepted:'+proposal.id)){
    transaction(db,()=>{
     mark(db,studioId,'accepted:'+proposal.id,opp.id);
     const fresh=projectOf(db,studioId,p.id),latest=currentEstimate(fresh);
     if(latest&&latest.status==='Awaiting review'&&latest.id===proposal.estimate?.id){
      Object.assign(latest,{status:'Budget confirmed',decidedBy:proposal.decidedBy,decidedAt:proposal.decidedAt,feedback:`Confirmed by accepting proposal version ${proposal.version}.`});
      fresh.activity.unshift({id:id(),actor:'Caleane automation',text:'Confirmed the estimate with the accepted proposal',at:now()});saveProject(db,fresh);
     }
     let planned='';
     try{if(!getPlan(db,studioId,p.id)){createPlan(db,{studioId,project:projectOf(db,studioId,p.id),body:{useDefault:true},today:asOf});planned=' Payment plan created from your default template.';}}catch(error){planned=' '+error.message;}
     const invoiced=db.prepare('SELECT 1 FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').get(studioId,p.id);
     if(!invoiced)db.prepare(`INSERT INTO crm_tasks (id,studio_id,client_id,opportunity_id,title,detail,due_date,priority,completed,created_at,completed_at,created_by) VALUES(?,?,?,?,?,?,?,?,0,?,'',?)`)
      .run(id(),studioId,opp.client_id,opp.id,'Issue the deposit invoice','The proposal was accepted. Open Billing on the project to issue the first payment and confirm the date.',asOf,'High',now(),'Caleane automation');
     activity(db,studioId,opp,owner,'Proposal accepted',(invoiced?'Automatic.':'Automatic: deposit invoice task added.')+planned);
    });
    log.push({opportunityId:opp.id,action:'Accepted'});ops=getProjectOperations(db,{studioId,projectId:p.id,userId:owner.id,asOf});
   }
   // Deposit paid on the accepted scope: confirm the held date and mark the enquiry won.
   const booking=ops.booking;
   if(settings.confirmOnDeposit&&booking.hold?.status==='Held'&&booking.canConfirmWithPayment&&!fired(db,studioId,'confirm:'+booking.hold.id)){
    try{
     ops=changeProjectOperations(db,{studioId,projectId:p.id,userId:owner.id,action:'confirm-booking',asOf,body:{revision:ops.revision,holdId:booking.hold.id,proposalId:booking.proposalId,depositPolicy:'paid',overlapNote:'Confirmed automatically when the deposit was paid. Review the other booking on this date.'}}).operations;
     transaction(db,()=>{mark(db,studioId,'confirm:'+booking.hold.id,opp.id);activity(db,studioId,opp,owner,'Date confirmed','Automatic: the deposit was paid.');});
     log.push({opportunityId:opp.id,action:'Confirmed'});
    }catch(error){transaction(db,()=>mark(db,studioId,'confirm:'+booking.hold.id,opp.id,'Not confirmed: '+error.message));}
   }
   if(settings.autoStages){
    const b=ops.booking;
    if(b.hold?.status==='Confirmed'&&transaction(db,()=>advance(db,{studioId,opp,owner,to:'Won',key:'won:'+b.hold.id,reason:'the date is confirmed'})))log.push({opportunityId:opp.id,action:'Won'});
    else if(b.scopeAccepted&&b.deposit?.status==='Paid'&&transaction(db,()=>advance(db,{studioId,opp,owner,to:'Won',key:'deposit:'+b.deposit.invoiceId,reason:'the deposit was paid'})))log.push({opportunityId:opp.id,action:'Won'});
   }
   // Follow-ups stop the moment the client writes back, the proposal is answered or the owner pauses them.
   if(settings.followUps&&proposal?.status==='Awaiting response'&&proposal.expiresOn>=asOf&&hasPortalClient(db,studioId,p.id)&&!fired(db,studioId,'pause:'+proposal.id)){
    const replied=lastClientMessage(db,p.id);
    if(!replied||replied<proposal.createdAt){
     const index=nextFollowUpIndex(db,studioId,proposal,settings);
     if(index>=0&&dayNumber(asOf)-dayNumber(proposal.createdAt)>=settings.followUpDays[index]){
      sendFollowUp(db,{studioId,opp,p,proposal,owner,studio,settings,index,outbox,reason:'Automatic: no reply since the proposal was shared.'});
      log.push({opportunityId:opp.id,action:'Follow-up'});
     }
    }
   }
   if(settings.nudgeOpened){
    if(proposal?.status==='Awaiting response'&&proposal.expiresOn>=asOf&&nudgeOpened(db,{studioId,opp,owner,p,item:proposal,kind:'proposal',asOf,days:settings.nudgeOpenedDays}))log.push({opportunityId:opp.id,action:'Check in'});
    const contract=currentAgreement(db,studioId,p.id);
    if(contract?.status==='Issued'&&contract.briefRevision===p.briefRevision&&!(contract.expiresOn<asOf)&&nudgeOpened(db,{studioId,opp,owner,p,item:contract,kind:'contract',asOf,days:settings.nudgeOpenedDays}))log.push({opportunityId:opp.id,action:'Check in'});
   }
   // A proposal with no reply for a long time closes, so the pipeline reflects what is really open.
   if(settings.closeSilent&&proposal?.status==='Awaiting response'&&!fired(db,studioId,'close:'+proposal.id)){
    const replied=lastClientMessage(db,p.id),quiet=dayNumber(asOf)-dayNumber(replied&&replied>proposal.createdAt?replied:proposal.createdAt);
    if(!['Won','Lost'].includes(opp.stage)&&(!replied||replied<proposal.createdAt)&&quiet>=settings.closeSilentDays)transaction(db,()=>{
     mark(db,studioId,'close:'+proposal.id,opp.id);
     db.prepare("UPDATE crm_opportunities SET stage='Lost',lost_reason='No response',revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND stage NOT IN ('Won','Lost')").run(now(),opp.id,studioId);
     activity(db,studioId,opp,owner,`Moved from ${opp.stage} to Lost`,`Automatic: no reply for ${quiet} days after the proposal.`);
     opp.stage='Lost';log.push({opportunityId:opp.id,action:'Lost'});
    });
   }
  }catch(error){console.error('Pipeline sync failed for an enquiry:',error.message);}
 }
 return log;
}

export function syncAllPipelines(db,{outbox=null,asOf}={}){
 installPipeline(db);const results=[];
 for(const studio of db.prepare('SELECT id FROM studios').all()){try{results.push(...syncPipeline(db,studio.id,{outbox,asOf}));}catch(error){console.error('Pipeline sync failed for a studio:',error.message);}}
 return results;
}

// What the board, Today, Dates and Insights views read.
export function pipelineOverview(db,studioId,{asOf=now().slice(0,10)}={}){
 installPipeline(db);
 const settings=pipelineSettings(db,studioId),owner=ownerOf(db,studioId),capacity=settings.dailyCapacity,areas=areaTerms(settings.serviceAreas);
 const opps=db.prepare('SELECT o.*,c.name AS client_name FROM crm_opportunities o JOIN clients c ON c.id=o.client_id AND c.studio_id=o.studio_id WHERE o.studio_id=?').all(studioId);
 const projects=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studioId).map(row=>JSON.parse(row.data)).filter(p=>p.status!=='Archived');
 const oppByProject=new Map(opps.filter(o=>o.project_id).map(o=>[o.project_id,o]));
 // Dates: confirmed and live held dates across every project, plus open enquiries asking for a date.
 const days=new Map(),slot=date=>{if(!days.has(date))days.set(date,{date,booked:[],held:[],asking:[]});return days.get(date);};
 const activeHold=new Map();
 for(const p of projects){
  const hold=(p.operations?.holds||[]).at(-1);
  if(hold&&(hold.status==='Confirmed'||hold.status==='Held'&&hold.holdUntil>=asOf)){
   activeHold.set(p.id,hold);
   const end=hold.endDate||hold.startDate,o=oppByProject.get(p.id);
   for(let d=hold.startDate,n=0;d<=end&&n<14;d=addDays(d,1),n++)if(d>=asOf)slot(d)[hold.status==='Confirmed'?'booked':'held'].push({projectId:p.id,opportunityId:o?.id||null,title:o?.client_name||p.brief?.name||p.title,holdUntil:hold.status==='Held'?hold.holdUntil:null});
  }
 }
 const openOpps=opps.filter(o=>!['Won','Lost'].includes(o.stage));
 for(const o of openOpps){
  const p=projects.find(item=>item.id===o.project_id),date=p?.brief?.date;
  if(isDay(date)&&date>=asOf&&!activeHold.has(p.id))slot(date).asking.push({projectId:p.id,opportunityId:o.id,title:o.client_name});
 }
 const dates=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,120).map(d=>({...d,capacity,state:d.booked.length>=capacity?'full':d.booked.length+d.held.length>=capacity?'held':'open'}));
 // Signals per enquiry.
 const signals={};
 for(const o of opps){
  const p=projects.find(item=>item.id===o.project_id)||null,flags=[],fit=[];let alternatives=[];
  const date=p?.brief?.date,estimate=p&&currentEstimate(p),proposal=p&&currentProposal(p);
  let booking=null;
  if(p&&owner){try{booking=getProjectOperations(db,{studioId,projectId:p.id,userId:owner.id,asOf}).booking;}catch{booking=null;}}
  const open=!['Won','Lost'].includes(o.stage);
  if(open&&isDay(date)&&date>=asOf){
   const day=days.get(date),others=day?[...day.booked,...day.held].filter(x=>x.projectId!==p.id).length:0,bookedOthers=day?day.booked.filter(x=>x.projectId!==p.id).length:0;
   const ok=others<capacity;
   fit.push({kind:'date',ok,label:ok?`${shortDay(date)} is available`:`${shortDay(date)} is ${bookedOthers>=capacity?'fully booked':'held for another client'}`});
   if(!ok)flags.push({kind:'clash',tone:'bad',label:bookedOthers>=capacity?'Date full':'Date held',rank:1});
   if(!ok)alternatives=[-7,7,-14,14,-21,21].map(n=>addDays(date,n)).filter(d=>d>asOf&&(days.get(d)?.booked.length||0)+(days.get(d)?.held.length||0)<capacity).slice(0,3).sort();
  }
  const budget=budgetMinor(p?.brief?.budget);
  if(open&&settings.minimumSpend>0&&budget!==null){
   const ok=budget>=settings.minimumSpend*100;
   fit.push({kind:'budget',ok,label:ok?'Budget above your minimum':'Budget under your minimum spend'});
   if(!ok)flags.push({kind:'budget',tone:'warn',label:'Under minimum spend',rank:4});
  }
  if(open&&areas.length&&p?.brief?.venue){
   const venue=p.brief.venue.toLowerCase(),ok=areas.some(term=>venue.includes(term));
   fit.push({kind:'area',ok,label:ok?'Within your service areas':'Outside your service areas'});
   if(!ok)flags.push({kind:'area',tone:'warn',label:'Outside service area',rank:4});
  }
  const hold=booking?.hold&&['Held','Confirmed'].includes(booking.hold.status)?booking.hold:null;
  if(open&&hold?.status==='Held'){
   const left=dayNumber(hold.holdUntil)-dayNumber(asOf);
   if(left<0)flags.push({kind:'hold-expired',tone:'bad',label:'Hold expired',rank:1});
   else if(left<=2)flags.push({kind:'hold-ending',tone:'warn',label:`Hold ends ${shortDay(hold.holdUntil)}`,rank:2});
  }
  const replied=p?lastClientMessage(db,p.id):null;
  if(open&&proposal){
   if(proposal.status==='Awaiting response'){
    const out=dayNumber(asOf)-dayNumber(proposal.createdAt),silent=!replied||replied<proposal.createdAt,left=dayNumber(proposal.expiresOn)-dayNumber(asOf),opened=firstOpenedAt(db,studioId,'proposal',proposal.id);
    if(left<0)flags.push({kind:'proposal-expired',tone:'bad',label:'Proposal expired',rank:1});
    else if(left<=3)flags.push({kind:'proposal-ending',tone:'warn',label:`Proposal closes ${shortDay(proposal.expiresOn)}`,rank:2});
    if(silent&&out>=settings.silentDays)flags.push({kind:'silent',tone:'warn',label:`No reply for ${out} days`,rank:3});
    else flags.push({kind:'waiting',tone:'info',label:out?`Proposal out ${out} day${out===1?'':'s'}`:'Proposal sent today',rank:6});
    if(opened)flags.push({kind:'opened',tone:'info',label:`Opened ${shortDay(opened)}`,rank:5});
    else if(out>=2&&hasPortalClient(db,studioId,p.id))flags.push({kind:'unopened',tone:'warn',label:'Not opened yet',rank:3});
   }else if(proposal.status==='Changes requested')flags.push({kind:'changes',tone:'warn',label:'Changes requested',rank:1});
   else if(proposal.status==='Scope accepted'&&booking?.deposit?.status!=='Paid')flags.push({kind:'deposit',tone:'good',label:'Accepted · deposit due',rank:2});
  }else if(open&&estimate?.status==='Changes requested')flags.push({kind:'changes',tone:'warn',label:'Quote changes requested',rank:1});
  if(open&&fit.length>=2&&fit.every(f=>f.ok)&&['Discovery','Qualified'].includes(o.stage))flags.push({kind:'fit',tone:'good',label:'Strong fit',rank:7});
  const paused=proposal?fired(db,studioId,'pause:'+proposal.id):false;
  const followed=proposal?db.prepare("SELECT COUNT(*) AS n FROM crm_pipeline_triggers WHERE studio_id=? AND key LIKE ?").get(studioId,`follow:${proposal.id}:%`).n:0;
  const nextFollow=settings.followUps&&proposal?.status==='Awaiting response'&&followed<settings.followUpDays.length&&(!replied||replied<proposal.createdAt)?addDays(proposal.createdAt,settings.followUpDays[followed]):null;
  signals[o.id]={opportunityId:o.id,projectId:p?.id||null,eventDate:isDay(date)?date:'',venue:p?.brief?.venue||'',budget:p?.brief?.budget||'',
   estimate:estimate?{id:estimate.id,version:estimate.version,status:estimate.status,total:estimate.total,currency:estimate.currency,items:estimate.items.length}:null,
   proposal:proposal?{id:proposal.id,version:proposal.version,title:proposal.title,status:proposal.status,expiresOn:proposal.expiresOn,sharedAt:proposal.createdAt,openedAt:firstOpenedAt(db,studioId,'proposal',proposal.id)}:null,
   hold:hold?{id:hold.id,status:hold.status,startDate:hold.startDate,holdUntil:hold.holdUntil}:null,
   deposit:booking?.deposit&&!['No deposit invoice','Private'].includes(booking.deposit.status)?booking.deposit:null,
   productionStatus:booking?.productionStatus||null,portalClient:p?hasPortalClient(db,studioId,p.id):false,
   lastClientMessageAt:replied,followUpsSent:followed,nextFollowUp:paused?null:nextFollow,followUpsPaused:paused,alternatives,fit,flags:flags.sort((a,b)=>a.rank-b.rank)};
 }
 return {settings,asOf,dates,signals,planTemplate:billingDefaults(db,studioId).plan,insights:insights(db,studioId,opps,projects,asOf),handled:handledFor(db,studioId,asOf),replySpeed:replySpeed(db,studioId,opps,asOf)};
}

// What the automations did in the last week, for the Today panel.
function handledFor(db,studioId,asOf){
 return db.prepare("SELECT a.title,a.created_at AS at,a.opportunity_id AS opportunityId,c.name AS clientName FROM crm_activities a JOIN clients c ON c.id=a.client_id AND c.studio_id=a.studio_id WHERE a.studio_id=? AND a.actor_name='Caleane automation' AND a.created_at>=? ORDER BY a.created_at DESC LIMIT 8").all(studioId,addDays(asOf,-7));
}

// Median hours from a new enquiry to the studio's first message, over the last 90 days.
function replySpeed(db,studioId,opps,asOf){
 const since=addDays(asOf,-90),first=db.prepare("SELECT MIN(m.created_at) AS at FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=? AND m.role='owner' AND m.created_at>=?");
 const hours=opps.filter(o=>o.project_id&&o.created_at>=since).map(o=>{const at=first.get(o.project_id,o.created_at)?.at;return at?(Date.parse(at)-Date.parse(o.created_at))/36e5:null;}).filter(h=>h!==null).sort((a,b)=>a-b);
 if(!hours.length)return null;
 const mid=Math.floor(hours.length/2);
 return {hours:Math.round((hours.length%2?hours[mid]:(hours[mid-1]+hours[mid])/2)*10)/10,count:hours.length};
}

function insights(db,studioId,opps,projects,asOf){
 const yearAgo=addDays(asOf,-365),closed=opps.filter(o=>['Won','Lost'].includes(o.stage)&&o.updated_at.slice(0,10)>=yearAgo);
 const bySource=new Map();
 for(const o of closed){const key=o.source||'Unspecified',row=bySource.get(key)||{source:key,won:0,lost:0};row[o.stage==='Won'?'won':'lost']++;bySource.set(key,row);}
 const winRate=[...bySource.values()].map(r=>({...r,rate:Math.round(r.won/(r.won+r.lost)*100)})).sort((a,b)=>b.rate-a.rate||b.won-a.won);
 // Value by event month, in the studio's most used currency.
 const tally=new Map();for(const o of opps)if(o.amount_minor)tally.set(o.currency,(tally.get(o.currency)||0)+o.amount_minor);
 const currency=[...tally.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'GBP';
 const months=new Map();
 for(const o of opps){
  if(o.stage==='Lost'||!o.amount_minor||o.currency!==currency)continue;
  const date=projects.find(p=>p.id===o.project_id)?.brief?.date;if(!isDay(date)||date<asOf.slice(0,7)+'-01')continue;
  const key=date.slice(0,7),row=months.get(key)||{month:key,wonMinor:0,openMinor:0};
  if(o.stage==='Won')row.wonMinor+=o.amount_minor;else row.openMinor+=Math.round(o.amount_minor*o.probability/100);
  months.set(key,row);
 }
 const byMonth=[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(0,12);
 // Days spent in each stage, from the recorded stage moves.
 const moves=db.prepare("SELECT opportunity_id,title,created_at FROM crm_activities WHERE studio_id=? AND kind='System' AND title LIKE 'Moved from % to %' ORDER BY created_at").all(studioId);
 const entered=new Map(opps.map(o=>[o.id,{stage:'Discovery',at:o.created_at}])),spent=new Map();
 for(const m of moves){
  const match=m.title.match(/^Moved from (\w+) to (\w+)$/),start=entered.get(m.opportunity_id);if(!match||!start)continue;
  if(start.stage===match[1]){const days=Math.max(0,(Date.parse(m.created_at)-Date.parse(start.at))/DAY),row=spent.get(match[1])||{stage:match[1],total:0,count:0};row.total+=days;row.count++;spent.set(match[1],row);}
  entered.set(m.opportunity_id,{stage:match[2],at:m.created_at});
 }
 const stageDays=['Discovery','Qualified','Proposal','Negotiation'].map(stage=>{const row=spent.get(stage);return {stage,days:row?Math.round(row.total/row.count*10)/10:null,count:row?.count||0};});
 const decided=closed.map(o=>(Date.parse(o.updated_at)-Date.parse(o.created_at))/DAY);
 const lost=new Map();for(const o of closed.filter(o=>o.stage==='Lost')){const key=(o.lost_reason||'No reason recorded').trim();lost.set(key,(lost.get(key)||0)+1);}
 const won=closed.filter(o=>o.stage==='Won').length;
 return {currency,winRate,byMonth,stageDays,lostReasons:[...lost.entries()].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count).slice(0,8),
  overall:{won,lost:closed.length-won,rate:closed.length?Math.round(won/closed.length*100):null,decisionDays:decided.length?Math.round(decided.reduce((a,b)=>a+b,0)/decided.length):null}};
}

export async function handlePipeline({db,req,route,body,studio,owner,reply,outbox}){
 if(route!=='/api/pipeline')return false;
 if(!owner)fail(403,'Only the studio owner can open the pipeline.');
 installPipeline(db);
 if(req.method==='GET'){syncPipeline(db,studio.id,{outbox});return reply(200,pipelineOverview(db,studio.id)),true;}
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(body.action==='save'){savePipelineSettings(db,studio.id,body.settings);syncPipeline(db,studio.id,{outbox});return reply(200,pipelineOverview(db,studio.id)),true;}
 if(body.action==='follow-up'){followUpAction(db,studio.id,{opportunityId:String(body.opportunityId||''),action:body.step,outbox});return reply(200,pipelineOverview(db,studio.id)),true;}
 if(body.action==='run'){const log=syncPipeline(db,studio.id,{outbox});return reply(200,{...pipelineOverview(db,studio.id),log}),true;}
 fail(400,'Choose a pipeline action.');
}
