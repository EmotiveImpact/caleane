import {questionIsVisible} from './src/lib/intake-visibility.js';

const bad=message=>{throw Object.assign(new Error(message),{status:400});};
const string=(value,max,label)=>{if(typeof value!=='string'||value.length>max)bad(`Check ${label}.`);return value.trim();};
const idPattern=/^q-[a-z0-9-]{3,64}$/;
export const MAX_FILES=5;

export function validateIntakeQuestions(input){
 if(!Array.isArray(input)||input.length>24)bad('Add up to 24 enquiry questions.');
 const seen=new Set();
 const questions=input.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))bad('Check each enquiry question.');
  const id=string(item.id,66,'the question ID'),label=string(item.label,120,'the question label');
  if(!idPattern.test(id)||seen.has(id)||label.length<3)bad('Give each enquiry question a unique ID and clear label.');
  seen.add(id);
  const type=item.type;
  if(!['text','long','choice','multi','number','date','email','url','file'].includes(type)||typeof item.required!=='boolean')bad('Choose a question type and requirement.');
  let options=[];
  if(['choice','multi'].includes(type)){
   if(!Array.isArray(item.options)||item.options.length<2||item.options.length>12)bad('Add two to twelve choices.');
   options=item.options.map(value=>string(value,100,'a choice')).filter(Boolean);
   if(options.length!==item.options.length||new Set(options.map(value=>value.toLowerCase())).size!==options.length)bad('Give each choice a different name.');
  }
  // Picture choices and short notes under each choice, aligned with the choices.
  let optionImages=[],optionNotes=[];
  if(['choice','multi'].includes(type)){
   if(item.optionImages!==undefined){if(!Array.isArray(item.optionImages)||item.optionImages.length>options.length)bad('Check the choice pictures.');optionImages=item.optionImages.map(value=>{const link=string(value||'',2000,'a choice picture');if(!link)return '';try{const url=new URL(link);if(url.protocol!=='https:'||url.username||url.password)throw 0;return url.href;}catch{bad('Use a complete https link for each choice picture.');}});}
   if(item.optionNotes!==undefined){if(!Array.isArray(item.optionNotes)||item.optionNotes.length>options.length)bad('Check the notes under each choice.');optionNotes=item.optionNotes.map(value=>string(value||'',100,'a choice note'));}
  }
  if(item.pictures!==undefined&&typeof item.pictures!=='boolean')bad('Check the picture choice setting.');
  let showWhen=null;
  if(item.showWhen!==undefined&&item.showWhen!==null){
   if(!item.showWhen||typeof item.showWhen!=='object'||Array.isArray(item.showWhen))bad('Check when this question should appear.');
   showWhen={questionId:string(item.showWhen.questionId,66,'the condition'),equals:string(item.showWhen.equals,100,'the condition answer')};
  }
  return {id,label,type,required:item.required,options,...(optionImages.some(Boolean)?{optionImages}:{}),...(optionNotes.some(Boolean)?{optionNotes}:{}),...(item.pictures&&['choice','multi'].includes(type)?{pictures:true}:{}),showWhen,order:index,help:string(item.help||'',300,'the question help'),placeholder:string(item.placeholder||'',120,'the answer hint')};
 });
 for(const [index,question] of questions.entries()){
  if(!question.showWhen)continue;
  const parent=questions.slice(0,index).find(item=>item.id===question.showWhen.questionId);
  if(!parent||parent.type!=='choice'||!parent.options.includes(question.showWhen.equals))bad('A conditional question must follow an earlier single-choice question and use one of its answers.');
 }
 return questions;
}

export function captureIntakeAnswers(input,questions,{excludedIds=new Set()}={}){
 if(input===undefined||input===null)input={};
 if(!input||typeof input!=='object'||Array.isArray(input))bad('Check the enquiry answers.');
 const ids=new Set(questions.map(question=>question.id));
 if(Object.keys(input).some(key=>!ids.has(key)))bad('This enquiry form changed. Refresh it before sending.');
 const answered={};
 return questions.map(question=>{
  const screenExcluded=excludedIds.has(question.id),applicable=!screenExcluded&&questionIsVisible(question,answered);
  let value=applicable?input[question.id]??(['multi','file'].includes(question.type)?[]:''):(['multi','file'].includes(question.type)?[]:'');
  // File answers hold upload references on the way in and file names once saved.
  if(question.type==='file'){
   if(!Array.isArray(value)||value.length>MAX_FILES||value.some(item=>typeof item!=='string'||!item.trim()||item.length>180))bad(`Check the files for “${question.label}”.`);
   value=value.map(item=>item.trim());
  }else if(question.type==='multi'){
   if(!Array.isArray(value)||value.length>12||value.some(item=>typeof item!=='string'||!question.options.includes(item))||new Set(value).size!==value.length)bad(`Choose available answers for “${question.label}”.`);
   value=question.options.filter(option=>value.includes(option));
  }else value=string(value,question.type==='long'?1200:500,question.label);
  if(applicable&&question.required&&(!value||Array.isArray(value)&&!value.length))bad(`Answer “${question.label}” before sending.`);
  if(applicable&&question.type==='choice'&&value&&!question.options.includes(value))bad(`Choose an available answer for “${question.label}”.`);
  if(value&&question.type==='number'&&(!/^-?\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value))))bad(`Enter a number for “${question.label}”.`);
  if(value&&question.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))bad(`Enter an email for “${question.label}”.`);
  if(value&&question.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))bad(`Enter a date for “${question.label}”.`);
  if(value&&question.type==='url'){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw 0;}catch{bad(`Enter a complete web link for “${question.label}”.`);}}
  answered[question.id]=value;
  return {...question,value,applicable,...(screenExcluded?{screenExcluded:true}:{})};
 });
}

export function updateIntakeAnswers(previous,input){
 const saved=Array.isArray(previous)?previous:[];
 if(input===undefined)return saved;
 if(!Array.isArray(input)||input.length>24)bad('Check the enquiry answers.');
 const submitted=new Map();
 for(const item of input){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||submitted.has(item.id))bad('Check the enquiry answers.');
  submitted.set(item.id,item.value);
 }
 if([...submitted.keys()].some(key=>!saved.some(answer=>answer.id===key)))bad('The enquiry questions changed. Refresh the brief.');
 const definitions=validateIntakeQuestions(saved);
 const answers=Object.fromEntries(saved.map(answer=>[answer.id,submitted.has(answer.id)?submitted.get(answer.id):answer.value]));
 return captureIntakeAnswers(answers,definitions,{excludedIds:new Set(saved.filter(a=>a.screenExcluded===true).map(a=>a.id))});
}

export function normalizeIntakeAnswers(input){
 if(!Array.isArray(input))bad('Check the enquiry answers.');
 const definitions=validateIntakeQuestions(input);
 return captureIntakeAnswers(Object.fromEntries(input.map(answer=>[answer.id,answer.value])),definitions,{excludedIds:new Set(input.filter(a=>a.screenExcluded===true).map(a=>a.id))});
}
