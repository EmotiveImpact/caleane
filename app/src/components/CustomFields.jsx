import React,{useEffect,useId,useState} from 'react';
import {ArrowDown,ArrowUp,LockKeyhole,Paperclip,Plus,Trash2,X} from 'lucide-react';
import {WorkspaceButton,WorkspaceField,WorkspaceSelect} from './workspace/WorkspaceUI';
import {FIELD_CURRENCIES,FIELD_IDEAS,FIELD_TYPES,displayValue,loadFieldDefinitions,onFieldDefinitions,storeFieldDefinitions} from '../lib/custom-fields';
import './custom-fields.css';

const NONE='__none';
const kindLabel={client:'Client fields',project:'Project fields'};

export function useFieldDefinitions(studio,request){
 const [fields,setFields]=useState(null);
 useEffect(()=>{let live=true;loadFieldDefinitions(studio.id,request).then(f=>{if(live)setFields(f);}).catch(()=>{if(live)setFields({client:[],project:[]});});const off=onFieldDefinitions((id,f)=>{if(live&&id===studio.id)setFields(f);});return()=>{live=false;off();};},[studio.id,request]);
 return fields;
}

// With max set, the first few tags show and the rest fold into a quiet "+2".
export function TagChips({tags,className='',max}){
 if(!tags?.length)return null;
 const shown=max?tags.slice(0,max):tags,rest=tags.slice(shown.length);
 return <ul className={'cf-tags '+className} aria-label="Tags">{shown.map(tag=><li key={tag}>{tag}</li>)}{rest.length>0&&<li className="cf-tags-more" title={rest.join(', ')}><span aria-hidden="true">+{rest.length}</span><span className="sr-only">and {rest.length} more: {rest.join(', ')}</span></li>}</ul>;
}

