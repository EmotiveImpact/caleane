import React,{useEffect,useRef,useState} from 'react';
import {FileText,Image as ImageIcon,ImagePlus,X} from 'lucide-react';
import {readReply} from '../lib/read-reply.js';
export function intakeFormValues(data,questions,prefix='intake__'){return Object.fromEntries(questions.map(q=>[q.id,['multi','file'].includes(q.type)?data.getAll(prefix+q.id):String(data.get(prefix+q.id)||'')]));}
// File answers are {id,name} while a visitor fills the form in and plain names once saved.
export function answerText(value){return Array.isArray(value)?value.map(item=>item?.name??item).join(', '):value||'';}
export const answerForSending=(question,value)=>question.type==='file'?(value||[]).map(item=>item?.id??item):value;
export function QuestionInput({question:q,value,onChange,disabled=false,name='intake__'+q.id,presentation='default',hideLabel=false,uploadUrl=null}){
 const common={name,'aria-label':q.label,disabled,required:q.required,placeholder:q.placeholder||'',onChange:e=>onChange?.(e.target.value),...(onChange?{value:value??''}:{defaultValue:value??''})};
 const helpId='help-'+q.id;
 if(q.type==='file')return <FileAnswer question={q} value={value} onChange={onChange} disabled={disabled} name={name} hideLabel={hideLabel} uploadUrl={uploadUrl}/>;
 if(presentation==='cards'&&['choice','multi'].includes(q.type))return <ChoiceInput question={q} value={value} onChange={onChange} disabled={disabled} name={name} hideLabel={hideLabel}/>;
 return <div className="form-question-input"><label className="field"><span className={hideLabel?'sr-only':undefined}>{q.label}{!q.required&&<small> Optional</small>}</span>{q.type==='multi'?null:q.type==='choice'?<select {...common} aria-describedby={q.help?helpId:undefined}><option value="">Choose an answer</option>{q.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:q.type==='long'?<textarea {...common} rows="4" maxLength="1200" aria-describedby={q.help?helpId:undefined}/>:<input {...common} type={['number','date','email','url'].includes(q.type)?q.type:'text'} step={q.type==='number'?'any':undefined} maxLength="500" aria-describedby={q.help?helpId:undefined}/>}</label>
 {q.type==='multi'&&<fieldset aria-describedby={q.help?helpId:undefined}><legend className="sr-only">{q.label}</legend>{q.options.map(option=><label key={option} className="form-check"><input type="checkbox" name={name} value={option} disabled={disabled} {...(onChange?{checked:(value||[]).includes(option),onChange:e=>onChange(e.target.checked?[...(value||[]),option]:(value||[]).filter(v=>v!==option))}:{defaultChecked:(value||[]).includes(option)})}/>{option}</label>)}</fieldset>}
 {q.help&&<p id={helpId} className="form-help">{q.help}</p>}</div>;
}

// Native inputs preserve keyboard navigation and validation while the whole answer is clickable.
export function ChoiceInput({question:q,value,onChange,disabled=false,name=q.id,hideLabel=false}){
 const multi=q.type==='multi',helpId='choice-help-'+q.id;
 return <fieldset className="form-choice-group" aria-describedby={helpId} data-field-id={q.id}>
  <legend className={hideLabel?'form-label-hidden':undefined}>{q.label}</legend>
  <p id={helpId} className="form-choice-hint">{q.help||(multi?'Choose all that apply.':'Choose one answer.')}{!q.required&&' Optional.'}</p>
  <div className="form-choice-options">{q.options.map((option,index)=><label className="form-choice-option" key={index}>
   <input type={multi?'checkbox':'radio'} name={name} value={option} disabled={disabled} required={!multi&&q.required} checked={multi?(value||[]).includes(option):value===option} onChange={e=>onChange(multi?(e.target.checked?[...(value||[]),option]:(value||[]).filter(v=>v!==option)):option)}/>
   <span>{option}</span>
  </label>)}</div>
  {!multi&&!q.required&&value&&<button type="button" className="text-button form-choice-clear" onClick={()=>onChange('')}>Clear selection</button>}
 </fieldset>;
}

const MAX_FILES=5,MAX_BYTES=5*1024*1024,ACCEPT=['image/png','image/jpeg','image/webp','application/pdf'];
const readBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('We could not read that file.'));reader.readAsDataURL(file);});
const previewOf=file=>{try{return file.type.startsWith('image/')?URL.createObjectURL(file):'';}catch{return '';}};
const sizeText=bytes=>bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB';
// A file question. Each file uploads as soon as it is chosen or dropped and the answer keeps its reference.
export function FileAnswer({question:q,value,onChange,disabled=false,name='intake__'+q.id,hideLabel=false,uploadUrl=null}){
 // A saved brief has no upload address: its file names are shown and kept as they are.
 const editable=!!onChange&&uploadUrl!==null;
 const [busy,setBusy]=useState(0),[error,setError]=useState(''),[over,setOver]=useState(false),[local,setLocal]=useState({}),input=useRef(null),files=Array.isArray(value)?value:[],helpId='file-help-'+q.id,full=files.length>=MAX_FILES;
 const localRef=useRef(local);localRef.current=local;
 useEffect(()=>()=>Object.values(localRef.current).forEach(item=>item.preview&&URL.revokeObjectURL(item.preview)),[]);
 async function add(chosen){
  setError('');if(!chosen.length)return;
  if(!uploadUrl){setError('Files can be added on the live form.');return;}
  if(files.length+chosen.length>MAX_FILES){setError(`Add up to ${MAX_FILES} files.`);return;}
  const wrong=chosen.find(file=>file.type&&!ACCEPT.includes(file.type));if(wrong){setError(`“${wrong.name}” is not an image or a PDF.`);return;}
  const tooBig=chosen.find(file=>file.size>MAX_BYTES);if(tooBig){setError(`“${tooBig.name}” is larger than 5 MB.`);return;}
  setBusy(chosen.length);let next=files;
  try{for(const file of chosen){const r=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,content:await readBase64(file)})}),d=await readReply(r);if(!r.ok)throw new Error(d.error||'That file could not be uploaded.');
   const preview=previewOf(file);setLocal(prev=>({...prev,[d.upload.id]:{size:file.size,preview}}));
   next=[...next,{id:d.upload.id,name:d.upload.name}];onChange?.(next);setBusy(n=>Math.max(0,n-1));}}
  catch(e){setError(e.message);}finally{setBusy(0);}
 }
 const choose=event=>{const chosen=[...event.target.files];event.target.value='';add(chosen);};
 const canAdd=editable&&!disabled&&!busy&&!full;
 const drop=event=>{event.preventDefault();setOver(false);if(canAdd)add([...event.dataTransfer.files]);};
 return <fieldset className="form-file-answer" aria-describedby={helpId} data-field-id={q.id}>
  <legend className={hideLabel?'form-label-hidden':undefined}>{q.label}{!q.required&&<small> Optional</small>}</legend>
  {q.help&&<p className="form-choice-hint">{q.help}</p>}
  {editable&&<div className={'form-drop'+(over?' is-over':'')+(full?' is-full':'')} onDragOver={event=>{event.preventDefault();if(canAdd)setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={drop}>
   <input ref={input} hidden type="file" accept={ACCEPT.join(',')} multiple disabled={!canAdd} onChange={choose}/>
   <span className="form-drop-icon" aria-hidden="true"><ImagePlus size={22} strokeWidth={1.6}/></span>
   <strong>{busy?`Uploading ${busy===1?'your file':busy+' files'}…`:full?'That’s the most you can add':files.length?'Add more images or PDFs':<><span className="form-drop-fine">Drop your images or PDFs here</span><span className="form-drop-touch">Add your images or PDFs</span></>}</strong>
   <span id={helpId} className="form-drop-limits">{full?`${MAX_FILES} of ${MAX_FILES} files added. Remove one to add another.`:`Up to ${MAX_FILES} files, 5 MB each${files.length?` · ${files.length} of ${MAX_FILES} added`:''}`}</span>
   {!full&&<button type="button" className="form-drop-button" aria-describedby={helpId} disabled={!canAdd} onClick={()=>input.current?.click()}>{files.length?'Add another file':'Choose files'}</button>}
  </div>}
  {!editable&&<p id={helpId} className="form-choice-hint">{files.length?`${files.length} ${files.length===1?'file':'files'} shared`:'No files shared.'}</p>}
  {files.length>0&&<ul className="form-file-list">{files.map((file,index)=>{const label=file?.name??file,meta=local[file?.id],pdf=/\.pdf$/i.test(label);return <li key={(file?.id||file)+index}>
   <span className="form-file-thumb" aria-hidden="true">{meta?.preview?<img src={meta.preview} alt=""/>:pdf?<><FileText size={20} strokeWidth={1.6}/><small>PDF</small></>:<ImageIcon size={20} strokeWidth={1.6}/>}</span>
   <span className="form-file-name"><span>{label}</span>{meta?.size?<small>{sizeText(meta.size)}</small>:null}</span>
   {editable&&!disabled&&<button type="button" className="form-file-remove" aria-label={`Remove ${label}`} onClick={()=>onChange(files.filter((_,i)=>i!==index))}><X size={16}/></button>}{!editable&&<input type="hidden" name={name} value={label}/>}</li>;})}</ul>}
  {error&&<p className="form-file-error" role="alert">{error}</p>}
 </fieldset>;
}
