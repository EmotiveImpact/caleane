import {id,now,event,transaction} from './store.mjs';
import {billingDefaults} from './studio-commerce.mjs';
import {isVatRegistered} from './src/lib/vat.js';
import {briefFieldsFor} from './src/lib/workflows.js';

// A studio's own project templates ("my wedding package"). A template is saved
// from a real project and keeps what repeats from job to job: the kind of work,
// the starting brief, the shared plan and the estimate lines. Nothing about the
// client, their messages, files or money received is kept.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,label,required=false)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);const result=value.trim();if(required&&!result)fail(400,`Add ${label}.`);return result;};
const DAY=86400000;
const isDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T00:00:00Z'));
const dayNumber=value=>Math.round(Date.parse(value+'T00:00:00Z')/DAY);
const fromDayNumber=value=>new Date(value*DAY).toISOString().slice(0,10);
export const TEMPLATE_LIMIT=50;

export function installProjectTemplates(db){db.exec(`
 CREATE TABLE IF NOT EXISTS project_templates(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS project_templates_studio ON project_templates(studio_id,updated_at);`);}

// Task dates are kept relative, so they land in the right place on the next
// project: counted back from the project date when there is one, otherwise
// counted on from the day the project was started.
function templateTask(task,{eventDay,startDay}){
 const due=isDate(task.due)?dayNumber(task.due):null;
 return {title:String(task.title||'').slice(0,200),detail:String(task.detail||'').slice(0,2000),assignee:task.assignee==='client'?'client':'studio',
  ...(due!=null&&eventDay!=null?{daysBeforeDate:eventDay-due}:{}),
  ...(due!=null?{daysAfterStart:Math.max(0,due-startDay)}:{})};
}

export function templateFromProject(p,input={}){
 const brief=p.brief||{},startDay=dayNumber((p.createdAt||now()).slice(0,10)),eventDay=isDate(brief.date)?dayNumber(brief.date):null;
 const include={tasks:input.include?.tasks!==false,estimate:input.include?.estimate!==false};
 const source=p.estimateDraft||p.estimates?.at(-1)||null;
 return {
  name:text(input.name,80,'the template name',true),
  description:text(input.description,500,'the description'),
  brief:{workflowType:brief.workflowType,occasion:String(brief.occasion||'').slice(0,120),vision:String(brief.vision||'').slice(0,5000),budget:String(brief.budget||'').slice(0,120),
   colours:Array.isArray(brief.colours)?brief.colours.slice(0,15).map(x=>String(x).slice(0,60)):[],customColours:String(brief.customColours||'').slice(0,300),
   details:Object.fromEntries(briefFieldsFor(brief.workflowType).map(field=>[field.key,String(brief.details?.[field.key]||'').slice(0,500)]))},
  tasks:include.tasks?(p.tasks||[]).slice(0,60).map(task=>templateTask(task,{eventDay,startDay})).filter(task=>task.title):[],
  estimate:include.estimate&&source?.items?.length?{title:String(source.title||'Project estimate').slice(0,200),note:String(source.note||'').slice(0,3000),currency:source.currency||'GBP',taxRate:source.taxRate??0,
   items:source.items.slice(0,30).map(item=>({title:String(item.title).slice(0,200),quantity:item.quantity,unitAmount:item.unitAmount}))}:null
 };
}

const toDTO=row=>({id:row.id,...JSON.parse(row.data),createdAt:row.created_at,updatedAt:row.updated_at});
export function listProjectTemplates(db,studioId){return db.prepare('SELECT * FROM project_templates WHERE studio_id=? ORDER BY updated_at DESC').all(studioId).map(toDTO);}
export function projectTemplate(db,studioId,templateId){const row=db.prepare('SELECT * FROM project_templates WHERE id=? AND studio_id=?').get(text(templateId,64,'the template'),studioId);if(!row)fail(404,'That project template no longer exists.');return toDTO(row);}