// True while the record lays out in one column, so the studio details can sit
// high on the page instead of under everything else.
export function useMediaQuery(query){
 const [matches,setMatches]=useState(()=>typeof window!=='undefined'&&!!window.matchMedia?.(query).matches);
 useEffect(()=>{const media=window.matchMedia?.(query);if(!media)return;const update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[query]);
 return matches;
}

function TagInput({value,onChange,suggestions=[]}){
 const [draft,setDraft]=useState(''),listId=useId();
 const add=raw=>{const parts=raw.split(',').map(t=>t.trim().replace(/\s+/g,' ')).filter(Boolean);if(!parts.length)return;const next=[...value];for(const tag of parts)if(!next.some(t=>t.toLowerCase()===tag.toLowerCase())&&next.length<20)next.push(tag.slice(0,50));onChange(next);setDraft('');};
 return <div className="cf-tag-input">
  <span className="cf-label" id={listId+'-label'}>Tags</span>
  <div className="cf-tag-box">{value.map(tag=><span className="cf-tag-edit" key={tag}>{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={()=>onChange(value.filter(t=>t!==tag))}><X size={12}/></button></span>)}
   <input aria-labelledby={listId+'-label'} list={listId} value={draft} maxLength={60} placeholder={value.length?'Add another':'Wedding, referral, 2027…'} onChange={e=>{if(e.target.value.includes(','))add(e.target.value);else setDraft(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add(draft);}else if(e.key==='Backspace'&&!draft&&value.length)onChange(value.slice(0,-1));}} onBlur={()=>add(draft)}/>
  </div>
  <datalist id={listId}>{suggestions.filter(s=>!value.includes(s)).map(s=><option key={s} value={s}/>)}</datalist>
  <small>Press Enter or type a comma after each tag.</small>
 </div>;
}

const readBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
const YESNO=[{value:NONE,label:'Not set'},{value:'yes',label:'Yes'},{value:'no',label:'No'}];
function FileFieldInput({field,value,onChange,onUpload}){
 const [state,setState]=useState('');
 async function pick(e){const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>6000000){setState('Choose a file below 6 MB.');return;}setState('Uploading…');try{const saved=await onUpload({name:file.name,content:await readBase64(file)});onChange({fileId:saved.id,name:saved.name});setState('');}catch(err){setState(err.message);}}
 return <div className="cf-file-input"><span className="cf-label">{field.label}</span>{value?.fileId?<span className="cf-file-chosen"><Paperclip size={13}/>{value.name}<button type="button" aria-label={`Remove ${value.name}`} onClick={()=>onChange('')}><X size={12}/></button></span>:<label className="cf-file-pick"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label={field.label} onChange={pick}/>Choose a PDF or image</label>}{state&&<small role="status">{state}</small>}</div>;
}
function FieldInput({field,value,onChange,onUpload}){
 if(field.type==='file')return <FileFieldInput field={field} value={value} onChange={onChange} onUpload={onUpload}/>;
 if(field.type==='yesno')return <WorkspaceField label={field.label}><WorkspaceSelect label={field.label} value={value===true||value==='yes'?'yes':value===false||value==='no'?'no':NONE} onValueChange={v=>onChange(v===NONE?'':v==='yes')} options={YESNO}/></WorkspaceField>;
 if(field.type==='money')return <WorkspaceField label={`${field.label} (${field.currency||'GBP'})`} type="number" step="0.01" min="0" value={value??''} onChange={e=>onChange(e.target.value)}/>;
 if(field.type==='link')return <WorkspaceField label={field.label} type="url" placeholder="https://" maxLength={500} value={value??''} onChange={e=>onChange(e.target.value)}/>;
 if(field.type==='choice')return <WorkspaceField label={field.label}><WorkspaceSelect label={field.label} value={value||NONE} onValueChange={v=>onChange(v===NONE?'':v)} options={[{value:NONE,label:'Not set'},...field.options.map(o=>({value:o,label:o}))]}/></WorkspaceField>;
 return <WorkspaceField label={field.label} type={field.type==='number'?'number':field.type==='date'?'date':'text'} step={field.type==='number'?'any':undefined} maxLength={field.type==='text'?500:undefined} value={value??''} onChange={e=>onChange(e.target.value)}/>;
}

// The studio's private tags and fields on one client or project, shown as a
// box beside the record's other details and edited in place.
// A link or file value opens from the record; everything else reads as text.
function FieldValue({field,value,studioId}){
 const text=displayValue(field,value);if(!text)return 'Not set';
 if(field.type==='link')return <a href={value} target="_blank" rel="noreferrer noopener">{text}</a>;
 if(field.type==='file'&&studioId)return <a href={`/api/custom-fields/files/${value.fileId}?studio=${studioId}`} target="_blank" rel="noreferrer"><Paperclip size={12}/>{text}</a>;
 return text;
}

export function StudioDetails({kind,record,definitions,tagSuggestions,onSave,onManage,busy,className='',studioId,request}){
 const fields=definitions?.[kind]||[],[editing,setEditing]=useState(false),[tags,setTags]=useState([]),[values,setValues]=useState({}),[error,setError]=useState('');
 useEffect(()=>{setEditing(false);setError('');},[record.id]);
 function start(){setTags(record.tags||[]);setValues(Object.fromEntries(fields.map(f=>[f.id,record.customFields?.[f.id]??''])));setError('');setEditing(true);}
 async function save(e){e.preventDefault();setError('');try{const ok=await onSave({tags,fields:values});if(ok)setEditing(false);}catch(err){setError(err.message);}}
 const filled=fields.filter(f=>record.customFields?.[f.id]!==undefined&&record.customFields[f.id]!=='');
 const upload=async body=>(await request(`/api/custom-fields/files?studio=${studioId}`,'POST',body)).file;
 return <section className={'cf-details '+className} aria-label="Studio details">
  <header><div><h3>Studio details</h3><p><LockKeyhole size={12}/>Only visible to your studio</p></div>{!editing&&<WorkspaceButton variant="ghost" size="small" onClick={start}>Edit</WorkspaceButton>}</header>
  {editing?<form onSubmit={save}>
   <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions}/>
   {fields.length>0&&<div className="cf-field-grid">{fields.map(f=><FieldInput key={f.id} field={f} value={values[f.id]} onUpload={upload} onChange={v=>setValues(prev=>({...prev,[f.id]:v}))}/>)}</div>}
   {error&&<p className="cf-error" role="alert">{error}</p>}
   <div className="cf-actions"><WorkspaceButton type="submit" size="small" disabled={busy}>Save details</WorkspaceButton><WorkspaceButton variant="ghost" size="small" onClick={()=>setEditing(false)}>Cancel</WorkspaceButton></div>
  </form>:<>
   {record.tags?.length?<TagChips tags={record.tags}/>:<p className="cf-muted">No tags yet.</p>}
   {fields.length>0?<dl className="cf-values">{fields.map(f=><div key={f.id}><dt>{f.label}</dt><dd className={filled.includes(f)?'':'is-empty'}><FieldValue field={f} value={record.customFields?.[f.id]} studioId={studioId}/></dd></div>)}</dl>:<p className="cf-muted">Track the details that matter to your work, such as a venue or guest count. {onManage&&<button type="button" className="cf-link" onClick={onManage}>Set up your fields</button>}</p>}
  </>}
 </section>;
}

