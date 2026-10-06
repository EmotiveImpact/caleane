import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,X} from 'lucide-react';
import {formFields,screensFor} from '../lib/form-flow.js';
import {briefSteps,chaptersOf,inspectSteps,IMAGE_LAYOUTS} from '../lib/brief-steps.js';
import {answerText} from './QuestionInput';

// The brief look: one question at a time, chapters across the top and the brief filling in beside it.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const KEYS='ABCDEFGHIJKL';
const tones=new Map();
// Read how light the top of a photo is, so text over it stays readable. Remote images without CORS fall back to light text.
function useImageTone(url,override){
 const [tone,setTone]=useState(()=>tones.get(url)||'light');
 useEffect(()=>{if(!url||override&&override!=='auto')return;if(tones.has(url)){setTone(tones.get(url));return;}let alive=true;const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{const c=document.createElement('canvas');c.width=48;c.height=24;const x=c.getContext('2d');x.drawImage(img,0,0,img.naturalWidth,img.naturalHeight*.3,0,0,48,24);const data=x.getImageData(0,0,48,24).data;let sum=0;for(let i=0;i<data.length;i+=4)sum+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];const t=sum/(data.length/4)<150?'light':'dark';tones.set(url,t);if(alive)setTone(t);}catch{}};img.src=url;return()=>{alive=false;};},[url,override]);
 return override&&override!=='auto'?override:tone;
}
export function imageTone(url){return tones.get(url);}

const fmtDate=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?`${Number(m[3])} ${MONTHS[Number(m[2])-1]} ${m[1]}`:v;};
const shown=(field,value)=>field.type==='date'?fmtDate(value):answerText(value);
const filled=value=>Array.isArray(value)?value.length>0:String(value??'').trim()!=='';

// Day, month name and year: unambiguous for British clients, stored as an ISO date.
function DateParts({value,onChange,label,name,required}){
 const parse=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?{d:String(Number(m[3])),m:String(Number(m[2])),y:m[1]}:{d:'',m:'',y:''};};
 const [parts,setParts]=useState(()=>parse(value));
 useEffect(()=>{if(value)setParts(parse(value));},[value]);
 function set(patch){const next={...parts,...patch};setParts(next);const d=Number(next.d),m=Number(next.m),y=Number(next.y);const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const ok=y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1&&d<=31&&!isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso;onChange(ok?iso:'',ok||(!next.d&&!next.m&&!next.y)?'':'partial');}
 return <fieldset className="bf-date" aria-label={label} data-name={name}><legend className="bf-sr">{label}</legend>
  <label><span>Day</span><input name={name+'__day'} inputMode="numeric" autoComplete="off" maxLength="2" placeholder="14" value={parts.d} aria-required={required||undefined} onChange={e=>set({d:e.target.value.replace(/\D/g,'')})}/></label>
  <label><span>Month</span><select name={name+'__month'} value={parts.m} onChange={e=>set({m:e.target.value})}><option value="">Month</option>{MONTHS.map((m,i)=><option key={m} value={String(i+1)}>{m}</option>)}</select></label>
  <label><span>Year</span><input name={name+'__year'} inputMode="numeric" autoComplete="off" maxLength="4" placeholder={String(new Date().getFullYear()+1)} value={parts.y} onChange={e=>set({y:e.target.value.replace(/\D/g,'')})}/></label>
 </fieldset>;
}

