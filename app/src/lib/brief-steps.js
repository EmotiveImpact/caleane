import {formPath,formFields,screensFor,describeCondition} from './form-flow.js';

// The brief look asks one question at a time. Screens still own layout and logic;
// each question on a screen becomes its own step, grouped into chapters.
export const IMAGE_LAYOUTS=['image-left','image-right','cover'];
const CONTACT=new Set(['core:name','core:email']);

// Conversational wording for the built-in project fields. Their labels stay short for the brief.
export function promptFor(field,values={}){
 const first=String(values.name||'').trim().split(/\s+/)[0];
 return {'core:occasion':'What are we creating?','core:vision':'Tell us about your idea.','core:date':'When is it happening?','core:venue':'Where will it be?','core:budget':'Roughly what budget are you working with?','core:colours':'Any colours in mind?','core:pinterest':'Anything to show us?','core:name':'And what should we call you?','core:email':first?`Thanks, ${first}. Where can we reach you?`:'Where can we reach you?'}[field.id]||field.label;
}
export function helpFor(field){
 return field.help||{'core:occasion':'Pick the closest. You can tell us more in a moment.','core:vision':'The mood, the people, anything you have pinned. Shift and Enter adds a new line.','core:date':'An approximate date is fine.','core:budget':'This helps the studio suggest the right scale.','core:colours':'A few words are enough, separated by commas.','core:pinterest':'A Pinterest board or any link with your references.','core:name':'So the studio knows who they are planning with.','core:email':'Only used to reply to your enquiry.'}[field.id]||field.placeholder||'';
}
export function chapterFor(screen,previous){
 if(screen.chapter?.trim())return screen.chapter.trim();
 if(screen.fields?.some(id=>CONTACT.has(id)))return 'About you';
 return previous||'Your project';
}
export function briefSteps(d,values={},answers={}){
 const flow=formPath(d,values,answers),steps=[];let chapter=null;
 for(const screen of flow.path){
  if(screen.kind==='welcome'){steps.push({key:screen.id,kind:'statement',screen,chapter:null});continue;}
  chapter=chapterFor(screen,chapter);
  const single=screen.fieldDefinitions.length===1;
  screen.fieldDefinitions.forEach((field,i)=>steps.push({key:screen.id+':'+field.id,kind:'question',screen,field,chapter,title:single&&screen.title&&screen.mode==='single'&&screen.title.trim()!==field.label.trim()?screen.title:promptFor(field,values),help:helpFor(field)||(i===0?screen.description:''),lastOnScreen:i===screen.fieldDefinitions.length-1}));
 }
 return {flow,steps};
}
export function chaptersOf(steps){
 const out=[];
 for(const step of steps){if(step.kind!=='question')continue;let c=out.find(x=>x.name===step.chapter);if(!c)out.push(c={name:step.chapter,steps:[]});c.steps.push(step);}
 return out;
}
// The first step to open when the editor inspects a screen, even one hidden by logic.
export function inspectSteps(d,screenId){
 const screen=screensFor(d).find(s=>s.id===screenId);if(!screen)return [];
 const catalog=new Map(formFields(d).map(f=>[f.id,f])),index=screensFor(d).indexOf(screen);
 let chapter=null;for(const s of screensFor(d).slice(0,index+1))if(s.kind!=='welcome')chapter=chapterFor(s,chapter);
 if(screen.kind==='welcome')return [{key:screen.id,kind:'statement',screen,chapter:null}];
 const fields=screen.fields.map(id=>catalog.get(id)).filter(Boolean);
 return fields.map((field,i)=>({key:screen.id+':'+field.id,kind:'question',screen,field,chapter,title:fields.length===1&&screen.mode==='single'&&screen.title&&screen.title.trim()!==field.label.trim()?screen.title:promptFor(field),help:helpFor(field)||(i===0?screen.description:''),lastOnScreen:i===fields.length-1}));
}

// Logic map: every way a client can move between screens, and anything nobody can reach.
const alwaysTrue=(when,catalog)=>{const sure=r=>r.operator==='answered'&&catalog.get(r.field)?.required;return !!when?.rules?.length&&(when.match==='any'?when.rules.some(sure):when.rules.every(sure));};
export function logicGraph(d){
 const screens=screensFor(d),fields=formFields(d),catalog=new Map(fields.map(f=>[f.id,f])),edges=[];
 screens.forEach((s,i)=>{
  const next=screens[i+1]?.id||'end';let always=false;
  s.jumps?.forEach((jump,n)=>{const to=screens.findIndex(t=>t.id===jump.to);if(to>i)edges.push({from:s.id,to:jump.to,kind:'jump',rule:n,label:'If '+describeCondition(jump.when,fields)});if(alwaysTrue(jump.when,catalog))always=true;});
  if(!always)edges.push({from:s.id,to:next,kind:'next',label:s.jumps?.length?'Everyone else':''});
 });
 // A conditional screen can be skipped, so whatever reaches it can also reach the screen after it.
 const reach=new Set(),stack=[screens[0]?.id];
 while(stack.length){const id=stack.pop();if(!id||reach.has(id))continue;reach.add(id);const i=screens.findIndex(s=>s.id===id);if(i<0)continue;
  for(const e of edges)if(e.from===id)stack.push(e.to);
  if(screens[i].showWhen)stack.push(screens[i+1]?.id||'end');}
 const issues=screens.filter(s=>!reach.has(s.id)).map(s=>({screen:s.id,text:`No one can reach “${s.title||'Untitled screen'}”. A rule before it always skips past it.`}));
 if(!reach.has('end'))issues.push({screen:null,text:'No path reaches the end of the form, so no one could send it.'});
 return {screens,edges,issues};
}
export function routeSentences(d){
 const screens=screensFor(d),fields=formFields(d),out=[];
 screens.forEach(s=>{
  if(s.showWhen)out.push({screen:s,kind:'only',text:'Only shown when '+describeCondition(s.showWhen,fields)});
  s.jumps?.forEach(j=>out.push({screen:s,kind:'go',text:'If '+describeCondition(j.when,fields)+', go to '+(screens.find(t=>t.id===j.to)?.title||'a removed screen')}));
 });
 return out;
}
