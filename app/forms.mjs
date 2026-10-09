import {id,now,hash,transaction,makeProject,insertProject} from './store.mjs';
import {validateIntakeQuestions,captureIntakeAnswers} from './intake-questions.mjs';
import {DEFAULT_WORKFLOW,isWorkflowId,projectTypesFor,briefFieldsFor} from './src/lib/workflows.js';
import {accentContrast} from './src/lib/accent-theme.js';
import {validateScreens,validateFormTheme} from './form-screens.mjs';
import {formPath,formFields} from './src/lib/form-flow.js';
import {assertQuota} from './uploads.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)fail(400,`Check ${label}.`);return v.trim();};
const link=v=>{const value=text(v||'',2000,'the web link');if(!value)return '';try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw 0;return u.href;}catch{fail(400,'Use a complete http or https link.');}};
export function installForms(db){db.exec(`
 CREATE TABLE IF NOT EXISTS enquiry_forms(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),slug TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published','paused','archived')),revision INTEGER NOT NULL,draft TEXT NOT NULL,published_version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(studio_id,slug),UNIQUE(id,studio_id));
 CREATE TABLE IF NOT EXISTS enquiry_form_versions(form_id TEXT NOT NULL,studio_id TEXT NOT NULL,version INTEGER NOT NULL,definition TEXT NOT NULL,published_at TEXT NOT NULL,PRIMARY KEY(form_id,version),FOREIGN KEY(form_id,studio_id) REFERENCES enquiry_forms(id,studio_id));
 CREATE TABLE IF NOT EXISTS enquiry_form_responses(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,form_id TEXT NOT NULL,version INTEGER NOT NULL,project_id TEXT NOT NULL,client_id TEXT NOT NULL,key TEXT NOT NULL,digest TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(studio_id,key),FOREIGN KEY(form_id,studio_id) REFERENCES enquiry_forms(id,studio_id),FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id),FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id));
 CREATE TABLE IF NOT EXISTS enquiry_uploads(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),form_slug TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS enquiry_uploads_studio ON enquiry_uploads(studio_id,created_at);
 CREATE INDEX IF NOT EXISTS enquiry_forms_studio ON enquiry_forms(studio_id,updated_at);
 CREATE INDEX IF NOT EXISTS enquiry_responses_project ON enquiry_form_responses(studio_id,project_id,created_at DESC,id);
 CREATE INDEX IF NOT EXISTS enquiry_responses_form ON enquiry_form_responses(studio_id,form_id,created_at);
 `);}
