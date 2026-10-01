import {briefFieldsFor,workflowFor} from './workflows.js';
import {questionIsVisible} from './intake-visibility.js';

export const OPERATORS={eq:'is',neq:'is not',contains:'contains',notContains:'does not contain',gt:'is greater than',gte:'is at least',lt:'is less than',lte:'is at most',before:'is before',after:'is after',onOrBefore:'is on or before',onOrAfter:'is on or after',answered:'has an answer',empty:'is empty'};
export function operatorsFor(field){return field?.type==='number'?['eq','neq','gt','gte','lt','lte','answered','empty']:field?.type==='date'?['eq','neq','before','after','onOrBefore','onOrAfter','answered','empty']:field?.type==='multi'?['contains','notContains','answered','empty']:field?.type==='choice'?['eq','neq','answered','empty']:['eq','neq','contains','notContains','answered','empty'];}
export function conditionMatches(condition,answers,catalog=new Map()){
 if(!condition)return true;
 const evaluate=rule=>{
  // A skipped field is absent, distinct from a visible field with an empty answer.
  if(!Object.hasOwn(answers,rule.field))return false;
  const actual=answers[rule.field],present=Array.isArray(actual)?actual.length>0:actual!==undefined&&actual!==null&&String(actual).trim()!=='';
  if(rule.operator==='answered')return present;
  if(rule.operator==='empty')return !present;
  if(!present)return false;
  const expected=rule.value;
  if(['eq','neq'].includes(rule.operator)){const numeric=catalog.get(rule.field)?.type==='number',equal=numeric?Number.isFinite(Number(actual))&&Number.isFinite(Number(expected))&&Number(actual)===Number(expected):String(actual).trim()===String(expected).trim();return rule.operator==='eq'?equal:!equal;}
  if(['before','after','onOrBefore','onOrAfter'].includes(rule.operator)){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(actual)))return false;return rule.operator==='before'?actual<expected:rule.operator==='after'?actual>expected:rule.operator==='onOrBefore'?actual<=expected:actual>=expected;}
  if(['contains','notContains'].includes(rule.operator)){const includes=Array.isArray(actual)?actual.includes(expected):String(actual).toLowerCase().includes(String(expected).toLowerCase());return rule.operator==='contains'?includes:!includes;}
  const a=Number(actual),b=Number(expected);if(!Number.isFinite(a)||!Number.isFinite(b))return false;
  return rule.operator==='gt'?a>b:rule.operator==='gte'?a>=b:rule.operator==='lt'?a<b:rule.operator==='lte'?a<=b:false;
 };
 return condition.match==='any'?condition.rules.some(evaluate):condition.rules.every(evaluate);
}
export function formFields(d){
 const w=workflowFor({branding:{profession:d.profession}}),core=(key,label,type='text',required=false,extra={})=>({id:'core:'+key,key,label,type,required,...extra});
 return [core('occasion','Project type','choice',true,{options:d.projectTypes}),core('vision','Tell us about your idea','long'),...(d.fields?.date?[core('date',w.date,'date')]:[]),...(d.fields?.venue?[core('venue',w.place)]:[]),...(d.fields?.budget?[core('budget','Budget, if known')]:[]),...(d.fields?.colours?[core('colours','Colours, separated by commas')]:[]),...(d.fields?.practiceDetails?briefFieldsFor(d.profession).map(f=>({id:'detail:'+f.key,key:'detail__'+f.key,label:f.label,type:'text',required:false,placeholder:f.hint})):[]),...(d.fields?.inspiration?[core('pinterest','Inspiration link','url')]:[]),...(d.questions||[]).map(q=>({...q,key:q.id})),core('name','Your name','text',true),core('email','Email','email',true)];
}
export function newScreen(fields=[],title='A little more detail',id='s-'+crypto.randomUUID()){return {id,kind:'questions',mode:fields.length===1?'single':'group',title,description:'',fields,layout:'split',columns:1,imageUrl:'',imageAlt:'',buttonLabel:'',showWhen:null,jumps:[]};}
export function defaultScreens(d){
 const fields=formFields(d),project=fields.filter(f=>!f.id.startsWith('q-')&&!['core:name','core:email'].includes(f.id)).map(f=>f.id);
 return [newScreen(project,'What are we creating?','s-project'),...(d.questions||[]).map(q=>newScreen([q.id],q.label,'s-'+q.id)),newScreen(['core:name','core:email'],'Let’s stay in touch.','s-contact')];
}
export function screensFor(d){return d.screens||defaultScreens(d);}
// Reconcile the editor's question library and enabled project fields without deleting screens or their design.
export function reconcileScreens(d){
 const fields=formFields(d),ids=new Set(fields.map(f=>f.id)),screens=screensFor(d).map(s=>({...s,fields:s.fields.filter(id=>ids.has(id))})).filter(s=>s.kind==='welcome'||s.fields.length),assigned=new Set(screens.flatMap(s=>s.fields));
 const contact=screens.find(s=>s.fields.includes('core:name'))||screens.at(-1);
 for(const field of fields)if(!assigned.has(field.id)){const target=field.id==='core:email'||field.id==='core:name'?contact:screens.find(s=>s.kind==='questions');if(field.id.startsWith('q-')||!target||target.mode==='single')screens.splice(Math.max(0,screens.indexOf(contact)),0,newScreen([field.id],field.label||'New question'));else{target.fields.push(field.id);target.mode='group';}}
 return screens;
}
export function formPath(d,values={},answers={}){
 const screens=screensFor(d),catalog=new Map(formFields(d).map(f=>[f.id,f])),active={},path=[],visibleIds=new Set(),reachableIds=new Set();
 let i=0;
 while(i<screens.length){
  const screen=screens[i];if(!conditionMatches(screen.showWhen,active,catalog)){i++;continue;}
  const fields=[];
  for(const ref of screen.fields){const field=catalog.get(ref);if(!field)continue;reachableIds.add(ref);if(ref.startsWith('q-')&&!questionIsVisible(field,active))continue;const value=ref.startsWith('q-')?answers[ref]??(field.type==='multi'?[]:''):values[field.key]??'';active[ref]=value;fields.push(field);visibleIds.add(ref);}
  if(screen.kind==='welcome'||fields.length)path.push({...screen,fieldDefinitions:fields});
  const jump=screen.jumps?.find(rule=>conditionMatches(rule.when,active,catalog));
  const target=jump?screens.findIndex(s=>s.id===jump.to):-1;i=target>i?target:i+1;
 }
 return {path,active,visibleIds,reachableIds};
}

// Present the same forward-only, essential-field boundary enforced on publishing.
export function branchDestinations(definition,screenId){
 const screens=screensFor(definition),index=screens.findIndex(s=>s.id===screenId);
 if(index<0)return [];
 const required=new Set(formFields(definition).filter(f=>f.required&&f.id.startsWith('core:')).map(f=>f.id)),later=screens.slice(index+1),firstRequired=later.findIndex(s=>s.fields.some(id=>required.has(id)));
 return firstRequired<0?later:later.slice(0,firstRequired+1);
}
export function describeCondition(condition,fields){
 if(!condition?.rules?.length)return 'Always';
 return condition.rules.map(rule=>{
  const label=fields.find(f=>f.id===rule.field)?.label||'Missing question';
  return label+' '+(OPERATORS[rule.operator]||rule.operator)+(['answered','empty'].includes(rule.operator)?'':' “'+rule.value+'”');
 }).join(condition.match==='any'?' or ':' and ');
}