function Choices({field,value,onPick,name,pictures}){
 const multi=field.type==='multi',options=field.options||[],images=field.optionImages||[],notes=field.optionNotes||[];
 const cols=!pictures&&options.length>=5&&!notes.some(Boolean)&&options.every(o=>o.length<=22);
 const checked=o=>multi?(value||[]).includes(o):value===o;
 return <div className={pictures?'bf-tiles':'bf-list'+(cols?' cols':'')} role="group" aria-label={field.label}>{options.map((o,i)=><label key={o} className={pictures?'bf-tile':'bf-row'} data-checked={checked(o)||undefined}>
  <input className="bf-sr" type={multi?'checkbox':'radio'} name={name} value={o} checked={checked(o)} onChange={()=>onPick(o)} required={!multi&&field.required&&i===0} aria-label={o}/>
  {pictures?<><span className={'bf-ph'+(images[i]?'':' blank')} style={images[i]?{backgroundImage:`url("${images[i].replace(/"/g,'%22')}")`}:undefined} aria-hidden="true">{images[i]?'':o.slice(0,1)}</span><span className="bf-lb"><span>{o}</span><kbd aria-hidden="true">{KEYS[i]}</kbd></span><span className="bf-badge" aria-hidden="true"><Check size={13}/></span></>:<><kbd aria-hidden="true">{KEYS[i]}</kbd><span className="bf-txt"><span>{o}</span>{notes[i]&&<small>{notes[i]}</small>}</span><span className="bf-tick" aria-hidden="true"><Check size={13}/></span></>}
 </label>)}</div>;
}

