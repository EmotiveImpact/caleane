import {id,now,event,transaction} from './store.mjs';
import {projectAccess} from './relationships.mjs';
import {DEFAULT_WORKFLOW,isWorkflowId} from './src/lib/workflows.js';

// A date hold is a studio planning record. It does not reserve a venue or a supplier.
// Production release records the studio's decision to begin work against an accepted
// scope and an owner-recorded deposit (or an explicit no-deposit decision).
export const MILESTONE_TEMPLATES={
 'event-styling':['Brief and site details','Creative direction','Production preparation','Installation','Collection and handover'],
 'event-planning':['Event scope and priorities','Venue and supplier plan','Running order','Final confirmations','Event delivery'],
 'wedding-planning':['Planning priorities','Venue and supplier plan','Guest and design details','Final wedding schedule','Wedding day coordination'],
 'floral-design':['Floral brief and palette','Seasonal sourcing','Arrangement recipe and quantities','Flower preparation','Delivery and installation'],
 'balloon-styling':['Site dimensions and access','Colour and form direction','Materials preparation','Installation','Collection and handover'],
 'interior-design':['Site survey and measurements','Concept direction','Specifications and sourcing','Installation plan','Space handover'],
 'creative-studio':['Discovery and brief','Concept direction','Production','Review and refinements','Final assets delivered'],
 'bespoke-making':['Specification','Materials and finish','Making','Quality review','Collection or delivery']
};