export function changeProjectTemplates(db,studioId,body){
 return transaction(db,()=>{
  if(body.action==='create'){
   if(db.prepare('SELECT COUNT(*) AS n FROM project_templates WHERE studio_id=?').get(studioId).n>=TEMPLATE_LIMIT)fail(409,`You can save up to ${TEMPLATE_LIMIT} project templates. Delete one you no longer use first.`);
   const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(text(body.projectId,64,'the project'),studioId);if(!row)fail(404,'Project not found.');
   const name=text(body.name,80,'the template name',true);
   if(listProjectTemplates(db,studioId).some(t=>t.name.toLowerCase()===name.toLowerCase()))fail(409,'You already have a template with that name. Choose another name.');
   const templateId=id(),at=now();
   db.prepare('INSERT INTO project_templates VALUES(?,?,?,?,?)').run(templateId,studioId,JSON.stringify(templateFromProject(JSON.parse(row.data),body)),at,at);
   return {templates:listProjectTemplates(db,studioId),template:projectTemplate(db,studioId,templateId)};
  }
  const current=projectTemplate(db,studioId,body.id);
  if(body.action==='update'){
   const name=text(body.name,80,'the template name',true),description=text(body.description,500,'the description');
   if(listProjectTemplates(db,studioId).some(t=>t.id!==current.id&&t.name.toLowerCase()===name.toLowerCase()))fail(409,'You already have a template with that name. Choose another name.');
   const {id:_,createdAt,updatedAt,...data}=current;
   db.prepare('UPDATE project_templates SET data=?,updated_at=? WHERE id=?').run(JSON.stringify({...data,name,description}),now(),current.id);
  }else if(body.action==='delete')db.prepare('DELETE FROM project_templates WHERE id=?').run(current.id);
  else fail(400,'Choose a template action.');
  return {templates:listProjectTemplates(db,studioId)};
 });
}

// Adds the template's plan and estimate to a project that is about to be
// created. The brief itself comes from the form, which the template prefilled,
// so anything the owner changed there wins.
export function applyProjectTemplate(db,studioId,p,templateId,user){
 const template=projectTemplate(db,studioId,templateId);
 const startDay=dayNumber(now().slice(0,10)),eventDay=isDate(p.brief?.date)?dayNumber(p.brief.date):null;
 p.tasks=(template.tasks||[]).map(task=>{
  const due=eventDay!=null&&task.daysBeforeDate!=null?fromDayNumber(eventDay-task.daysBeforeDate):task.daysAfterStart!=null?fromDayNumber(startDay+task.daysAfterStart):'';
  return {id:id(),title:task.title,detail:task.detail||'',due,assignee:task.assignee==='client'?'client':'studio',status:'To do',completed:false,createdBy:user.name,at:now()};
 });
 if(template.estimate?.items?.length){
  const e=template.estimate,vatRegistered=isVatRegistered(billingDefaults(db,studioId)),items=e.items.map(item=>({...item}));
  const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unitAmount,0),tax=Math.round(subtotal*e.taxRate/100);
  p.estimateDraft={title:e.title,note:e.note,currency:e.currency,items,taxRate:e.taxRate,vatRegistered,subtotal,tax,total:subtotal+tax,updatedAt:now(),by:user.name};
 }
 p.template={id:template.id,name:template.name};
 event(p,user,`Started from the template “${template.name}”`);
 return template;
}

export function handleProjectTemplates({db,req,route,body,studio,owner,reply}){
 if(route!=='/api/project-templates')return false;
 if(!owner)fail(403,'Only the studio owner can manage project templates.');
 installProjectTemplates(db);
 if(req.method==='GET')return reply(200,{templates:listProjectTemplates(db,studio.id)}),true;
 if(req.method==='POST'){const result=changeProjectTemplates(db,studio.id,body||{});return reply(body?.action==='create'?201:200,result),true;}
 fail(405,'Method not allowed.');
}