function FieldRow({field,index,count,onChange,onMove,onRemove}){
 const [options,setOptions]=useState((field.options||[]).join(', '));
 useEffect(()=>{setOptions((field.options||[]).join(', '));},[field.id]);
 return <li className="cf-setting-row">
  <div className="cf-setting-fields">
   <WorkspaceField label="Field name" value={field.label} maxLength={60} required onChange={e=>onChange({...field,label:e.target.value})}/>
   <WorkspaceField label="Type"><WorkspaceSelect label="Type" value={field.type} onValueChange={type=>onChange({...field,type,options:type==='choice'?field.options||[]:undefined,currency:type==='money'?field.currency||'GBP':undefined})} options={FIELD_TYPES}/></WorkspaceField>
   {field.type==='money'&&<WorkspaceField label="Currency"><WorkspaceSelect label="Currency" value={field.currency||'GBP'} onValueChange={currency=>onChange({...field,currency})} options={FIELD_CURRENCIES.map(value=>({value,label:value}))}/></WorkspaceField>}
   {field.type==='choice'&&<WorkspaceField className="cf-setting-wide" label="Choices" hint="Separate each choice with a comma." value={options} required maxLength={1300} onChange={e=>{setOptions(e.target.value);onChange({...field,options:e.target.value.split(',').map(o=>o.trim()).filter(Boolean)});}}/>}
  </div>
  <div className="cf-setting-actions">
   <WorkspaceButton variant="ghost" size="small" iconOnly aria-label={`Move ${field.label||'field'} up`} disabled={index===0} onClick={()=>onMove(-1)}><ArrowUp size={15}/></WorkspaceButton>
   <WorkspaceButton variant="ghost" size="small" iconOnly aria-label={`Move ${field.label||'field'} down`} disabled={index===count-1} onClick={()=>onMove(1)}><ArrowDown size={15}/></WorkspaceButton>
   <WorkspaceButton variant="ghost" size="small" iconOnly aria-label={`Remove ${field.label||'field'}`} onClick={onRemove}><Trash2 size={15}/></WorkspaceButton>
  </div>
 </li>;
}

export function CustomFieldSettings({studio,request}){
 const [form,setForm]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;loadFieldDefinitions(studio.id,request).then(f=>{if(live)setForm(structuredClone(f));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[studio.id,request]);
 if(!form)return <p className="commerce-muted">{error||'Loading custom fields…'}</p>;
 const set=(kind,list)=>{setSaved(false);setForm({...form,[kind]:list});};
 const add=(kind,field={label:'',type:'text'})=>set(kind,[...form[kind],{...field,key:Math.random().toString(36).slice(2)}]);
 const taken=new Set([...form.client,...form.project].map(f=>f.label.toLowerCase()));
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const strip=list=>list.map(({key,...f})=>f);const d=await request(`/api/custom-fields?studio=${studio.id}`,'PUT',{client:strip(form.client),project:strip(form.project)});storeFieldDefinitions(studio.id,d.fields);setForm(structuredClone(d.fields));setSaved(true);}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <div className="settings-pane-layout">
  <form className="settings-pane-form cf-settings" onSubmit={save}>
   <header className="settings-pane-heading"><h2>Custom fields and tags</h2><p>Add the details your work depends on to every client and project record. They stay private to your studio and never appear in the client portal.</p></header>
   {['client','project'].map(kind=><section key={kind} className="cf-setting-group">
    <header><h3>{kindLabel[kind]}</h3><span>{form[kind].length} of 20</span></header>
    {form[kind].length?<ul>{form[kind].map((field,index)=><FieldRow key={field.id||field.key} field={field} index={index} count={form[kind].length} onChange={next=>set(kind,form[kind].map((f,i)=>i===index?next:f))} onMove={step=>{const list=[...form[kind]];[list[index],list[index+step]]=[list[index+step],list[index]];set(kind,list);}} onRemove={()=>set(kind,form[kind].filter((_,i)=>i!==index))}/>)}</ul>:<p className="cf-muted">No {kind} fields yet.</p>}
    <WorkspaceButton variant="secondary" size="small" disabled={form[kind].length>=20} onClick={()=>add(kind)}><Plus size={15}/>Add a {kind} field</WorkspaceButton>
   </section>)}
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <div className="commerce-form-actions"><WorkspaceButton type="submit" disabled={busy}>Save custom fields</WorkspaceButton>{saved&&<span className="cf-saved" role="status">Saved</span>}</div>
  </form>
  <aside className="settings-support"><h3>Ideas to start with</h3><p>Add one, then rename it or change its choices to suit you.</p><ul className="cf-ideas">{FIELD_IDEAS.filter(idea=>!taken.has(idea.label.toLowerCase())).map(idea=><li key={idea.label}><button type="button" onClick={()=>add(idea.kind,{label:idea.label,type:idea.type,...(idea.options?{options:idea.options}:{}),...(idea.currency?{currency:idea.currency}:{})})}><Plus size={14}/><span><strong>{idea.label}</strong><small>{idea.kind==='client'?'Client':'Project'} · {FIELD_TYPES.find(t=>t.value===idea.type).label}</small></span></button></li>)}</ul><h3>Tags</h3><p>Tags need no setting up. Type them on any client or project, then filter by them in Clients and Projects.</p><p>Removing a field also removes what was recorded in it on every record.</p></aside>
 </div>;
}