function fail(status,message){throw Object.assign(new Error(message),{status});}
function text(value,max,label,required=false){
 if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);
 const result=value.trim();if(required&&!result)fail(400,`Add ${label}.`);return result;
}
function day(value,label,required=false){
 const result=text(value??'',10,label,required);
 if(result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result))fail(400,`Enter a valid ${label}.`);
 return result;
}
function stateFor(project){
 const saved=project.operations||{};
 return {revision:Number.isInteger(saved.revision)?saved.revision:0,holds:Array.isArray(saved.holds)?saved.holds:[],milestones:Array.isArray(saved.milestones)?saved.milestones:[],templateSeededAt:saved.templateSeededAt||null,templateId:saved.templateId||null};
}
function memberAndProject(db,studioId,projectId,userId){
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);
 if(!row)fail(404,'Project not found.');
 const member=db.prepare('SELECT u.name,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.studio_id=?').get(userId,studioId);
 if(!member)fail(403,'You do not have access to this studio.');
 const accessRole=member.role==='owner'?'Owner':projectAccess(db,studioId,projectId,userId);
 if(!accessRole)fail(404,'Project not found.');
 return {row,project:JSON.parse(row.data),actor:{name:member.name,id:userId},accessRole};
}
function currentScope(project){
 const proposal=project.proposals?.at(-1);
 return proposal?.status==='Scope accepted'&&proposal.briefRevision===project.briefRevision?proposal:null;
}
function depositInvoices(db,project,proposal){
 if(!proposal)return [];
 const estimateId=proposal.estimate?.id;
 return db.prepare("SELECT id,estimate_id,currency,amount_minor,cancelled_at FROM invoices WHERE studio_id=? AND project_id=? AND kind='Deposit' ORDER BY issued_at,id").all(project.studioId,project.id)
  .filter(invoice=>!invoice.cancelled_at)
  .map(invoice=>{const payments=db.prepare('SELECT amount_minor,source FROM invoice_payments WHERE studio_id=? AND invoice_id=?').all(project.studioId,invoice.id);return {...invoice,forAcceptedEstimate:invoice.estimate_id===estimateId,paidMinor:payments.reduce((sum,payment)=>sum+payment.amount_minor,0),paymentSources:[...new Set(payments.map(payment=>payment.source))]};});
}
function dateConflicts(db,project,hold,asOf){
 if(!hold||!['Held','Confirmed'].includes(hold.status))return [];
 const matches=[];
 for(const row of db.prepare('SELECT data FROM projects WHERE studio_id=? AND id<>?').all(project.studioId,project.id)){
  const other=JSON.parse(row.data),otherHold=stateFor(other).holds.at(-1);
  if(!otherHold||!['Held','Confirmed'].includes(otherHold.status)||otherHold.status==='Held'&&otherHold.holdUntil<asOf)continue;
  if(hold.startDate<=(otherHold.endDate||otherHold.startDate)&&otherHold.startDate<=(hold.endDate||hold.startDate))matches.push({projectId:other.id,title:other.title,startDate:otherHold.startDate,endDate:otherHold.endDate,status:otherHold.status});
 }
 return matches;
}
function readiness(db,project,state,asOf){
 const hold=state.holds.at(-1)||null,proposal=currentScope(project),invoices=depositInvoices(db,project,proposal);
 const matched=invoices.find(invoice=>invoice.forAcceptedEstimate)||null;
 const deposit=matched?{status:matched.paidMinor>=matched.amount_minor?'Paid':matched.paidMinor>0?'Partially paid':'Unpaid',invoiceId:matched.id,currency:matched.currency,amountMinor:matched.amount_minor,paidMinor:matched.paidMinor}:invoices.length?{status:'Different scope'}:{status:hold?.status==='Confirmed'&&hold.productionRelease?.depositPolicy==='not_required'?'Not required':'No deposit invoice'};
 const blockers=[];
 if(!hold||hold.status==='Released')blockers.push('Place a date hold.');
 else if(hold.status==='Held'&&hold.holdUntil<asOf)blockers.push('The date hold expired.');
 if(!proposal)blockers.push('The current proposal needs client acceptance.');
 if(invoices.some(invoice=>!invoice.forAcceptedEstimate))blockers.push('Review the deposit invoice for the earlier scope.');
 if(matched&&matched.paidMinor<matched.amount_minor)blockers.push('Record the full deposit before releasing work.');
 const release=hold?.productionRelease||null;
 const releaseValid=hold?.status==='Confirmed'&&release&&proposal?.id===release.proposalId&&project.briefRevision===release.briefRevision&&
  (release.depositPolicy==='not_required'?!invoices.length:matched?.id===release.depositInvoiceId&&matched.paidMinor>=matched.amount_minor);
 const eligible=hold?.status==='Held'&&hold.holdUntil>=asOf&&!!proposal&&!invoices.some(invoice=>!invoice.forAcceptedEstimate);
 return {hold,scopeAccepted:!!proposal,proposalId:proposal?.id||null,deposit,blockers,
  canConfirmWithPayment:!!(eligible&&matched&&invoices.every(invoice=>invoice.paidMinor>=invoice.amount_minor)),canConfirmWithoutDeposit:!!(eligible&&!invoices.length),
  productionStatus:hold?.status==='Confirmed'?(releaseValid?'Ready to begin':'Needs review'):hold?.status==='Released'?'Date released':hold?.status==='Held'?(hold.holdUntil<asOf?'Hold expired':'Tentative hold'):'No date hold'};
}
function view(db,project,accessRole,asOf){
 const state=stateFor(project),owner=accessRole==='Owner';
 const booking=readiness(db,project,state,asOf);
 booking.conflicts=owner?dateConflicts(db,project,booking.hold,asOf):[];
 const publicHold=hold=>hold?{id:hold.id,startDate:hold.startDate,endDate:hold.endDate,holdUntil:hold.holdUntil,location:hold.location,status:hold.status,confirmedAt:hold.confirmedAt||null,releasedAt:hold.releasedAt||null}:null;
 if(!owner){booking.hold=publicHold(booking.hold);if(accessRole!=='Approver'){booking.deposit={status:'Private'};booking.blockers=[];}}
 return {revision:state.revision,booking,holds:owner?state.holds:state.holds.map(publicHold),
  milestones:state.milestones.filter(m=>owner||m.visibleToClient&&!m.archivedAt).map(m=>owner?m:{id:m.id,title:m.title,detail:m.detail,dueDate:m.dueDate,status:m.status,order:m.order}),
  templateId:state.templateId,templateSeededAt:state.templateSeededAt};
}

