// Shared helpers for the studio's own fields and tags on clients and projects.
export const FIELD_TYPES=[{value:'text',label:'Text'},{value:'number',label:'Number'},{value:'date',label:'Date'},{value:'choice',label:'Choice from a list'}];
export const ALL_TAGS='All tags';

export function displayValue(field,value){
 if(value===undefined||value===null||value==='')return '';
 if(field.type==='date')return new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
 if(field.type==='number')return Number(value).toLocaleString('en-GB');
 return String(value);
}

// Tags and field values join the text a search box matches against.
export function detailsText(record){return [...(record?.tags||[]),...Object.values(record?.customFields||{})].join(' ');}

export function collectTags(records){
 const seen=new Map();
 for(const record of records)for(const tag of record?.tags||[]){const key=tag.toLowerCase();if(!seen.has(key))seen.set(key,tag);}
 return [...seen.values()].sort((a,b)=>a.localeCompare(b,'en-GB',{sensitivity:'base'}));
}

export const hasTag=(record,tag)=>tag===ALL_TAGS||(record?.tags||[]).some(t=>t.toLowerCase()===tag.toLowerCase());

// Field definitions change rarely, so each studio's list is fetched once and
// shared by every screen until Settings saves a new one.
const cache=new Map(),listeners=new Set();
export function loadFieldDefinitions(studioId,request){
 if(!cache.has(studioId))cache.set(studioId,request(`/api/custom-fields?studio=${studioId}`).then(d=>d.fields).catch(error=>{cache.delete(studioId);throw error;}));
 return cache.get(studioId);
}
export function storeFieldDefinitions(studioId,fields){cache.set(studioId,Promise.resolve(fields));for(const listener of listeners)listener(studioId,fields);}
export function onFieldDefinitions(listener){listeners.add(listener);return()=>listeners.delete(listener);}

// Starting points the settings screen offers, in the studio's own words.
export const FIELD_IDEAS=[
 {kind:'project',label:'Venue',type:'text'},
 {kind:'project',label:'Guest count',type:'number'},
 {kind:'project',label:'Brand stage',type:'choice',options:['New brand','Refresh','Extension']},
 {kind:'project',label:'Delivery deadline',type:'date'},
 {kind:'client',label:'Referred by',type:'text'},
 {kind:'client',label:'Preferred contact',type:'choice',options:['Email','Phone','Portal']},
 {kind:'client',label:'Birthday',type:'date'},
];