export function validateForm(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Check the form settings.');
 const name=text(body.name,120,'the form name'),title=text(body.title,160,'the welcome title');
 if(name.length<3||title.length<3)fail(400,'Give your form a name and welcome title.');
 const profession=body.profession||DEFAULT_WORKFLOW;if(!isWorkflowId(profession))fail(400,'Choose a kind of work.');
 const types=body.projectTypes??projectTypesFor(profession);
 if(!Array.isArray(types)||!types.length||types.length>20)fail(400,'Add one to twenty project types.');
 const projectTypes=types.map(v=>text(v,120,'a project type'));
 if(projectTypes.some(v=>!v)||new Set(projectTypes).size!==projectTypes.length)fail(400,'Give project types different names.');
 const accent=text(body.accent||'#202326',7,'the accent');if(accentContrast(accent)<4.5)fail(400,'Choose a darker accent so white button text stays readable.');
 const fields={};for(const key of ['date','venue','budget','colours','inspiration','practiceDetails']){if(body.fields?.[key]!==undefined&&typeof body.fields[key]!=='boolean')fail(400,'Check the project fields.');fields[key]=body.fields?.[key]??true;}
 const layout=body.layout||'steps';if(!['steps','page'].includes(layout))fail(400,'Choose a step-by-step or single-page form.');
 const definition={name,title,description:text(body.description||'',1000,'the introduction'),profession,projectTypes,accent,logoUrl:link(body.logoUrl),layout,fields,questions:validateIntakeQuestions(body.questions||[]),submitLabel:text(body.submitLabel||'Send my brief',60,'the send button')||'Send my brief',successTitle:text(body.successTitle||'Your brief is with the studio.',160,'the thank-you title'),successMessage:text(body.successMessage||'We will review your ideas and get in touch using the email you shared.',1000,'the thank-you message'),consentText:text(body.consentText||'',500,'the acknowledgement'),privacyUrl:link(body.privacyUrl),theme:validateFormTheme(body.theme)};
 if(body.screens!==undefined)definition.screens=validateScreens(body.screens,definition);
 return definition;
}
export function formDefaults(studio){const brand=studio.branding||{};return validateForm({name:'Website enquiry',title:'Let’s make something together.',description:brand.welcome||'Tell us a little about your idea and the details that matter to you.',profession:brand.profession||DEFAULT_WORKFLOW,projectTypes:brand.projectTypes||projectTypesFor(brand.profession),accent:accentContrast(studio.accent)>=4.5?studio.accent:'#202326',logoUrl:'',questions:brand.intakeQuestions||[]});}
function dto(db,row){const definition=JSON.parse(row.draft),count=db.prepare('SELECT COUNT(*) AS n FROM enquiry_form_responses WHERE form_id=? AND studio_id=?').get(row.id,row.studio_id).n;const live=row.published_version?JSON.parse(db.prepare('SELECT definition FROM enquiry_form_versions WHERE form_id=? AND version=?').get(row.id,row.published_version).definition):null;return {id:row.id,slug:row.slug,status:row.status,revision:row.revision,publishedVersion:row.published_version,definition,published:live,hasUnpublishedChanges:!!live&&JSON.stringify(definition)!==JSON.stringify(live),responseCount:count,createdAt:row.created_at,updatedAt:row.updated_at};}
function find(db,studioId,formId){const row=db.prepare('SELECT * FROM enquiry_forms WHERE id=? AND studio_id=?').get(formId,studioId);if(!row)fail(404,'Form not found.');return row;}
export function ensureDefaultForm(db,studio){if(db.prepare('SELECT 1 FROM enquiry_forms WHERE studio_id=? AND slug=?').get(studio.id,'enquiry'))return;transaction(db,()=>{const definition=formDefaults(studio),formId=id(),at=now();db.prepare('INSERT INTO enquiry_forms VALUES(?,?,?,?,?,?,?,?,?,?)').run(formId,studio.id,'enquiry',definition.name,'published',1,JSON.stringify(definition),1,at,at);db.prepare('INSERT INTO enquiry_form_versions VALUES(?,?,?,?,?)').run(formId,studio.id,1,JSON.stringify(definition),at);});}
export function listForms(db,studio){ensureDefaultForm(db,studio);return db.prepare('SELECT * FROM enquiry_forms WHERE studio_id=? ORDER BY created_at,id').all(studio.id).map(row=>dto(db,row));}
export function changeForm(db,studio,body,formId=null){return transaction(db,()=>{
 if(!formId){if(db.prepare('SELECT COUNT(*) AS n FROM enquiry_forms WHERE studio_id=?').get(studio.id).n>=50)fail(400,'A studio can keep up to fifty forms.');const definition=validateForm(body.definition||formDefaults(studio)),slug=text(body.slug||'',80,'the form address');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Use lowercase letters, numbers and hyphens for the form address.');if(db.prepare('SELECT 1 FROM enquiry_forms WHERE studio_id=? AND slug=?').get(studio.id,slug))fail(409,'That form address is already in use.');const at=now(),newId=id();db.prepare('INSERT INTO enquiry_forms VALUES(?,?,?,?,?,?,?,?,?,?)').run(newId,studio.id,slug,definition.name,'draft',1,JSON.stringify(definition),0,at,at);return dto(db,find(db,studio.id,newId));}
 const row=find(db,studio.id,formId);if(body.revision!==row.revision)fail(409,'This form changed in another window. Reload it before saving.');
 let definition=JSON.parse(row.draft),status=row.status,version=row.published_version;
 if(body.action==='save'){if(status==='archived')fail(409,'Restore this form before editing.');definition=validateForm(body.definition);}
 else if(body.action==='publish'){if(status==='archived')fail(409,'Restore this form before publishing.');definition=validateForm(body.definition||definition);version++;status='published';db.prepare('INSERT INTO enquiry_form_versions VALUES(?,?,?,?,?)').run(formId,studio.id,version,JSON.stringify(definition),now());}
 else if(body.action==='pause'){if(status!=='published')fail(409,'Only a published form can be paused.');status='paused';}
 else if(body.action==='resume'){if(status!=='paused'||!version)fail(409,'Only a paused form can resume.');status='published';}
 else if(body.action==='archive')status='archived';
 else if(body.action==='restore'){if(status!=='archived')fail(409,'This form is not archived.');status=version?'paused':'draft';}
 else fail(400,'Choose a form action.');
 db.prepare('UPDATE enquiry_forms SET name=?,status=?,revision=revision+1,draft=?,published_version=?,updated_at=? WHERE id=? AND studio_id=?').run(definition.name,status,JSON.stringify(definition),version,now(),formId,studio.id);return dto(db,find(db,studio.id,formId));
 });}
export function publicForm(db,studioId,slug='enquiry'){const row=db.prepare('SELECT * FROM enquiry_forms WHERE studio_id=? AND slug=?').get(studioId,slug);if(!row)return null;if(row.status!=='published')fail(410,'This form is not taking enquiries at the moment. Please contact the studio.');return {id:row.id,slug:row.slug,version:row.published_version,definition:JSON.parse(db.prepare('SELECT definition FROM enquiry_form_versions WHERE form_id=? AND version=?').get(row.id,row.published_version).definition)};}
// File questions: a visitor's files are held here until the enquiry is sent, then become project references.
// Unsent uploads are removed by cleanupUnattachedUploads after a day.
export const UPLOAD_MAX_BYTES=5*1024*1024,PENDING_UPLOAD_BYTES=200*1024*1024;
export function formAcceptsUploads(db,studioId,slug){const row=db.prepare("SELECT * FROM enquiry_forms WHERE studio_id=? AND slug=? AND status='published'").get(studioId,slug);if(!row)return false;const definition=JSON.parse(db.prepare('SELECT definition FROM enquiry_form_versions WHERE form_id=? AND version=?').get(row.id,row.published_version).definition);return definition.questions.some(q=>q.type==='file');}
export function storeEnquiryUpload(db,studio,slug,body,sniff){
 if(!formAcceptsUploads(db,studio.id,slug))fail(404,'This form does not take files.');
 const name=text(body.name||'',180,'the file name').replace(/[\\/]/g,'-');if(!name||typeof body.content!=='string')fail(400,'Choose a file to upload.');
 const data=Buffer.from(body.content,'base64');if(data.length<12)fail(400,'Choose a file to upload.');if(data.length>UPLOAD_MAX_BYTES)fail(413,'Choose a file smaller than 5 MB.');
 const mime=sniff(data);if(!mime)fail(400,'Use a PNG, JPG, WebP or PDF file.');
 const since=new Date(Date.now()-86400000).toISOString();if(db.prepare('SELECT COALESCE(SUM(length(content)),0) AS n FROM enquiry_uploads WHERE studio_id=? AND created_at>?').get(studio.id,since).n+data.length>PENDING_UPLOAD_BYTES)fail(429,'This studio is receiving a lot of files right now. Please try again later.');
 assertQuota(db,studio.id,data.length);const uploadId=id();db.prepare('INSERT INTO enquiry_uploads VALUES(?,?,?,?,?,?,?)').run(uploadId,studio.id,slug,name,mime,data,now());
 return {id:uploadId,name,mime,bytes:data.length};
}
export function submitForm(db,{studio,slug,body,key,buildBrief,legacy=false,onCreated=null}){
 key=text(key||'',120,'the enquiry reference');if(!key)fail(400,'An enquiry reference is required.');if(body.website)fail(400,'Please leave the website field empty.');
 const digest=hash(JSON.stringify({slug,body})),previous=db.prepare('SELECT * FROM enquiry_form_responses WHERE studio_id=? AND key=?').get(studio.id,key);
 if(previous){if(previous.digest!==digest)fail(409,'This enquiry reference has already been used.');return {status:200,data:{ok:true,reference:previous.project_id.slice(0,8).toUpperCase()}};}
 const legacyReceipt=db.prepare('SELECT * FROM receipts WHERE studio_id=? AND key=?').get(studio.id,key);
 if(legacyReceipt){
  if(!legacy)fail(409,'This enquiry reference has already been used.');
  const project=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(legacyReceipt.project_id,studio.id).data),original=project.briefHistory?.at(-1)?.brief||project.brief;
  const retry=buildBrief({...body,workflowType:original.workflowType||DEFAULT_WORKFLOW,intakeAnswers:captureIntakeAnswers(body.intakeAnswers,original.intakeAnswers||[])});
  retry.intakeAnswers=retry.intakeAnswers.map((answer,index)=>Object.fromEntries(Object.keys(original.intakeAnswers[index]).map(key=>[key,answer[key]])));
  if(hash(JSON.stringify(retry))!==legacyReceipt.digest)fail(409,'This enquiry reference has already been used.');
  return {status:200,data:{ok:true,reference:legacyReceipt.project_id.slice(0,8).toUpperCase()}};
 }

 const form=publicForm(db,studio.id,slug);if(!form)fail(404,'Form not found.');if(!legacy&&body.formVersion!==form.version)fail(409,'This form was updated. Reload it and review your answers before sending.');
 const definition=form.definition;if(!legacy&&!definition.projectTypes.includes(body.occasion))fail(400,'Choose an available project type.');if(definition.consentText&&body.consent!==true)fail(400,'Confirm the acknowledgement before sending.');
 const values={...body,...Object.fromEntries(Object.entries(body.details||{}).map(([key,value])=>['detail__'+key,value]))};
 const flow=definition.screens?formPath(definition,values,body.intakeAnswers):null;
 const excludedIds=flow?new Set(definition.questions.filter(q=>!flow.reachableIds.has(q.id)).map(q=>q.id)):new Set();
 const intakeAnswers=captureIntakeAnswers(body.intakeAnswers,definition.questions,{excludedIds}),payload={...body,workflowType:definition.profession,intakeAnswers:[]};
 if(flow){payload.details={...body.details};for(const f of formFields(definition))if(!flow.visibleIds.has(f.id)&&!f.id.startsWith('q-')){if(f.id.startsWith('detail:'))payload.details[f.key.slice(8)]='';else payload[f.key]=f.key==='colours'?[]:'';}}
 for(const key of ['date','venue','budget','colours'])if(!definition.fields[key])payload[key]=key==='colours'?[]:'';
 if(!definition.fields.inspiration)payload.pinterest='';if(!definition.fields.practiceDetails)payload.details={};
 const uploads=[];for(const answer of intakeAnswers)if(answer.type==='file'){answer.value=answer.value.map(uploadId=>{const row=db.prepare('SELECT * FROM enquiry_uploads WHERE id=? AND studio_id=? AND form_slug=?').get(uploadId,studio.id,form.slug);if(!row)fail(400,`A file for “${answer.label}” has expired. Add it again.`);uploads.push({row,label:answer.label});return row.name;});}
 const brief=buildBrief(payload);brief.intakeAnswers=intakeAnswers;const p=makeProject(studio.id,brief,{name:brief.name}),at=now(),responseId=id();
 for(const {row,label} of uploads){row.fileId=id();p.inspiration.unshift({id:id(),title:row.name,note:`Sent with the enquiry: ${label}`,url:'',category:'',source:'Enquiry form',comments:[],fileId:row.fileId,mime:row.mime,by:brief.name,at});}p.intakeSource={formId:form.id,formSlug:form.slug,formName:definition.name,version:form.version,responseId};
 return transaction(db,()=>{insertProject(db,p);for(const {row} of uploads){db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(row.fileId,p.id,row.name,row.mime,row.content);db.prepare('DELETE FROM enquiry_uploads WHERE id=?').run(row.id);}const clientId=db.prepare('SELECT client_id FROM crm_project_relationships WHERE studio_id=? AND project_id=?').get(studio.id,p.id).client_id;db.prepare('UPDATE crm_opportunities SET source=? WHERE studio_id=? AND project_id=?').run('Form: '+definition.name,studio.id,p.id);const snapshot={definition,brief,consent:!!body.consent,submittedAt:at};db.prepare('INSERT INTO enquiry_form_responses VALUES(?,?,?,?,?,?,?,?,?,?)').run(responseId,studio.id,form.id,form.version,p.id,clientId,key,digest,JSON.stringify(snapshot),at);onCreated?.(p.id);return {status:201,data:{ok:true,reference:p.id.slice(0,8).toUpperCase()}};});
}
export function listFormResponses(db,studioId,formId,offset=0){find(db,studioId,formId);if(!Number.isInteger(offset)||offset<0)fail(400,'Check the response page.');const rows=db.prepare('SELECT * FROM enquiry_form_responses WHERE studio_id=? AND form_id=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?').all(studioId,formId,offset);return {total:db.prepare('SELECT COUNT(*) AS n FROM enquiry_form_responses WHERE studio_id=? AND form_id=?').get(studioId,formId).n,responses:rows.slice(0,50).map(row=>({id:row.id,projectId:row.project_id,clientId:row.client_id,version:row.version,createdAt:row.created_at,snapshot:JSON.parse(row.snapshot)})),nextOffset:rows.length>50?offset+50:null};}
// One column per question and per practice detail, so a spreadsheet can sort and filter by any answer.
// Questions are matched by id across form versions and headed with their latest wording.
export function formResponseCSV(db,studioId,formId){find(db,studioId,formId);
 const rows=db.prepare('SELECT * FROM enquiry_form_responses WHERE studio_id=? AND form_id=? ORDER BY created_at,id').all(studioId,formId).map(row=>({row,...JSON.parse(row.snapshot)}));
 const cells=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"',value=v=>Array.isArray(v)?v.join(', '):v;
 const questions=new Map(),details=new Map();
 for(const {brief,definition} of rows){
  for(const answer of brief.intakeAnswers||[])questions.set(answer.id,answer.label);
  const labels=new Map(briefFieldsFor(definition?.profession||brief.workflowType).map(f=>[f.key,f.label]));
  for(const key of Object.keys(brief.details||{}))details.set(key,labels.get(key)||details.get(key)||key);
 }
 const out=[['Submitted','Version','Name','Email','Project type','Project ID','Date','Location','Budget','Idea','Colours','Inspiration',...details.values(),...questions.values(),'Acknowledgement']];
 for(const {row,brief,consent} of rows){
  const answers=new Map((brief.intakeAnswers||[]).filter(a=>a.applicable).map(a=>[a.id,value(a.value)]));
  out.push([row.created_at,row.version,brief.name,brief.email,brief.occasion,row.project_id,brief.date,brief.venue,brief.budget,brief.vision,(brief.colours||[]).join(', '),brief.pinterest,...[...details.keys()].map(key=>brief.details?.[key]),...[...questions.keys()].map(id=>answers.get(id)),consent?'Yes':'']);
 }
 return '﻿'+out.map(row=>row.map(cells).join(',')).join('\r\n');}