export function getProjectOperations(db,{studioId,projectId,userId,asOf=new Date().toISOString().slice(0,10)}){
 const {project,accessRole}=memberAndProject(db,studioId,projectId,userId);
 return view(db,project,accessRole,asOf);
}

export function changeProjectOperations(db,{studioId,projectId,userId,action,body,asOf=new Date().toISOString().slice(0,10)}){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Check the operation details.');
 return transaction(db,()=>{
  const {row,project,actor,accessRole}=memberAndProject(db,studioId,projectId,userId);
  if(accessRole!=='Owner')fail(403,'Only the studio can change dates and delivery steps.');
  const state=stateFor(project);
  if(!Number.isInteger(body.revision)||body.revision!==state.revision)fail(409,'The project operations changed. Refresh before saving.');
  const stamp=now(),current=state.holds.at(-1),milestone=state.milestones.find(m=>m.id===body.milestoneId);
  if(action==='place-hold'){
   if(current?.status==='Confirmed')fail(409,'Release the confirmed date before placing another hold.');
   const startDate=day(body.startDate,'start date',true),endDate=day(body.endDate||body.startDate,'end date',true),holdUntil=day(body.holdUntil,'hold expiry',true);
   if(startDate<asOf||endDate<startDate||holdUntil<asOf||holdUntil>startDate)fail(400,'Check the held dates and expiry.');
   const location=text(body.location||'',300,'location'),note=text(body.note||'',1000,'hold note');
   if(current?.status==='Held'){current.status='Released';current.releasedAt=stamp;current.releasedBy=actor.name;current.releaseReason='Replaced by a new date hold';}
   state.holds.push({id:id(),startDate,endDate,holdUntil,location,note,status:'Held',createdAt:stamp,createdBy:actor.name});
   event(project,actor,'Placed a tentative date hold');
  }else if(action==='confirm-booking'){
   if(!current||current.id!==body.holdId||current.status!=='Held'||current.holdUntil<asOf)fail(409,'Place a current date hold before confirming this booking.');
   const proposal=currentScope(project);if(!proposal||proposal.id!==body.proposalId)fail(409,'The latest scope needs client acceptance before work is released.');
   if(!['paid','not_required'].includes(body.depositPolicy))fail(400,'Choose how the deposit requirement was met.');
   const invoices=depositInvoices(db,project,proposal);
   if(invoices.some(invoice=>!invoice.forAcceptedEstimate))fail(409,'Review the deposit invoice for the earlier scope.');
   const conflicts=dateConflicts(db,project,current,asOf),overlapNote=conflicts.length?text(body.overlapNote||'',1000,'how the overlapping dates will be handled',true):'';
   let depositInvoiceId=null,noDepositReason=null,paymentEvidence=null;
   if(body.depositPolicy==='paid'){
    const paid=invoices.find(invoice=>invoice.forAcceptedEstimate&&invoice.paidMinor>=invoice.amount_minor);
    if(!paid||invoices.some(invoice=>invoice.paidMinor<invoice.amount_minor))fail(409,'Record the full deposit before releasing work.');
    depositInvoiceId=paid.id;
    paymentEvidence=paid.paymentSources.includes('stripe_verified')?paid.paymentSources.length===1?'Stripe webhook verified':'Stripe verified and owner-recorded payments':'Owner-recorded external payment';
   }else{
    if(invoices.length)fail(409,'A deposit invoice exists. Record payment or resolve it before choosing no deposit.');
    noDepositReason=text(body.noDepositReason||'',1000,'why no deposit is required',true);
   }
   current.status='Confirmed';current.confirmedAt=stamp;current.confirmedBy=actor.name;
   current.productionRelease={proposalId:proposal.id,proposalVersion:proposal.version,briefRevision:project.briefRevision,estimateId:proposal.estimate?.id||null,depositPolicy:body.depositPolicy,...(depositInvoiceId?{depositInvoiceId,paymentEvidence}:{noDepositReason}),...(overlapNote?{overlapNote,overlapProjectIds:conflicts.map(conflict=>conflict.projectId)}:{}),at:stamp,by:actor.name};
   event(project,actor,'Confirmed the date and released work against accepted scope');
  }else if(action==='release-booking'){
   if(!current||current.id!==body.holdId||!['Held','Confirmed'].includes(current.status))fail(409,'This date is no longer active.');
   const reason=text(body.reason||'',1000,'a reason for releasing the date',true);
   current.status='Released';current.releasedAt=stamp;current.releasedBy=actor.name;current.releaseReason=reason;
   event(project,actor,'Released the project date');
  }else if(action==='seed-milestones'){
   if(state.templateSeededAt||state.milestones.length)fail(409,'Delivery steps have already been started for this project.');
   const type=isWorkflowId(project.brief?.workflowType)?project.brief.workflowType:DEFAULT_WORKFLOW;
   state.milestones=MILESTONE_TEMPLATES[type].map((title,index)=>({id:id(),title,detail:'',dueDate:'',status:'Not started',visibleToClient:true,order:(index+1)*10,createdAt:stamp,createdBy:actor.name,changes:[]}));
   state.templateId=type;state.templateSeededAt=stamp;event(project,actor,'Started the '+type+' delivery steps');
  }else if(action==='add-milestone'){
   const title=text(body.title,160,'a delivery step title',true),detail=text(body.detail||'',1000,'delivery step detail'),dueDate=day(body.dueDate||'','delivery step date');
   if(typeof body.visibleToClient!=='boolean')fail(400,'Choose whether this step is shared with the client.');
   const order=(state.milestones.at(-1)?.order||0)+10;
   state.milestones.push({id:id(),title,detail,dueDate,status:'Not started',visibleToClient:body.visibleToClient,order,createdAt:stamp,createdBy:actor.name,changes:[]});
   event(project,actor,'Added a delivery step: '+title);
  }else if(action==='update-milestone'){
   if(!milestone||milestone.archivedAt)fail(404,'Delivery step not found.');
   const title=text(body.title,160,'a delivery step title',true),detail=text(body.detail||'',1000,'delivery step detail'),dueDate=day(body.dueDate||'','delivery step date');
   if(!['Not started','In progress','Complete'].includes(body.status)||typeof body.visibleToClient!=='boolean')fail(400,'Choose a valid step status and visibility.');
   const changeNote=text(body.changeNote||'',1000,'change note');
   if(milestone.status==='Complete'&&body.status!=='Complete'&&!changeNote)fail(400,'Explain why a completed step is reopening.');
   const previous={title:milestone.title,detail:milestone.detail,dueDate:milestone.dueDate,status:milestone.status,visibleToClient:milestone.visibleToClient};
   Object.assign(milestone,{title,detail,dueDate,status:body.status,visibleToClient:body.visibleToClient,updatedAt:stamp,updatedBy:actor.name});
   milestone.changes.push({at:stamp,by:actor.name,previous,note:changeNote});
   event(project,actor,'Updated a delivery step: '+title);
  }else if(action==='archive-milestone'){
   if(!milestone||milestone.archivedAt)fail(404,'Delivery step not found.');
   const reason=text(body.reason||'',1000,'a reason for removing this step',true);
   milestone.archivedAt=stamp;milestone.archivedBy=actor.name;milestone.archiveReason=reason;
   event(project,actor,'Archived a delivery step: '+milestone.title);
  }else fail(404,'Operation not found.');
  state.revision++;
  project.operations=state;
  const saved=db.prepare('UPDATE projects SET data=? WHERE id=? AND studio_id=? AND data=?').run(JSON.stringify(project),projectId,studioId,row.data);
  if(!saved.changes)fail(409,'The project changed while you were editing. Refresh and try again.');
  return {project,operations:view(db,project,accessRole,asOf)};
 });
}