export function BriefForm({studio,form,preview=false,startScreenId}){
 const d=form.definition,theme=d.theme||{},storageKey=`caleane-form:${studio.slug}:${form.slug}:${form.version||'draft'}`;
 const [values,setValues]=useState({}),[answers,setAnswers]=useState({}),[stepKey,setStepKey]=useState('__welcome'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState(''),[remember,setRemember]=useState(false),[requestKey,setRequestKey]=useState(()=>crypto.randomUUID()),[briefOpen,setBriefOpen]=useState(false),[fresh,setFresh]=useState(null),[back,setBack]=useState(false),[partial,setPartial]=useState({});
 const rootRef=useRef(null),formRef=useRef(null),lastIndex=useRef(0),advance=useRef(null),mounted=useRef(false);
 const showChapters=theme.chapters!==false,showBrief=theme.brief!==false;
 const screens=screensFor(d),openWithStatement=screens[0]?.kind==='welcome';
 const {flow,steps}=briefSteps(d,values,answers);
 const welcome={key:'__welcome',kind:'welcome'};
 const all=openWithStatement?steps:[welcome,...steps];
 // The editor can inspect a screen before its rule matches; the real journey always follows the evaluated path.
 const inspecting=preview&&startScreenId&&!startScreenId.startsWith('__')&&!steps.some(s=>s.screen.id===startScreenId)?inspectSteps(d,startScreenId):[];
 const pool=inspecting.length?[...all,...inspecting]:all;
 let index=pool.findIndex(s=>s.key===stepKey);if(index<0)index=Math.min(lastIndex.current,all.length-1);
 const step=pool[index];lastIndex.current=index;
 const questions=steps.filter(s=>s.kind==='question'),lastQuestion=questions.at(-1),isLast=step.kind==='question'&&step.key===lastQuestion?.key;
 const valueOf=field=>field.id.startsWith('q-')?answers[field.id]??(field.type==='multi'?[]:''):values[field.key]??'';

 useEffect(()=>{if(preview&&startScreenId==='__welcome'){setStepKey('__welcome');setReceipt('');setError('');return;}if(preview&&startScreenId==='__ending'){setReceipt('Preview');return;}if(preview&&startScreenId){const first=all.find(s=>s.screen?.id===startScreenId)||inspectSteps(d,startScreenId)[0];if(first){setStepKey(first.key);setReceipt('');setError('');}}},[startScreenId,preview]);
 useEffect(()=>{if(preview)return;try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved){setValues(saved.values||{});setAnswers(saved.answers||{});setRequestKey(saved.key||crypto.randomUUID());setRemember(true);}}catch{}},[storageKey,preview]);
 useEffect(()=>{if(preview||!remember)return;try{sessionStorage.setItem(storageKey,JSON.stringify({values,answers,key:requestKey}));}catch{}},[values,answers,remember,storageKey,preview,requestKey]);
 useEffect(()=>{if(preview||window.parent===window)return;const report=()=>window.parent.postMessage({type:'caleane:resize',height:Math.ceil(rootRef.current?.getBoundingClientRect().height||document.body.scrollHeight)},'*');const observer=new ResizeObserver(report);observer.observe(document.body);report();return()=>observer.disconnect();},[preview]);
 // Move focus to the new question, but never steal it from the editor while a studio inspects screens.
 useEffect(()=>{if(!mounted.current){mounted.current=true;return;}if(preview&&startScreenId&&!rootRef.current?.contains(document.activeElement))return;const el=formRef.current?.querySelector('input:not([type=hidden]):not(.bf-hp input),textarea,select')||rootRef.current?.querySelector('.bf-title');el?.focus({preventScroll:true});},[stepKey,receipt]);
 useEffect(()=>()=>clearTimeout(advance.current),[]);
 const keyHandler=useRef(null);keyHandler.current=e=>onKey(e);
 // On the hosted page, keys work before the client has clicked anything.
 useEffect(()=>{if(preview)return;const listen=e=>{if(e.target===document.body||e.target===document.documentElement)keyHandler.current(e);};document.addEventListener('keydown',listen);return()=>document.removeEventListener('keydown',listen);},[preview]);

 function update(nextValues,nextAnswers){const {flow:next}=briefSteps(d,nextValues,nextAnswers);setValues(Object.fromEntries(Object.entries(nextValues).filter(([key])=>key==='consent'||key==='website'||next.visibleIds.has(key.startsWith('detail__')?'detail:'+key.slice(8):'core:'+key))));setAnswers(Object.fromEntries(Object.entries(nextAnswers).filter(([key])=>next.visibleIds.has(key))));setError('');return {nextValues,nextAnswers};}
 function setField(field,value){setFresh(field.id);return field.id.startsWith('q-')?update(values,{...answers,[field.id]:value}):update({...values,[field.key]:value},answers);}
 function go(key,dir=1){clearTimeout(advance.current);setBack(dir<0);setError('');setBriefOpen(false);setStepKey(key);}
 function validate(){
  if(step.kind!=='question')return true;const f=step.field,v=valueOf(f);
  if(f.type==='date'&&partial[f.id]){setError('Enter a full date, like 14 June 2027.');return false;}
  if(f.required&&!filled(v)){setError(['choice','multi'].includes(f.type)?(f.type==='multi'?'Choose at least one answer to continue.':'Choose one to continue.'):'Please answer this one to continue.');return false;}
  if(filled(v)&&f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){setError('That email address looks incomplete. Check it and try again.');return false;}
  if(filled(v)&&f.type==='url'){try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol))throw 0;}catch{setError('Use a complete link, starting with https://');return false;}}
  if(filled(v)&&f.type==='number'&&!Number.isFinite(Number(v))){setError('Enter a number.');return false;}
  if(isLast&&d.consentText&&values.consent!==true){setError('Confirm the note above before sending.');return false;}
  return true;
 }
 async function next(e){
  e?.preventDefault();if(busy)return;if(!validate()){formRef.current?.querySelector('input:not(.bf-hp input),textarea,select')?.focus();return;}
  if(step.kind!=='question'||!isLast){const following=all[all.findIndex(s=>s.key===step.key)+1];if(following)go(following.key);return;}
  const missing=questions.find(s=>s.field.required&&!filled(valueOf(s.field)));if(missing){go(missing.key,-1);setError('Answer this before sending.');return;}
  if(preview){setReceipt('Preview');return;}
  setBusy(true);setError('');
  try{
   const body={...Object.fromEntries(formFields(d).filter(f=>!f.id.startsWith('q-')&&!f.id.startsWith('detail:')).map(f=>[f.key,flow.active[f.id]||''])),website:values.website||'',formVersion:form.version,consent:values.consent===true,colours:String(flow.active['core:colours']||'').split(',').map(v=>v.trim()).filter(Boolean),details:Object.fromEntries(formFields(d).filter(f=>f.id.startsWith('detail:')).map(f=>[f.id.slice(7),flow.active[f.id]||''])),intakeAnswers:Object.fromEntries(d.questions.map(q=>[q.id,flow.active[q.id]??(q.type==='multi'?[]:'')]))};
   const r=await fetch(`/api/public/${studio.slug}/forms/${form.slug}/enquiries`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(body)}),result=await r.json();if(!r.ok)throw new Error(result.error);
   setReceipt(result.reference);try{sessionStorage.removeItem(storageKey);}catch{}if(window.parent!==window)window.parent.postMessage({type:'caleane:submitted',reference:result.reference},'*');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 function pick(option){
  const f=step.field;if(f.type==='multi'){const cur=valueOf(f)||[];setField(f,cur.includes(option)?cur.filter(o=>o!==option):[...cur,option]);return;}
  const {nextValues,nextAnswers}=setField(f,option);
  // A single choice moves on by itself, after a moment to see it chosen.
  if(isLast)return;const after=briefSteps(d,nextValues,nextAnswers).steps,i=after.findIndex(s=>s.key===step.key),target=after[i+1];
  clearTimeout(advance.current);if(target)advance.current=setTimeout(()=>go(target.key),420);
 }
 function onKey(e){
  if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target,tag=t.tagName;
  if(e.key==='Enter'){if(tag==='BUTTON'||tag==='A'||tag==='SELECT'||(tag==='TEXTAREA'&&e.shiftKey))return;if(rootRef.current?.querySelector('.bf-brief')?.contains(t))return;e.preventDefault();if(receipt)return;next();return;}
  if(step.kind==='question'&&['choice','multi'].includes(step.field.type)&&!(tag==='TEXTAREA'||(tag==='INPUT'&&!['radio','checkbox'].includes(t.type))||tag==='SELECT')&&/^[a-l]$/i.test(e.key)){const o=step.field.options?.[KEYS.indexOf(e.key.toUpperCase())];if(o){e.preventDefault();pick(o);}}
 }
 function clear(){try{sessionStorage.removeItem(storageKey);}catch{}setRemember(false);setValues({});setAnswers({});setStepKey('__welcome');setRequestKey(crypto.randomUUID());}

 const screen=step.screen,layout=step.kind==='welcome'?(screens[0]?.kind!=='welcome'&&IMAGE_LAYOUTS.includes(screens[0]?.layout)&&screens[0]?.imageUrl?screens[0].layout:'center'):screen?.layout,image=step.kind==='welcome'?screens[0]?.imageUrl:screen?.imageUrl;
 const media=!receipt&&IMAGE_LAYOUTS.includes(layout)&&image?layout:'',tone=useImageTone(media?image:'',(step.kind==='welcome'?screens[0]:screen)?.textTone);
 const onScreen=receipt||step.kind!=='question',chapters=chaptersOf(steps),answered=s=>filled(valueOf(s.field));
 const accent=d.accent||'#202326';
 const cls=['bf','palette-'+(theme.palette||'paper'),'shape-'+(theme.radius||'soft'),preview?'is-preview':'',!preview&&new URLSearchParams(location.search).get('embed')==='inline'?'is-inline':'',showBrief&&!onScreen?'has-brief':'',briefOpen?'brief-open':'',onScreen?'on-screen':'',media==='image-left'?'media-left':'',media==='image-right'?'media-right':'',media==='cover'?'media-cover':'',media?'mark-'+(media==='cover'?'light':tone):'',back?'going-back':''].filter(Boolean).join(' ');
 const brand=d.logoUrl?<img className="bf-logo" src={d.logoUrl} alt={studio.name}/>:<span>{studio.name}</span>;
 const count=questions.filter(answered).length;

 let body;
 if(receipt){
  const proof=questions.filter(answered);
  body=<div className="bf-q bf-ending"><p className="bf-inbrand">{brand}</p><h2 className="bf-title" tabIndex="-1">{d.successTitle}</h2><p className="bf-help">{d.successMessage}</p><div className="bf-proof"><header><span>Enquiry brief</span><span>{receipt==='Preview'?'Preview':receipt}</span></header><dl>{proof.map(s=><div key={s.key}><dt>{s.field.label}</dt><dd>{shown(s.field,valueOf(s.field))}</dd></div>)}</dl></div><ol className="bf-next" aria-label="What happens next"><li>{studio.name} reads your brief and may ask a question or two.</li><li>They reply to the email address you gave.</li><li>If you go ahead, your private client space opens with this brief inside.</li></ol>{preview&&<button type="button" className="bf-link" onClick={()=>{setReceipt('');clear();}}>Try the preview again</button>}</div>;
 }else if(step.kind==='welcome'){
  body=<div className="bf-q bf-welcome"><p className="bf-inbrand">{brand}</p><h1 className="bf-title" tabIndex="-1">{d.title}</h1>{d.description&&<p className="bf-help">{d.description}</p>}{showChapters&&chapters.length>1&&<ul className="bf-plan">{chapters.map(c=><li key={c.name}>{c.name}<span>{c.steps.length} {c.steps.length===1?'question':'questions'}</span></li>)}</ul>}<div className="bf-actions"><button type="submit" className="bf-btn">{screens[0]?.kind!=='welcome'&&screens[0]?.buttonLabel||'Start your brief'}<ArrowRight size={16} aria-hidden="true"/></button><span className="bf-hint">or press Enter</span></div></div>;
 }else if(step.kind==='statement'){
  body=<div className="bf-q bf-welcome"><p className="bf-inbrand">{brand}</p><h1 className="bf-title" tabIndex="-1">{screen.title}</h1>{screen.description&&<p className="bf-help">{screen.description}</p>}<div className="bf-actions">{index>0&&<button type="button" className="bf-back" onClick={()=>go(pool[index-1].key,-1)}><ArrowLeft size={15} aria-hidden="true"/>Back</button>}<button type="submit" className="bf-btn">{screen.buttonLabel||'Continue'}<ArrowRight size={16} aria-hidden="true"/></button></div></div>;
 }else{
  const f=step.field,v=valueOf(f),ch=chapters.find(c=>c.name===step.chapter),pos=ch?ch.steps.findIndex(s=>s.key===step.key)+1:0,name=f.id.startsWith('q-')?'intake__'+f.id:f.key;
  const eyebrow=[showChapters&&ch?`${ch.name} · ${pos} of ${ch.steps.length}`:'',f.required?'Required':''].filter(Boolean).join(' · ');
  let input;
  if(['choice','multi'].includes(f.type))input=<Choices field={f} value={v} name={name} onPick={pick} pictures={!!f.pictures&&f.id.startsWith('q-')}/>;
  else if(f.type==='date')input=<DateParts key={step.key} value={v} name={name} label={f.label} required={f.required} onChange={(iso,state)=>{setPartial(p=>({...p,[f.id]:state==='partial'}));setField(f,iso);}}/>;
  else if(f.type==='long')input=<textarea className="bf-field" name={name} aria-label={f.label} rows="2" maxLength={f.id.startsWith('q-')?1200:5000} placeholder="Start typing…" value={v} required={f.required} onChange={e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';setField(f,e.target.value);}}/>;
  else input=<input className="bf-field" name={name} aria-label={f.label} type={{email:'email',url:'url',number:'number'}[f.type]||'text'} inputMode={f.type==='number'?'decimal':undefined} value={v} required={f.required} placeholder={{email:'name@example.com',url:'https://',number:'0'}[f.type]||f.placeholder||'Start typing…'} autoComplete={f.key==='name'?'name':f.key==='email'?'email':'off'} maxLength={f.id.startsWith('q-')?500:f.key==='pinterest'?2000:f.key==='venue'?300:f.key==='email'?254:f.key.startsWith('detail__')?500:f.key==='colours'?300:120} onChange={e=>setField(f,e.target.value)}/>;
  body=<div className="bf-q">{eyebrow&&<p className="bf-eyebrow">{eyebrow}</p>}<h2 className="bf-title" tabIndex="-1">{step.title}</h2>{step.help&&<p className="bf-help">{step.help}</p>}{input}
   {error&&<p className="bf-err" role="alert">{error}</p>}
   {f.id==='core:email'&&<p className="bf-note">{studio.name} will save your brief and contact details in its private workspace to reply to your enquiry.{d.privacyUrl&&<> <a href={d.privacyUrl} target="_blank" rel="noreferrer">Read the privacy notice</a></>}</p>}
   {isLast&&d.consentText&&<label className="bf-consent"><input type="checkbox" checked={values.consent===true} onChange={e=>update({...values,consent:e.target.checked},answers)}/><span>{d.consentText}</span></label>}
   <div className="bf-actions">{index>0&&<button type="button" className="bf-back" onClick={()=>go(pool[index-1].key,-1)}><ArrowLeft size={15} aria-hidden="true"/>Back</button>}<button type="submit" className="bf-btn" disabled={busy}>{busy?'Sending…':isLast?d.submitLabel||'Send my brief':step.lastOnScreen&&screen.buttonLabel||'Continue'}{!busy&&<ArrowRight size={16} aria-hidden="true"/>}</button><span className="bf-hint">{['choice','multi'].includes(f.type)?'or press a letter':'or press Enter'}</span></div></div>;
 }

 return <div className="form-render-surface bf-frame"><div ref={rootRef} className={cls} style={{'--accent':accent,'--img-pos':screen?.imagePosition||'center'}} onKeyDown={onKey}>
  {media==='cover'&&<div className="bf-cover" style={{backgroundImage:`url("${image.replace(/"/g,'%22')}")`}} aria-hidden="true"/>}
  <span className="bf-mark" aria-hidden="true">{brand}</span>
  <header className="bf-top"><span className="bf-brand">{brand}</span>{showChapters&&chapters.length>0&&<div className="bf-chapters" aria-label="Progress">{chapters.map(c=>{const done=c.steps.filter(answered).length;return <div key={c.name} className={'bf-ch'+(step.chapter===c.name?' on':'')}><span>{c.name}</span><i><b style={{width:Math.round(done/c.steps.length*100)+'%'}}/></i></div>;})}</div>}{showBrief&&<button type="button" className="bf-brieftoggle" aria-expanded={briefOpen} onClick={()=>setBriefOpen(!briefOpen)}>Your brief <span>{count}</span></button>}</header>
  <main className={'bf-stage'+(media&&media!=='cover'?' layout-'+media:'')}>
   {media&&media!=='cover'&&<div className="bf-media" role={screen?.imageAlt?'img':undefined} aria-label={screen?.imageAlt||undefined} style={{backgroundImage:`url("${image.replace(/"/g,'%22')}")`,backgroundSize:screen?.imageFit==='contain'?'contain':'cover'}}/>}
   <div className="bf-content"><form ref={formRef} key={(receipt?'done':step.key)} className="bf-slide" onSubmit={next} noValidate>{body}<label className="bf-hp" aria-hidden="true">Leave this empty<input name="website" value={values.website||''} onChange={e=>update({...values,website:e.target.value},answers)} autoComplete="off" tabIndex="-1"/></label></form></div>
  </main>
  {showBrief&&!onScreen&&<aside className="bf-brief" aria-label="Your brief"><button type="button" className="bf-close" aria-label="Close your brief" onClick={()=>setBriefOpen(false)}><X size={18}/></button><h3>Your brief</h3><p>{studio.name} receives this as a project brief. Select any answer to change it.</p><dl>{questions.map(s=>{const v=valueOf(s.field),has=filled(v);return <div key={s.key} className={(s.key===step.key?'on ':'')+(fresh===s.field.id?'fresh':'')}><button type="button" onClick={()=>go(s.key,questions.indexOf(s)<questions.findIndex(x=>x.key===step.key)?-1:1)}><dt>{s.field.label}</dt><dd className={has?'':'is-empty'}>{has?shown(s.field,v):'Not answered yet'}</dd></button></div>;})}</dl></aside>}
  <footer className="bf-foot"><span>Powered by Caleane</span>{!preview&&!receipt&&<label className="bf-remember"><input type="checkbox" checked={remember} onChange={e=>{setRemember(e.target.checked);if(!e.target.checked)try{sessionStorage.removeItem(storageKey);}catch{}}}/>Remember my answers in this tab</label>}</footer>
 </div></div>;
}
