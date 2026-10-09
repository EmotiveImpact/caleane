import {id,now} from './store.mjs';
import {billingDefaults} from './studio-commerce.mjs';

// A payment plan splits a client-confirmed estimate into scheduled invoices.
// The plan only proposes amounts and dates; each payment still becomes a normal
// issued invoice when the owner chooses to issue it.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,label)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);return value.trim();};
const isDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const addDays=(dayValue,days)=>new Date(Date.parse(dayValue+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

export function installPaymentPlans(db){db.exec('CREATE TABLE IF NOT EXISTS payment_plans(studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),data TEXT NOT NULL,PRIMARY KEY(studio_id,project_id));');}

export function getPlan(db,studioId,projectId){const row=db.prepare('SELECT data FROM payment_plans WHERE studio_id=? AND project_id=?').get(studioId,projectId);return row?JSON.parse(row.data):null;}
function save(db,studioId,projectId,plan){db.prepare('INSERT INTO payment_plans VALUES(?,?,?) ON CONFLICT(studio_id,project_id) DO UPDATE SET data=excluded.data').run(studioId,projectId,JSON.stringify(plan));return plan;}

export function dueDateFor(due,{today,confirmedAt,eventDate}){
 if(due.type==='days_after_confirm')return addDays((confirmedAt||today).slice(0,10),due.days);
 if(due.type==='days_before_event')return isDay(eventDate)?addDays(eventDate,-due.days):'';
 return today;
}
// A payment tied to the event date waits, undated, until the project has one.
export function stepDueDate(step,project){return step.dueDate||(step.due?dueDateFor(step.due,{today:'',eventDate:project?.brief?.date}):'')||'';}

export function confirmedEstimate(project){
 const estimate=project.estimates?.at(-1);
 return estimate?.status==='Budget confirmed'&&estimate.briefRevision===project.briefRevision?estimate:null;
}

// Split the total by percentage; the last payment absorbs rounding.
export function planFromTemplate(template,estimate,context){
 let allocated=0;
 const steps=template.map((step,index)=>{
  const amountMinor=index===template.length-1?estimate.total-allocated:Math.round(estimate.total*step.percent/100);allocated+=amountMinor;
  const dueDate=dueDateFor(step.due,context);
  return {id:id(),label:step.label,amountMinor,dueDate,...(dueDate?{}:{due:step.due}),invoiceId:null};
 });
 return {estimateId:estimate.id,estimateVersion:estimate.version,currency:estimate.currency,totalMinor:estimate.total,steps,revision:1,updatedAt:now()};
}

export function planView(db,studioId,project,invoices){
 const plan=getPlan(db,studioId,project.id);if(!plan)return null;
 const estimate=confirmedEstimate(project),byId=new Map(invoices.map(item=>[item.id,item]));
 return {...plan,current:!!estimate&&estimate.id===plan.estimateId,steps:plan.steps.map(step=>{const invoice=step.invoiceId?byId.get(step.invoiceId):null;return {...step,dueDate:stepDueDate(step,project),invoice:invoice?{id:invoice.id,number:invoice.number,status:invoice.status}:null};})};
}

export function createPlan(db,{studioId,project,body,today=now().slice(0,10)}){
 const estimate=confirmedEstimate(project);if(!estimate)fail(409,'Ask the client to confirm the latest estimate before planning payments.');
 const existing=getPlan(db,studioId,project.id);
 if(existing&&existing.estimateId===estimate.id&&existing.steps.some(step=>step.invoiceId))fail(409,'This plan already has issued invoices. Edit the remaining payments instead.');
 const invoiced=db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE studio_id=? AND project_id=? AND estimate_id=? AND cancelled_at IS NULL').get(studioId,project.id,estimate.id).n;
 if(invoiced)fail(409,'Invoices already exist for this estimate. Issue the remaining balance directly.');
 const template=body.useDefault===false&&Array.isArray(body.template)?body.template:billingDefaults(db,studioId).plan;
 return save(db,studioId,project.id,planFromTemplate(template,estimate,{today,confirmedAt:estimate.decidedAt,eventDate:project.brief?.date}));
}

export function updatePlan(db,{studioId,project,body,today=now().slice(0,10)}){
 const plan=getPlan(db,studioId,project.id);if(!plan)fail(404,'Create a payment plan first.');
 if(body.revision!==plan.revision)fail(409,'The payment plan changed. Refresh before saving.');
 if(!Array.isArray(body.steps)||body.steps.length<1||body.steps.length>6)fail(400,'A payment plan needs between one and six payments.');
 const previous=new Map(plan.steps.map(step=>[step.id,step]));
 const steps=body.steps.map((input,index)=>{
  const old=input.id?previous.get(input.id):null;
  if(input.id&&!old)fail(409,'The payment plan changed. Refresh before saving.');
  if(old?.invoiceId)return old;
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0)fail(400,`Payment ${index+1} needs an amount above zero.`);
  // A payment still waiting for the event date may stay undated.
  const undated=input.dueDate===''&&!!old&&!stepDueDate(old,project);
  if(!undated&&!isDay(input.dueDate))fail(400,`Choose a due date for payment ${index+1}.`);
  const label=text(input.label,60,`the name of payment ${index+1}`);if(!label)fail(400,`Name payment ${index+1}.`);
  return {id:old?.id||id(),label,amountMinor:input.amountMinor,dueDate:undated?'':input.dueDate,...(undated?{due:old.due}:{}),invoiceId:null};
 });
 for(const step of plan.steps)if(step.invoiceId&&!steps.some(item=>item.id===step.id))fail(409,'Issued payments cannot be removed from the plan.');
 const issuedOrder=steps.filter(step=>step.invoiceId).map(step=>step.id).join(),planOrder=plan.steps.filter(step=>step.invoiceId).map(step=>step.id).join();
 if(issuedOrder!==planOrder)fail(409,'Issued payments keep their place in the plan.');
 if(steps.reduce((sum,step)=>sum+step.amountMinor,0)!==plan.totalMinor)fail(400,'The payments must add up to the confirmed estimate total.');
 return save(db,studioId,project.id,{...plan,steps,revision:plan.revision+1,updatedAt:now()});
}

export function deletePlan(db,{studioId,project}){
 const plan=getPlan(db,studioId,project.id);if(!plan)return null;
 if(plan.steps.some(step=>step.invoiceId))fail(409,'A plan with issued invoices stays on the record.');
 db.prepare('DELETE FROM payment_plans WHERE studio_id=? AND project_id=?').run(studioId,project.id);return null;
}

// What the invoice route needs to issue one scheduled payment.
export function stepInvoice(db,{studioId,project,stepId,today=now().slice(0,10)}){
 const plan=getPlan(db,studioId,project.id);if(!plan)fail(404,'Create a payment plan first.');
 const estimate=confirmedEstimate(project);if(!estimate||estimate.id!==plan.estimateId)fail(409,'The confirmed estimate changed. Create a new plan before invoicing.');
 const index=plan.steps.findIndex(step=>step.id===stepId),step=plan.steps[index];if(!step)fail(404,'Scheduled payment not found.');
 if(step.invoiceId){const invoice=db.prepare('SELECT cancelled_at FROM invoices WHERE id=? AND studio_id=?').get(step.invoiceId,studioId);if(invoice&&!invoice.cancelled_at)fail(409,'This payment has already been invoiced.');}
 if(plan.steps.slice(0,index).some(item=>!item.invoiceId))fail(409,'Issue the earlier payments in the plan first.');
 const last=index===plan.steps.length-1,first=!db.prepare('SELECT 1 FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').get(studioId,project.id);
 // The invoice table only knows deposit, balance and full; an instalment is a further deposit with its own label.
 const kind=last?(first?'Full':'Balance'):'Deposit';
 const due=stepDueDate(step,project);
 return {plan,step,body:{estimateId:estimate.id,kind,label:step.label,amountMinor:step.amountMinor,...(due?{dueDate:due>today?due:today}:{}),note:`${step.label} · payment ${index+1} of ${plan.steps.length}`}};
}
export function markStepInvoiced(db,{studioId,projectId,stepId,invoiceId}){
 const plan=getPlan(db,studioId,projectId);const step=plan.steps.find(item=>item.id===stepId);step.invoiceId=invoiceId;plan.revision++;plan.updatedAt=now();return save(db,studioId,projectId,plan);
}
// A deposit issued from the main invoice form takes its place in the plan, so
// the plan does not offer the same payment again. A different amount moves the
// difference onto the last open payment, keeping the plan total.
export function linkIssuedDeposits(db,{studioId,projectId}){
 const plan=getPlan(db,studioId,projectId);if(!plan)return null;
 const active=new Set(db.prepare('SELECT id FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').all(studioId,projectId).map(row=>row.id));
 const linked=new Set(plan.steps.map(step=>step.invoiceId).filter(Boolean));
 const deposits=db.prepare("SELECT id,amount_minor+discount_minor AS gross FROM invoices WHERE studio_id=? AND project_id=? AND estimate_id=? AND kind='Deposit' AND cancelled_at IS NULL ORDER BY issued_at,id").all(studioId,projectId,plan.estimateId).filter(row=>!linked.has(row.id));
 let changed=false;
 for(const deposit of deposits){
  const open=plan.steps.filter(step=>!step.invoiceId||!active.has(step.invoiceId)),step=open[0],last=open.at(-1);
  if(!step||step===last)break;
  const difference=step.amountMinor-deposit.gross;if(last.amountMinor+difference<=0)break;
  last.amountMinor+=difference;step.amountMinor=deposit.gross;step.invoiceId=deposit.id;changed=true;
 }
 if(!changed)return plan;
 plan.revision++;plan.updatedAt=now();return save(db,studioId,projectId,plan);
}
