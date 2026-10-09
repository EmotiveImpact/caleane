// Turns a stored brief into readable rows, so change requests and older versions read like the brief itself.
import {briefFieldsFor,WORKFLOWS} from './workflows.js';
import {formatDay} from './dates.js';

const words=key=>String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').trim().toLowerCase().replace(/^./,c=>c.toUpperCase());
// Any stored value becomes plain text: numbers, lists and nested objects included, never a raw object.
export function valueText(value){
 if(value==null||value==='')return '';
 if(typeof value==='string')return value.trim();
 if(typeof value==='number')return Number.isFinite(value)?value.toLocaleString('en-GB'):'';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(Array.isArray(value))return value.map(valueText).filter(Boolean).join(', ');
 if(typeof value==='object')return Object.entries(value).map(([key,item])=>{const text=valueText(item);return text&&`${words(key)}: ${text}`;}).filter(Boolean).join(' · ');
 return String(value);
}
const answerValue=answer=>answer?.applicable===false?'Not asked for this enquiry':valueText(answer?.value);
// Rows in the order the brief is shown. Each has a stable key, a label and its text ('' when empty).
export function briefRows(brief,workflow={}){
 const b=brief&&typeof brief==='object'?brief:{},type=WORKFLOWS[b.workflowType]?b.workflowType:workflow.id,guide=WORKFLOWS[type]||workflow,details=b.details&&typeof b.details==='object'&&!Array.isArray(b.details)?b.details:{};
 const known=briefFieldsFor(type),extra=Object.keys(details).filter(key=>!known.some(field=>field.key===key));
 return [
  ['name','Client name',valueText(b.name)],['occasion','Project type',valueText(b.occasion)],
  ['vision','The idea',valueText(b.vision)],
  ...known.map(field=>['details.'+field.key,field.label,valueText(details[field.key])]),
  ...extra.map(key=>['details.'+key,words(key),valueText(details[key])]),
  ...(Array.isArray(b.intakeAnswers)?b.intakeAnswers:[]).map(answer=>['answer.'+answer?.id,valueText(answer?.label)||'Question',answerValue(answer)]),
  ['date',guide.date||'Date',typeof b.date==='string'&&b.date?formatDay(b.date,b.date):valueText(b.date)],
  ['venue',guide.place||'Venue',valueText(b.venue)],
  ['colours','Colours',valueText(b.colours)],['customColours','Other colours',valueText(b.customColours)],
  ['budget','Budget',valueText(b.budget)],['pinterest','Inspiration link',valueText(b.pinterest)]
 ].map(([key,label,text])=>({key,label,text}));
}
// What a proposed or later brief changes, field by field, with the earlier wording beside it.
export function briefChanges(before,after,workflow={}){
 const was=new Map(briefRows(before,workflow).map(row=>[row.key,row])),rows=briefRows(after,workflow),keys=new Set(rows.map(row=>row.key));
 const changes=rows.filter(row=>row.text!==(was.get(row.key)?.text||'')).map(row=>({key:row.key,label:row.label,was:was.get(row.key)?.text||'',now:row.text}));
 for(const [key,row] of was)if(!keys.has(key)&&row.text)changes.push({key,label:row.label,was:row.text,now:''});
 return changes;
}
// Older entries recorded who replaced a version; the author of version N is whoever replaced version N-1.
// Version 1 falls back to whoever submitted the first brief.
export function versionAuthor(history,entry,firstAuthor=''){
 if(entry?.author)return entry.author;
 return (Array.isArray(history)?history:[]).find(item=>item?.revision===entry?.revision-1)?.by||(entry?.revision===1?firstAuthor||'':'');
}
// A history entry is stamped when it was replaced; version N was written when version N-1 was replaced.
export function versionWritten(history,entry,createdAt){
 if(entry?.authoredAt)return entry.authoredAt;
 return (Array.isArray(history)?history:[]).find(item=>item?.revision===entry?.revision-1)?.at||(entry?.revision===1?createdAt:entry?.at);
}
export const openChangeRequests=list=>(Array.isArray(list)?list:[]).filter(change=>change?.status==='Pending');
export const settledChangeRequests=list=>(Array.isArray(list)?list:[]).filter(change=>change&&change.status!=='Pending');
