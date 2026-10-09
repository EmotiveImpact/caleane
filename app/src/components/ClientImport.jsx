import React,{useMemo,useRef,useState} from 'react';
import {CheckCircle2,Download,FileSpreadsheet,Upload} from 'lucide-react';
import {WorkspaceButton,WorkspaceDialog,WorkspaceSelect} from './workspace/WorkspaceUI';
import {useFieldDefinitions} from './CustomFields';
import {BASE_FIELDS,IMPORT_STAGES,MAX_IMPORT_ROWS,TEMPLATE_CSV,guessMapping,parseCsv,reviewImport,rowToClient} from '../lib/client-import';
import './client-import.css';

const NONE='__none';
const PREVIEW=8;
const MAX_FILE=4_000_000;

// Bring clients across from HoneyBook, Dubsado or a spreadsheet in three steps:
// choose a CSV, match its columns, then import the rows that are ready.
export function ClientImport({open,onOpenChange,studio,clients,request,onImported}){
 const definitions=useFieldDefinitions(studio,request),customFields=definitions?.client||[];
 const [file,setFile]=useState(null),[mapping,setMapping]=useState({}),[stage,setStage]=useState('Active'),[tag,setTag]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[result,setResult]=useState(null),[dragging,setDragging]=useState(false);
 const input=useRef(null);
 const targets=useMemo(()=>[...BASE_FIELDS,...customFields.map(f=>({key:'field:'+f.id,label:f.label,hint:'One of your studio fields.'}))],[customFields]);
 const reviewed=useMemo(()=>file?reviewImport(file.rows.map((r,i)=>rowToClient(file.headers,r,mapping,file.lines[i])),{existingEmails:clients.map(c=>c.email),customFields}):[],[file,mapping,clients,customFields]);
 const ready=reviewed.filter(r=>!r.problem),skipped=reviewed.filter(r=>r.problem);
 const missing=!mapping.email?'Choose the column that holds email addresses.':!mapping.name&&!mapping.firstName&&!mapping.lastName?'Choose the column that holds names.':'';

 function reset(){setFile(null);setMapping({});setStage('Active');setTag('');setError('');setResult(null);setWorking(false);}
 function close(next){if(working)return;onOpenChange(next);if(!next)reset();}
 async function read(chosen){
  setError('');
  if(!chosen)return;
  if(!/\.(csv|txt|tsv)$/i.test(chosen.name)&&!/csv|text\/plain|tab-separated/i.test(chosen.type)){setError('Choose a CSV file. In Excel, Numbers or Google Sheets, save or download the sheet as CSV first.');return;}
  if(chosen.size>MAX_FILE){setError('This file is larger than 4 MB. Split it into smaller files and import each one.');return;}
  let text;try{text=await chosen.text();}catch{setError('Caleane couldn’t read that file. Please try again.');return;}
  const parsed=parseCsv(text);
  if(!parsed.headers.length||!parsed.rows.length){setError('This file has no clients in it. The first row should hold column names, with one client on each row below.');return;}
  if(parsed.rows.length>MAX_IMPORT_ROWS){setError(`This file has ${parsed.rows.length.toLocaleString('en-GB')} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString('en-GB')} at a time by splitting the file.`);return;}
  setFile({name:chosen.name,...parsed});setMapping(guessMapping(parsed.headers,customFields));
 }
 async function importReady(){
  setWorking(true);setError('');
  try{
   const rows=reviewed.flatMap((r,i)=>r.problem?[]:[rowToClient(file.headers,file.rows[i],mapping,file.lines[i])]);
   const d=await request(`/api/clients/import?studio=${studio.id}`,'POST',{rows,stage,tag,fileName:file.name.slice(0,120)});
   setResult({created:d.clients.length,skipped:[...skipped,...d.skipped.map(s=>({row:s.row,problem:s.reason,client:{name:s.name,email:s.email}}))]});
   onImported(d.clients);
  }catch(e){setError(e.message);}finally{setWorking(false);}
 }
 const sample=key=>{const index=mapping[key]?file.headers.indexOf(mapping[key]):-1;return index<0?'':file.rows.map(r=>r[index]).find(Boolean)||'';};
 const template='data:text/csv;charset=utf-8,'+encodeURIComponent(TEMPLATE_CSV);

 return <WorkspaceDialog open={open} onOpenChange={close} className="client-import" title={result?'Clients imported':'Import clients'} description={result?undefined:file?`${file.name} · ${file.rows.length.toLocaleString('en-GB')} ${file.rows.length===1?'row':'rows'}. Check the columns match, then import.`:'Bring your client list across from HoneyBook, Dubsado or any spreadsheet.'}>
  {result?<div className="client-import-done">
   <p className="client-import-summary"><CheckCircle2 size={20} aria-hidden="true"/><span><strong>{result.created.toLocaleString('en-GB')} {result.created===1?'client':'clients'} added</strong> to your directory{result.skipped.length?`. ${result.skipped.length} ${result.skipped.length===1?'row was':'rows were'} skipped.`:'.'}</span></p>
   {result.skipped.length>0&&<SkippedList rows={result.skipped}/>}
   <div className="client-import-actions"><WorkspaceButton onClick={()=>close(false)}>Done</WorkspaceButton></div>
  </div>:!file?<div className="client-import-start">
   <div className={'client-import-drop'+(dragging?' is-dragging':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);read(e.dataTransfer.files[0]);}}>
    <FileSpreadsheet size={28} strokeWidth={1.5} aria-hidden="true"/>
    <strong>Drop a CSV file here</strong>
    <span>or</span>
    <WorkspaceButton variant="secondary" onClick={()=>input.current?.click()}><Upload size={16}/>Choose a file</WorkspaceButton>
    <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden aria-label="Choose a CSV file" onChange={e=>{read(e.target.files[0]);e.target.value='';}}/>
   </div>
   {error&&<p role="alert" className="client-import-error">{error}</p>}
   <ul className="client-import-help">
    <li><strong>HoneyBook or Dubsado</strong><span>Export your contacts or clients list as a CSV file.</span></li>
    <li><strong>A spreadsheet</strong><span>In Excel, Numbers or Google Sheets, save or download the sheet as CSV, with column names on the first row.</span></li>
   </ul>
   <p className="client-import-note">Each client needs a name and an email address. Anyone already in your clients is left as they are. Nobody is emailed or invited.</p>
   <a className="client-import-template" href={template} download="caleane-clients-template.csv"><Download size={15} aria-hidden="true"/>Download a template</a>
  </div>:<div className="client-import-match">
   <section aria-labelledby="client-import-columns">
    <h3 id="client-import-columns">Match your columns</h3>
    <div className="client-import-fields">
     {targets.map(t=>{const value=sample(t.key);return <div key={t.key} className="client-import-field">
      <strong>{t.label}{t.key==='email'&&<em> required</em>}</strong>
      <WorkspaceSelect label={`Column for ${t.label}`} value={mapping[t.key]||NONE} onValueChange={v=>setMapping(m=>{const next={...m};if(v===NONE)delete next[t.key];else next[t.key]=v;return next;})} options={[{value:NONE,label:'Not in this file'},...file.headers.map(h=>({value:h,label:h}))]}/>
      <small className="client-import-sample">{value?<>e.g. {value}</>:t.hint||'\u00a0'}</small>
     </div>;})}
    </div>
   </section>
   <section className="client-import-settings" aria-label="Settings for every imported client">
    <label className="client-import-setting"><span>Relationship stage</span><WorkspaceSelect label="Relationship stage" value={stage} onValueChange={setStage} options={IMPORT_STAGES}/></label>
    <label className="client-import-setting"><span>Tag everyone (optional)</span><input value={tag} maxLength={50} onChange={e=>setTag(e.target.value)} placeholder="For example, HoneyBook"/></label>
   </section>
   <section aria-labelledby="client-import-preview">
    <h3 id="client-import-preview">Check before importing</h3>
    {missing?<p className="client-import-error" role="status">{missing}</p>:<>
     <p className="client-import-counts" role="status"><strong>{ready.length.toLocaleString('en-GB')} ready to import</strong>{skipped.length>0&&<span>{skipped.length} will be skipped</span>}</p>
     <ol className="client-import-rows">{reviewed.slice(0,PREVIEW).map(r=><li key={r.row} className={r.problem?'is-skipped':''}>
      <span className="client-import-row-number">Row {r.row}</span>
      <span><strong>{r.client.name||'No name'}</strong><small>{[r.client.email,r.client.company].filter(Boolean).join(' · ')||'No email'}</small>{r.notes.map(n=><small key={n} className="client-import-row-note">{n}</small>)}</span>
      <span className="client-import-row-state">{r.problem||'Ready'}</span>
     </li>)}</ol>
     {reviewed.length>PREVIEW&&<p className="client-import-more">And {(reviewed.length-PREVIEW).toLocaleString('en-GB')} more {reviewed.length-PREVIEW===1?'row':'rows'}.</p>}
     {skipped.length>0&&<SkippedList rows={skipped}/>}
    </>}
   </section>
   {error&&<p role="alert" className="client-import-error">{error}</p>}
   <div className="client-import-actions">
    <WorkspaceButton variant="secondary" disabled={working} onClick={()=>{setFile(null);setMapping({});setError('');}}>Choose another file</WorkspaceButton>
    <WorkspaceButton loading={working} disabled={!!missing||!ready.length} onClick={importReady}>{ready.length?`Import ${ready.length.toLocaleString('en-GB')} ${ready.length===1?'client':'clients'}`:'Nothing to import'}</WorkspaceButton>
   </div>
  </div>}
 </WorkspaceDialog>;
}

function SkippedList({rows}){
 return <details className="client-import-skipped"><summary>See the {rows.length===1?'skipped row':`${rows.length} skipped rows`}</summary><ul>{rows.map(r=><li key={r.row}><span>Row {r.row}</span><span>{r.client.name||r.client.email||'Blank row'}</span><span>{r.problem}</span></li>)}</ul></details>;
}
