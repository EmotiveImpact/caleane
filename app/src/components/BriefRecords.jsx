import React,{useState} from 'react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import {formatDay} from '../lib/dates';
import {valueText,briefRows,briefChanges,versionAuthor,versionWritten,openChangeRequests,settledChangeRequests} from '../lib/brief-view';

const DEFAULT_NOTE='Requested an update to the agreed brief.';
const Action=({secondary,...props})=><WorkspaceButton variant={secondary?'secondary':'primary'} className={secondary?'button secondary':'button'} {...props}/>;

// Open requests are shown field by field with the earlier wording; settled ones stay as a quiet line.
export function BriefChangeRequests({p,workflow,owner,busy,mutate}){
 const open=openChangeRequests(p.changeRequests),settled=settledChangeRequests(p.changeRequests);
 if(!open.length&&!settled.length)return null;
 return <section className="change-list"><h3>Brief change requests</h3>{open.map(c=>{const changes=briefChanges(p.brief,c.brief,workflow),outdated=c.baseRevision!=null&&c.baseRevision!==p.briefRevision,note=valueText(c.note);return <article key={c.id}><div className="row-between"><strong>{valueText(c.by)} · {formatDay(c.at)}</strong><span className="badge pending">Pending</span></div>{note&&note!==DEFAULT_NOTE&&<p className="change-note">{note}</p>}{changes.length?<dl className="brief-details change-fields">{changes.map(change=><div key={change.key}><dt>{change.label}</dt><dd>{change.now||'Removed'}<small>Was: {change.was||'Not specified'}</small></dd></div>)}</dl>:<p className="change-note">This request matches the current brief.</p>}{outdated&&<p className="change-note">Sent against version {valueText(c.baseRevision)}. The brief has changed since, so this request can only be declined.</p>}{owner?<ReviewActions c={c} outdated={outdated} busy={busy} mutate={mutate}/>:<p className="change-note">Waiting for the studio to review.</p>}</article>;})}{settled.length>0&&<ul className="change-history">{settled.map(c=><li key={c.id}>{valueText(c.status)} · requested by {valueText(c.by)} on {formatDay(c.at)}{valueText(c.note)&&valueText(c.note)!==DEFAULT_NOTE&&<span className="change-reason">Reason given: “{valueText(c.note)}”</span>}{valueText(c.response)&&<span className="change-reason">Studio’s note: “{valueText(c.response)}”</span>}</li>)}</ul>}</section>;
}

// Declining asks for an optional note, so the client hears why rather than only seeing "Declined".
function ReviewActions({c,outdated,busy,mutate}){
 const [declining,setDeclining]=useState(false),[note,setNote]=useState('');
 if(declining)return <form className="change-decline" onSubmit={async e=>{e.preventDefault();const result=await mutate('changes',{changeId:c.id,decision:'decline',...(note.trim()?{note:note.trim()}:{})});if(result){setDeclining(false);setNote('');}}}><label className="field"><span>A note to {valueText(c.by)||'the client'} (optional)</span><textarea rows="3" maxLength="1000" value={note} onChange={e=>setNote(e.target.value)} placeholder="Why this change can’t go ahead, or what you suggest instead"/></label><div className="actions"><Action type="submit" disabled={busy}>Decline request</Action><Action type="button" secondary disabled={busy} onClick={()=>{setDeclining(false);setNote('');}}>Cancel</Action></div></form>;
 return <div className="actions">{!outdated&&<Action disabled={busy} onClick={()=>mutate('changes',{changeId:c.id,decision:'accept'})}>Accept update</Action>}<Action secondary disabled={busy} onClick={()=>setDeclining(true)}>Decline</Action></div>;
}

// Each earlier version reads like the brief, credits who wrote it and marks what it changed.
export function BriefHistory({p,workflow}){
 const history=Array.isArray(p.briefHistory)?p.briefHistory:[],firstAuthor=(p.activity||[]).findLast?.(a=>a.text==='Submitted the first brief')?.actor;
 if(!history.length)return <div className="history"><p>No earlier versions yet.</p></div>;
 return <div className="history">{history.map(h=>{const older=history.find(x=>x.revision===h.revision-1),changed=older?briefChanges(older.brief,h.brief,workflow):[],author=versionAuthor(history,h,firstAuthor);return <details key={h.revision}><summary>Version {h.revision} · {formatDay(versionWritten(history,h,p.createdAt))}</summary><p>{author?'Written by '+author:'The original brief'}</p>{changed.length>0&&<p className="history-changed">Changed: {changed.map(c=>c.label).join(', ')}</p>}<dl className="history-brief">{briefRows(h.brief,workflow).filter(row=>row.text).map(row=><div key={row.key} className={changed.some(c=>c.key===row.key)?'is-changed':undefined}><dt>{row.label}</dt><dd>{row.text}</dd></div>)}</dl></details>;})}</div>;
}
