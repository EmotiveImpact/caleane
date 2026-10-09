import React,{useState} from 'react';
import {Link2,UserPlus} from 'lucide-react';
import './not-joined.css';

// Someone who came in through a form or booking has no login until they accept an invitation,
// so anything the studio sends sits in Caleane unseen. Say so calmly and make the invitation one click away.
const firstName=name=>String(name||'They').trim().split(/\s+/)[0];
const listNames=names=>names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names.at(-1);
export function invitePathFor({studio,projectId=null,clientId=null},person){
 if(projectId&&person.contactId)return `/api/projects/${projectId}/stakeholders/${person.contactId}/invite?studio=${studio.id}`;
 if(clientId)return `/api/clients/${clientId}/invite?studio=${studio.id}`;
 return projectId?`/api/projects/${projectId}/invite?studio=${studio.id}`:null;
}
export function NotJoinedNotice({waiting,studio,request,projectId=null,clientId=null,what='this',className=''}){
 const [invite,setInvite]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 if(!waiting?.length)return null;
 const names=waiting.map(p=>firstName(p.name)),one=waiting.length===1,person=waiting[0],path=invitePathFor({studio,projectId,clientId},person);
 async function create(){setBusy(true);setError('');try{const d=await request(path,'POST',{});setInvite(d);setCopied(false);try{await navigator.clipboard.writeText(d.url);setCopied(true);}catch{/* The link stays on screen to copy by hand. */}}catch(e){setError(e.message||'The invitation could not be created. Please try again.');}finally{setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(invite.url);setCopied(true);}catch{setCopied(false);}}
 return <div className={'not-joined '+className} role="note">
  <span className="not-joined-icon" aria-hidden="true"><UserPlus size={16}/></span>
  <div className="not-joined-body">
   <strong>{listNames(names)} {one?"hasn't":"haven't"} joined yet, so they can't see {what}.</strong>
   <p>{person.invited?`An invitation is waiting for ${person.email}. Share a fresh link if it has gone astray.`:`Send ${names[0]} an invitation link and they can read and reply in Caleane.`}</p>
   {error&&<p className="not-joined-error" role="alert">{error}</p>}
   {invite?<div className="not-joined-link"><label className="sr-only" htmlFor={'invite-'+(person.contactId||person.email)}>Invitation link for {person.name}</label><input id={'invite-'+(person.contactId||person.email)} value={invite.url} readOnly onFocus={e=>e.target.select()}/><button type="button" onClick={copy}>{copied?'Copied':'Copy link'}</button><small>{invite.delivery==='queued'?`Also emailed to ${invite.email}.`:'No email has been sent.'} It expires in {invite.expiresDays} days and replaces any earlier link.</small></div>
   :path&&<button type="button" className="not-joined-action" disabled={busy} onClick={create}><Link2 size={14} aria-hidden="true"/>{busy?'Creating link…':'Copy invitation link'}</button>}
  </div>
 </div>;
}
