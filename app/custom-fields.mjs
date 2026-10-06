import {id,now,transaction} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';

// Custom fields and tags for clients and projects. The studio defines its own
// fields once (Settings, Custom fields); each record keeps its values in
// data.customFields keyed by field id, and its labels in data.tags. Both are
// private to the studio and never reach the client portal.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const FIELD_KINDS=['client','project'];
export const FIELD_TYPES=['text','number','date','choice'];
export const MAX_FIELDS=20,MAX_TAGS=20,MAX_OPTIONS=20;
const SETTING='customFields';

const text=(value,max,what)=>{if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max)fail(400,`Check the ${what}.`);return value.trim();};

export function fieldDefinitions(db,studioId){
 const saved=readSetting(db,studioId,SETTING,{client:[],project:[]});
 return {client:Array.isArray(saved.client)?saved.client:[],project:Array.isArray(saved.project)?saved.project:[]};
}

function cleanDefinitions(list){
 if(!Array.isArray(list)||list.length>MAX_FIELDS)fail(400,`Use up to ${MAX_FIELDS} fields for clients and for projects.`);
 const seen=new Set(),ids=new Set();
 return list.map(input=>{
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Check each custom field.');
  const label=text(input.label,60,'field name');if(!label)fail(400,'Give each custom field a name.');
  const key=label.toLowerCase();if(seen.has(key))fail(400,`“${label}” is used twice. Give each field its own name.`);seen.add(key);
  if(!FIELD_TYPES.includes(input.type))fail(400,`Choose a type for “${label}”.`);
  const fieldId=typeof input.id==='string'&&/^[a-f0-9-]{8,40}$/.test(input.id)&&!ids.has(input.id)?input.id:id();ids.add(fieldId);
  const field={id:fieldId,label,type:input.type};
  if(input.type==='choice'){
   if(!Array.isArray(input.options))fail(400,`Add the choices for “${label}”.`);
   const options=[...new Set(input.options.map(option=>text(option,60,'choice')).filter(Boolean))];
   if(!options.length||options.length>MAX_OPTIONS)fail(400,`Give “${label}” between one and ${MAX_OPTIONS} choices.`);
   field.options=options;
  }
  return field;
 });
}

export function saveFieldDefinitions(db,studioId,input){
 if(!input||typeof input!=='object')fail(400,'Check the custom fields.');
 return writeSetting(db,studioId,SETTING,{client:cleanDefinitions(input.client??[]),project:cleanDefinitions(input.project??[])});
}

export function cleanTags(tags){
 if(!Array.isArray(tags)||tags.length>MAX_TAGS*2)fail(400,`Use up to ${MAX_TAGS} tags.`);
 const out=[],seen=new Set();
 for(const tag of tags){const value=text(tag,50,'tag').replace(/\s+/g,' ');const key=value.toLowerCase();if(value&&!seen.has(key)){seen.add(key);out.push(value);}}
 if(out.length>MAX_TAGS)fail(400,`Use up to ${MAX_TAGS} tags.`);
 return out;
}

// Values for fields that no longer exist are dropped on the next save.
export function cleanFieldValues(definitions,input,previous={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Check the custom field values.');
 const values={};
 for(const field of definitions){
  const raw=Object.hasOwn(input,field.id)?input[field.id]:previous[field.id];
  if(raw===undefined||raw===null||raw==='')continue;
  if(field.type==='number'){const n=typeof raw==='number'?raw:Number(String(raw).trim());if(!Number.isFinite(n)||Math.abs(n)>1e12)fail(400,`Enter a number for “${field.label}”.`);values[field.id]=n;}
  else if(field.type==='date'){if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw)||Number.isNaN(Date.parse(raw+'T12:00:00Z')))fail(400,`Choose a date for “${field.label}”.`);values[field.id]=raw;}
  else if(field.type==='choice'){if(!field.options.includes(raw))fail(400,`Choose one of the options for “${field.label}”.`);values[field.id]=raw;}
  else{const value=text(raw,500,field.label);if(value)values[field.id]=value;}
 }
 return values;
}

function applyDetails(definitions,data,body){
 if(body.tags!==undefined)data.tags=cleanTags(body.tags);
 if(body.fields!==undefined)data.customFields=cleanFieldValues(definitions,body.fields,data.customFields||{});
 if(body.tags===undefined&&body.fields===undefined)fail(400,'Choose tags or field values to save.');
}

export function handleCustomFields({db,req,route,body,studio,owner,reply,clientDTO,decorate}){
 if(route==='/api/custom-fields'){
  if(!owner)fail(403,'Only the studio owner can manage custom fields.');
  if(req.method==='GET')return reply(200,{fields:fieldDefinitions(db,studio.id)}),true;
  if(req.method==='PUT')return reply(200,{fields:saveFieldDefinitions(db,studio.id,body)}),true;
  fail(405,'Method not allowed.');
 }
 const clientMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)\/fields$/);
 if(clientMatch){
  if(!owner)fail(403,'Only the studio owner can edit client details.');if(req.method!=='PATCH')fail(405,'Method not allowed.');
  const row=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientMatch[1],studio.id);if(!row)fail(404,'Client not found.');
  const data=JSON.parse(row.data);applyDetails(fieldDefinitions(db,studio.id).client,data,body);data.updatedAt=now();
  db.prepare('UPDATE clients SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(data),row.id,studio.id);
  return reply(200,{client:clientDTO(db.prepare('SELECT * FROM clients WHERE id=?').get(row.id))}),true;
 }
 const projectMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/fields$/);
 if(projectMatch){
  if(!owner)fail(403,'Only the studio owner can edit project details.');if(!['POST','PATCH'].includes(req.method))fail(405,'Method not allowed.');
  const row=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(projectMatch[1],studio.id);if(!row)fail(404,'Project not found.');
  // Saved without an activity entry: the activity feed is shared with the client.
  const p=JSON.parse(row.data);applyDetails(fieldDefinitions(db,studio.id).project,p,body);
  transaction(db,()=>db.prepare('UPDATE projects SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(p),p.id,studio.id));
  return reply(200,{project:decorate(p)}),true;
 }
 return false;
}
