import {id,now,transaction} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';

// Custom fields and tags for clients and projects. The studio defines its own
// fields once (Settings, Custom fields); each record keeps its values in
// data.customFields keyed by field id, and its labels in data.tags. Both are
// private to the studio and never reach the client portal.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const FIELD_KINDS=['client','project'];
export const FIELD_TYPES=['text','number','date','choice','yesno','money','link','file'];
export const FIELD_CURRENCIES=['GBP','EUR','USD'];
export const FIELD_FILE_BYTES=6000000;
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
  if(input.type==='money')field.currency=FIELD_CURRENCIES.includes(input.currency)?input.currency:'GBP';
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

const safeLink=(raw,label)=>{const value=text(raw,500,label);if(!value)return '';let url;try{url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(value)?value:'https://'+value);}catch{fail(400,`Enter a web address for “${label}”.`);}if(!['http:','https:'].includes(url.protocol)||!url.hostname.includes('.'))fail(400,`Enter a web address for “${label}”.`);return url.href;};

// Values for fields that no longer exist are dropped on the next save.
// A file value names a file this studio uploaded through /api/custom-fields/files.
export function cleanFieldValues(definitions,input,previous={},findFile=()=>null){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Check the custom field values.');
 const values={};
 for(const field of definitions){
  const raw=Object.hasOwn(input,field.id)?input[field.id]:previous[field.id];
  if(raw===undefined||raw===null||raw==='')continue;
  if(field.type==='number'){const n=typeof raw==='number'?raw:Number(String(raw).trim());if(!Number.isFinite(n)||Math.abs(n)>1e12)fail(400,`Enter a number for “${field.label}”.`);values[field.id]=n;}
  else if(field.type==='date'){if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw)||Number.isNaN(Date.parse(raw+'T12:00:00Z')))fail(400,`Choose a date for “${field.label}”.`);values[field.id]=raw;}
  else if(field.type==='choice'){if(!field.options.includes(raw))fail(400,`Choose one of the options for “${field.label}”.`);values[field.id]=raw;}
  else if(field.type==='yesno'){const yes=raw===true||raw==='yes'||raw==='true',no=raw===false||raw==='no'||raw==='false';if(!yes&&!no)fail(400,`Choose yes or no for “${field.label}”.`);values[field.id]=yes;}
  else if(field.type==='money'){const n=typeof raw==='number'?raw:Number(String(raw).replace(/[£€$,\s]/g,''));if(!Number.isFinite(n)||n<0||n>1e12)fail(400,`Enter an amount for “${field.label}”.`);values[field.id]=Math.round(n*100)/100;}
  else if(field.type==='link'){const value=safeLink(raw,field.label);if(value)values[field.id]=value;}
  else if(field.type==='file'){const fileId=typeof raw==='object'?raw.fileId:raw;const file=typeof fileId==='string'?findFile(fileId):null;if(!file)fail(400,`Upload the file for “${field.label}” again.`);values[field.id]={fileId:file.id,name:file.name};}
  else{const value=text(raw,500,field.label);if(value)values[field.id]=value;}
 }
 return values;
}

function applyDetails(definitions,data,body,findFile){
 if(body.tags!==undefined)data.tags=cleanTags(body.tags);
 if(body.fields!==undefined)data.customFields=cleanFieldValues(definitions,body.fields,data.customFields||{},findFile);
 if(body.tags===undefined&&body.fields===undefined)fail(400,'Choose tags or field values to save.');
}

export function installCustomFieldFiles(db){db.exec(`CREATE TABLE IF NOT EXISTS custom_field_files(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS custom_field_files_studio ON custom_field_files(studio_id,created_at);`);}

/** Files kept in a file field. One no record names any more, or never attached after a day, is removed. */
export function cleanupFieldFiles(db,{olderThanMs=86400000,clock=Date.now}={}){
 const cutoff=new Date(clock()-olderThanMs).toISOString();let removed=0;
 for(const file of db.prepare('SELECT id,studio_id FROM custom_field_files WHERE created_at<?').all(cutoff)){
  const pattern='%"fileId":"'+file.id+'"%';
  const used=db.prepare('SELECT 1 FROM clients WHERE studio_id=? AND data LIKE ? UNION ALL SELECT 1 FROM projects WHERE studio_id=? AND data LIKE ? LIMIT 1').get(file.studio_id,pattern,file.studio_id,pattern);
  if(!used)removed+=Number(db.prepare('DELETE FROM custom_field_files WHERE id=?').run(file.id).changes);
 }
 return removed;
}

export function handleCustomFields({db,req,res,route,body,studio,owner,reply,clientDTO,decorate,sniffMime,assertQuota}){
 const findFile=fileId=>db.prepare('SELECT id,name FROM custom_field_files WHERE id=? AND studio_id=?').get(fileId,studio.id);
 if(route==='/api/custom-fields/files'){
  if(!owner)fail(403,'Only the studio owner can add files to records.');if(req.method!=='POST')fail(405,'Method not allowed.');
  const name=text(body.name,180,'file name'),data=Buffer.from(text(body.content,8400000,'file'),'base64'),mime=sniffMime(data);
  if(!name||data.length<12)fail(400,'Choose a file to upload.');if(data.length>FIELD_FILE_BYTES)fail(413,'This file is too large. Choose a file below 6 MB.');
  if(!mime)fail(415,'Choose a PDF, PNG, JPEG or WebP file.');assertQuota(db,studio.id,data.length);
  const file={id:id(),name,mime,size:data.length};db.prepare('INSERT INTO custom_field_files VALUES(?,?,?,?,?,?)').run(file.id,studio.id,name,mime,data,now());
  return reply(201,{file}),true;
 }
 const fileMatch=route.match(/^\/api\/custom-fields\/files\/([a-f0-9-]+)$/);
 if(fileMatch){
  if(!owner)fail(403,'Only the studio owner can open these files.');if(req.method!=='GET')fail(405,'Method not allowed.');
  const file=db.prepare('SELECT * FROM custom_field_files WHERE id=? AND studio_id=?').get(fileMatch[1],studio.id);if(!file)fail(404,'File not found.');
  res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff'});
  return res.end(Buffer.from(file.content)),true;
 }
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
  const data=JSON.parse(row.data);applyDetails(fieldDefinitions(db,studio.id).client,data,body,findFile);data.updatedAt=now();
  db.prepare('UPDATE clients SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(data),row.id,studio.id);
  return reply(200,{client:clientDTO(db.prepare('SELECT * FROM clients WHERE id=?').get(row.id))}),true;
 }
 const projectMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/fields$/);
 if(projectMatch){
  if(!owner)fail(403,'Only the studio owner can edit project details.');if(!['POST','PATCH'].includes(req.method))fail(405,'Method not allowed.');
  const row=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(projectMatch[1],studio.id);if(!row)fail(404,'Project not found.');
  // Saved without an activity entry: the activity feed is shared with the client.
  const p=JSON.parse(row.data);applyDetails(fieldDefinitions(db,studio.id).project,p,body,findFile);
  transaction(db,()=>db.prepare('UPDATE projects SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(p),p.id,studio.id));
  return reply(200,{project:decorate(p)}),true;
 }
 return false;
}
