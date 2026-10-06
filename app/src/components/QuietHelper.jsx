import React,{useEffect,useState} from 'react';
import {Copy,PenLine,RotateCcw} from 'lucide-react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import './quiet-helper.css';

// The quiet helper drafts text for the owner to read, edit and then use themselves.
// It renders nothing when the helper is off, so the studio never sees a dead button.
const status=new Map();
function helperEnabled(studio,request){
 if(!status.has(studio.id))status.set(studio.id,request('/api/assistant?studio='+studio.id).then(d=>!!d.enabled,()=>{status.delete(studio.id);return false;}));
 return status.get(studio.id);
}
const COPY={
 reply:{title:'Draft a reply',start:'Draft a reply',intro:'A first draft in your voice, from this conversation.'},
 recap:{title:'Recap before a call',start:'Recap this project',intro:'One paragraph on where things stand, for you to read before you speak to the client.'},
 'follow-up':{title:'Follow-up draft',start:'Draft a follow-up',intro:'A gentle note to pick things up again, for you to check before it goes.'}
};

export function QuietHelper({studio,request,kind,target,useLabel,onUse,className=''}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(''),[draft,setDraft]=useState(null),[text,setText]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const copy=COPY[kind],targetKey=JSON.stringify(target);
 useEffect(()=>{let live=true;helperEnabled(studio,request).then(on=>{if(live)setEnabled(on);});return()=>{live=false;};},[studio.id]);
 useEffect(()=>{setDraft(null);setText('');setError('');},[targetKey]);
 if(!enabled)return null;
 async function write(){setBusy('write');setError('');setCopied(false);try{const d=await request('/api/assistant?studio='+studio.id,'POST',{kind,...target});setDraft(d.draft);setText(d.draft.text);}catch(e){setError(e.message);}finally{setBusy('');}}
 async function use(){setBusy('use');setError('');try{const done=await onUse(text.trim());if(done!==false){setDraft(null);setText('');}}catch(e){setError(e.message);}finally{setBusy('');}}
 async function copyText(){try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setError('Copying is blocked in this browser. Select the text and copy it instead.');}}
 return <section className={'quiet-helper '+className} aria-label={copy.title}>
  <header><PenLine size={15} aria-hidden="true"/><strong>{copy.title}</strong><small>Draft only</small></header>
  {!draft&&<><p>{copy.intro} Nothing is sent or saved unless you choose to.</p>
   <WorkspaceButton variant="secondary" size="small" loading={busy==='write'} disabled={!!busy} onClick={write}>{busy==='write'?'Drafting…':copy.start}</WorkspaceButton></>}
  {draft&&<>
   <label className="quiet-helper-draft"><span className="sr-only">Edit the draft</span><textarea value={text} onChange={e=>{setText(e.target.value);setCopied(false);}} rows={kind==='recap'?7:6} maxLength="5000"/></label>
   <p className="quiet-helper-note">Written from {draft.basedOn}. Read it through and change anything before you use it.</p>
   <div className="quiet-helper-actions">
    {onUse&&<WorkspaceButton variant="primary" size="small" loading={busy==='use'} disabled={!!busy||!text.trim()} onClick={use}>{useLabel}</WorkspaceButton>}
    <WorkspaceButton variant={onUse?'ghost':'secondary'} size="small" disabled={!!busy||!text.trim()} onClick={copyText}><Copy size={13} aria-hidden="true"/>{copied?'Copied':'Copy'}</WorkspaceButton>
    <WorkspaceButton variant="ghost" size="small" loading={busy==='write'} disabled={!!busy} onClick={write}><RotateCcw size={13} aria-hidden="true"/>Try again</WorkspaceButton>
    <WorkspaceButton variant="ghost" size="small" disabled={!!busy} onClick={()=>{setDraft(null);setText('');setCopied(false);}}>Discard</WorkspaceButton>
   </div></>}
  {error&&<p className="quiet-helper-error" role="alert">{error}</p>}
 </section>;
}

// Hands a drafted reply to the open conversation's composer without sending it.
export const USE_DRAFT_EVENT='caleane:use-draft';
export const offerDraft=(conversationId,text)=>window.dispatchEvent(new CustomEvent(USE_DRAFT_EVENT,{detail:{conversationId,text}}));
