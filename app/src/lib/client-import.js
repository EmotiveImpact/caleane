// Bringing clients across from HoneyBook, Dubsado or a spreadsheet. The browser
// reads the CSV and previews each row; the server checks every row again with
// the same rules before it creates a record, so both always agree.
export const MAX_IMPORT_ROWS=1000;
export const IMPORT_STAGES=[{value:'Active',label:'Active'},{value:'Lead',label:'Prospective'},{value:'Past client',label:'Past client'}];
export const BASE_FIELDS=[
 {key:'name',label:'Full name',hint:'Or use first and last name below.'},
 {key:'firstName',label:'First name'},
 {key:'lastName',label:'Last name'},
 {key:'email',label:'Email address'},
 {key:'company',label:'Company'},
 {key:'phone',label:'Phone'},
 {key:'tags',label:'Tags',hint:'Separate several with commas.'},
 {key:'note',label:'Notes',hint:'Saved as a studio note.'},
];
const ALIASES={
 name:['name','full name','client name','contact name','contact','client','display name'],
 firstName:['first name','first','given name','forename','firstname','client first name','contact first name'],
 lastName:['last name','last','surname','family name','lastname','client last name','contact last name'],
 email:['email','email address','e-mail','e-mail address','primary email','client email','contact email','email 1'],
 company:['company','company name','business','business name','organisation','organization','organisation name','organization name','brand'],
 phone:['phone','phone number','mobile','mobile number','mobile phone','telephone','tel','cell','cell phone','primary phone','phone 1'],
 tags:['tags','tag','labels','label'],
 note:['notes','note','comments','comment','description','about'],
};
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const squash=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clip=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);

// A forgiving CSV reader: quoted cells, doubled quotes, line breaks inside
// quotes, Windows line endings, a byte order mark, and comma, semicolon or tab
// separators (Excel in much of Europe saves with semicolons).
export function parseCsv(text){
 const source=String(text||'').replace(/^\uFEFF/,'');
 const firstLine=source.split(/\r?\n/,1)[0]||'';
 const [best]=[',',';','\t'].map(sep=>[sep,firstLine.split(sep).length]).sort((a,b)=>b[1]-a[1]);
 const separator=best[1]>1?best[0]:',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){if(ch==='"'){if(source[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=ch;continue;}
  if(ch==='"'&&cell.trim()===''){cell='';quoted=true;}
  else if(ch===separator){row.push(cell);cell='';}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 // Each row keeps its spreadsheet row number, so skipped rows are easy to find.
 const filled=rows.map((r,i)=>({cells:r.map(c=>c.trim()),line:i+1})).filter(r=>r.cells.some(Boolean));
 const [{cells:head=[]}={},...body]=filled;
 const seen=new Map();
 const headers=head.map((h,i)=>{const label=h||`Column ${i+1}`;const n=(seen.get(label)||0)+1;seen.set(label,n);return n>1?`${label} (${n})`:label;});
 return {headers,rows:body.map(r=>headers.map((_,i)=>r.cells[i]||'')),lines:body.map(r=>r.line)};
}

// Match the file's columns to Caleane's by name. Studio fields match on their own label.
export function guessMapping(headers,customFields=[]){
 const mapping={},used=new Set();
 const pick=(key,names)=>{const index=headers.findIndex((h,i)=>!used.has(i)&&names.some(n=>squash(n)===squash(h)));if(index>=0){mapping[key]=headers[index];used.add(index);}};
 for(const key of Object.keys(ALIASES))pick(key,ALIASES[key]);
 for(const field of customFields)pick('field:'+field.id,[squash(field.label)]);
 return mapping;
}

// Turn one spreadsheet row into the plain shape the server accepts.
export function rowToClient(headers,row,mapping,line){
 const value=key=>{const index=mapping[key]?headers.indexOf(mapping[key]):-1;return index>=0?row[index]||'':'';};
 const fields={};
 for(const key of Object.keys(mapping))if(key.startsWith('field:')){const raw=value(key);if(raw)fields[key.slice(6)]=raw;}
 return {row:line,name:value('name')||[value('firstName'),value('lastName')].filter(Boolean).join(' '),email:value('email'),company:value('company'),phone:value('phone'),tags:value('tags'),note:value('note'),fields};
}

function fieldValue(field,raw){
 const text=String(raw).trim();
 if(field.type==='number'){const n=Number(text.replace(/[,£$€\s]/g,''));return Number.isFinite(n)&&Math.abs(n)<=1e12?n:undefined;}
 if(field.type==='date'){
  let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),y,m,d;
  if(match)[,y,m,d]=match;else if((match=text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)))[,d,m,y]=match;else return undefined;
  const iso=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`,check=new Date(iso+'T12:00:00Z');
  return !Number.isNaN(check.getTime())&&check.toISOString().slice(0,10)===iso?iso:undefined;
 }
 if(field.type==='choice')return field.options.find(o=>o.toLowerCase()===text.toLowerCase());
 return clip(text,500)||undefined;
}

// The single set of rules for a row. Problems skip the row; notes say what was left out.
export function prepareClient(input,customFields=[]){
 const source=input&&typeof input==='object'?input:{};
 const name=clip(source.name,120),email=clip(source.email,254).toLowerCase(),notes=[];
 let problem='';
 if(!email)problem='No email address';
 else if(!EMAIL.test(email))problem='Email address doesn’t look right';
 else if(!name)problem='No name';
 const tagText=Array.isArray(source.tags)?source.tags.join(','):String(source.tags||'');
 const tags=[],seen=new Set();
 for(const tag of tagText.split(/[,;|]/)){const t=clip(tag,50);if(t&&!seen.has(t.toLowerCase())&&tags.length<20){seen.add(t.toLowerCase());tags.push(t);}}
 const fields={},given=source.fields&&typeof source.fields==='object'?source.fields:{};
 for(const field of customFields){
  if(!Object.hasOwn(given,field.id)||given[field.id]===''||given[field.id]===null)continue;
  const value=fieldValue(field,given[field.id]);
  if(value===undefined)notes.push(`${field.label} left blank: “${clip(given[field.id],40)}” isn’t ${field.type==='number'?'a number':field.type==='date'?'a date':field.type==='choice'?'one of its choices':'valid'}`);
  else fields[field.id]=value;
 }
 return {client:{name,email,company:clip(source.company,200),phone:clip(source.phone,60),tags,note:String(source.note??'').trim().slice(0,5000),fields},problem,notes};
}

// Check a whole file in order: repeated emails within it, and clients the studio already has.
export function reviewImport(inputs,{existingEmails=[],customFields=[]}={}){
 const taken=new Set(existingEmails.map(e=>String(e).toLowerCase())),firstSeen=new Map();
 return inputs.map((input,index)=>{
  const row=Number.isInteger(input?.row)&&input.row>1&&input.row<1e6?input.row:index+2;
  const result={...prepareClient(input,customFields),row};
  if(!result.problem){
   const email=result.client.email;
   if(taken.has(email))result.problem='Already one of your clients';
   else if(firstSeen.has(email))result.problem=`Same email as row ${firstSeen.get(email)}`;
   else firstSeen.set(email,result.row);
  }
  return result;
 });
}

export const TEMPLATE_CSV='First name,Last name,Email,Company,Phone,Tags,Notes\r\nAmelia,Taylor,amelia@example.com,Taylor & Co,07700 900123,"Wedding, 2026",Met at the spring fair\r\n';
