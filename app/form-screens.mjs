import {imagePositionPoint} from './src/lib/image-position.js';
import {formFields,operatorsFor} from './src/lib/form-flow.js';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const string=(v,max,label)=>{if(typeof v!=='string'||v.length>max)fail(`Check ${label}.`);return v.trim();};
function imageLink(v){const value=string(v||'',2000,'the screen image');if(!value)return '';try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw 0;return url.href;}catch{fail('Use a complete http or https image link.');}}
export function validateCondition(input,available,label){
 if(input==null)return null;
 if(!input||!['all','any'].includes(input.match)||!Array.isArray(input.rules)||!input.rules.length||input.rules.length>6)fail(`Use one to six conditions for ${label}.`);
 const rules=input.rules.map(rule=>{const field=available.find(f=>f.id===rule?.field);if(!field)fail(`The condition for ${label} must use an earlier, available question.`);if(!operatorsFor(field).includes(rule.operator))fail(`Choose a valid comparison for ${field.label}.`);const value=['answered','empty'].includes(rule.operator)?'':string(rule.value,500,'the condition answer');if(!['answered','empty'].includes(rule.operator)&&!value)fail('Give the condition an answer to compare.');if(['choice','multi'].includes(field.type)&&value&&!field.options.includes(value))fail(`Choose an available answer for ${field.label}.`);if(field.type==='number'&&value&&!Number.isFinite(Number(value)))fail('Use a number in a numeric condition.');if(field.type==='date'&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail('Use a valid date in a date condition.');return {field:field.id,operator:rule.operator,value};});
 return {match:input.match,rules};
}
export function validateScreens(input,d){
 if(!Array.isArray(input)||!input.length||input.length>60)fail('Use one to sixty screens.');
 const fields=formFields(d),catalog=new Map(fields.map(f=>[f.id,f])),seen=new Set(),assigned=new Set();
 const screens=input.map(s=>{if(!s||typeof s!=='object')fail('Check each screen.');const id=string(s.id,70,'the screen ID');if(!/^s-[a-z0-9-]{3,67}$/.test(id)||seen.has(id))fail('Give every screen a unique ID.');seen.add(id);const kind=s.kind||'questions';if(!['questions','welcome'].includes(kind))fail('Choose a question or welcome screen.');if(!Array.isArray(s.fields)||s.fields.length>60||kind==='welcome'&&s.fields.length)fail('Check the questions assigned to the screen.');for(const ref of s.fields){if(!catalog.has(ref)||assigned.has(ref))fail('Each enabled question must appear on exactly one screen.');assigned.add(ref);}if(kind==='questions'&&!s.fields.length)fail('Add a question to each question screen, or remove the empty screen.');const mode=s.mode||(s.fields.length===1?'single':'group');if(!['single','group'].includes(mode)||mode==='single'&&s.fields.length>1)fail('A single-question screen can only contain one question.');const layout=s.layout||'split';if(!['split','center','stack','image-left','image-right','cover'].includes(layout))fail('Choose a valid screen layout.');const columns=s.columns||1;if(![1,2].includes(columns))fail('Choose one or two columns.');const imageFit=s.imageFit||'cover',imagePosition=s.imagePosition||'center',contentWidth=s.contentWidth||'comfortable';if(!['cover','contain'].includes(imageFit)||!imagePositionPoint(imagePosition)||!['narrow','comfortable','wide'].includes(contentWidth))fail('Choose an available image framing and content width.');return {imageFit,imagePosition,contentWidth,id,kind,mode,title:string(s.title||'',160,'the screen title'),description:string(s.description||'',1000,'the screen description'),fields:[...s.fields],layout,columns,imageUrl:imageLink(s.imageUrl),imageAlt:string(s.imageAlt||'',160,'the image description'),buttonLabel:string(s.buttonLabel||'',60,'the screen button'),showWhen:s.showWhen??null,jumps:s.jumps||[]};});
 if(fields.some(f=>!assigned.has(f.id)))fail('Place every enabled question on a screen.');
 const prior=[];
 for(const [i,s] of screens.entries()){
  const label=s.title||`screen ${i+1}`;
  s.showWhen=validateCondition(s.showWhen,prior,label);
  if(s.showWhen&&s.fields.some(ref=>catalog.get(ref).required&&ref.startsWith('core:')))fail(`Keep the required contact and project fields on an unconditional screen (${label}).`);
  const current=s.fields.map(ref=>catalog.get(ref));
  const available=[...prior];
  for(const f of current){if(f.showWhen&&!available.some(a=>a.id===f.showWhen.questionId))fail(`Move “${f.label}” after the question used in its condition.`);available.push(f);}
  if(!Array.isArray(s.jumps)||s.jumps.length>4)fail(`Use up to four branches on ${label}.`);
  s.jumps=s.jumps.map(jump=>{const to=screens.findIndex(target=>target.id===jump.to);if(to<=i)fail(`A branch from ${label} must go to a later screen. Check deleted or moved destinations.`);if(screens.slice(i+1,to).some(target=>target.fields.some(ref=>catalog.get(ref).required&&ref.startsWith('core:'))))fail(`A branch from ${label} cannot skip required contact or project fields.`);const when=validateCondition(jump.when,available,`a branch from ${label}`);if(!when)fail('Add a condition to each branch.');return {to:jump.to,when};});
  prior.push(...current);
 }
 return screens;
}
export function validateFormTheme(input={}){if(!input||typeof input!=='object'||Array.isArray(input))fail('Check the form theme.');const font=input.font||'sans',background=input.background||'white',radius=input.radius||'soft',buttonStyle=input.buttonStyle||'solid';if(!['sans','serif'].includes(font)||!['white','paper','tint'].includes(background)||!['square','soft','round'].includes(radius)||!['solid','outline'].includes(buttonStyle))fail('Choose an available form theme.');return {font,background,radius,buttonStyle};}
