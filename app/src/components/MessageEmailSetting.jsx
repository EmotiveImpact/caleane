import React,{useEffect,useState} from 'react';
import {WorkspaceSwitch} from './workspace/WorkspaceUI';

// Each person chooses whether new messages also reach them by email. The choice is theirs, not the studio's.
// Owners find it in Settings; people without Settings (clients, contributors) keep it at the foot of the bell.
export function MessageEmailSetting({studio,request,className}){
 const [email,setEmail]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setEmail(null);request('/api/notifications/preferences?studio='+studio.id).then(data=>{if(active&&typeof data?.messageEmail==='boolean')setEmail(data);}).catch(()=>{if(active)setError('Your email choice could not be loaded.');});return()=>{active=false;};},[studio.id,request]);
 async function choose(messageEmail){const previous=email;setEmail({...email,messageEmail});setError('');try{setEmail(await request('/api/notifications/preferences?studio='+studio.id,'POST',{messageEmail}));}catch{setEmail(previous);setError('Your email choice could not be saved. Try again.');}}
 if(!email&&!error)return null;
 return <div className={className}>
  {email&&<WorkspaceSwitch label="Email me about new messages" description={email.emailActive?'Sent a few minutes after a message arrives, unless you have already read it.':'Email is not switched on for this workspace yet. Your choice is saved for when it is.'} checked={email.messageEmail} onCheckedChange={choose}/>}
  {error&&<p className="message-email-error" role="status">{error}</p>}
 </div>;
}
