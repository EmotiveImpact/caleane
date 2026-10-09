import React,{useState} from 'react';
import {shortDay} from '../lib/dates';
import {FileText,FolderClosed} from 'lucide-react';
import {WorkspaceAvatar,WorkspaceButton,WorkspaceStatus} from './workspace/WorkspaceUI';
import {fileUrl,plainText} from './ProjectChat';
const shortDate=at=>shortDay(at);

// What a conversation still needs, what was shared and who can see it.
export function ConversationPanel({thread,project,studio,request,owner,onConversation,openProject,onLeave,fileHref}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 if(!thread)return null;
 const byId=new Map(thread.messages.map(m=>[m.id,m])),files=thread.messages.flatMap(m=>(m.attachments||[]).map(file=>({...file,by:m.by,at:m.at}))).reverse(),asks=thread.asks||[],open=asks.filter(a=>!a.completed).length,latest=project?.designs?.at(-1);
 async function toggle(ask){setBusy(ask.messageId);setError('');try{const d=await request(`/api/conversations/${thread.id}/asks?studio=${studio.id}`,'POST',{messageId:ask.messageId,completed:!ask.completed});onConversation?.(d.conversation);}catch(e){setError(e.message);}finally{setBusy('');}}
 function go(...args){onLeave?.();openProject(...args);}
 return <div className="ws-conversation-panel">
  {owner&&<section><h4>Open asks{asks.length>0&&<span>{open} open</span>}</h4>
   {error&&<p className="alert" role="alert">{error}</p>}
   {asks.length?<ul className="ws-asks">{asks.map(a=><li key={a.messageId} className={a.completed?'is-done':''}><label><input type="checkbox" checked={a.completed} disabled={busy===a.messageId} onChange={()=>toggle(a)}/><span>{a.title}<small>From {byId.get(a.messageId)?.by||'a message'} · {shortDate(a.at)}{a.kind==='project'?' · in project tasks':' · in client tasks'}</small></span></label></li>)}</ul>:<p className="ws-panel-empty">Hover a message and choose the checklist icon to keep track of something you need to do.</p>}
  </section>}
  {thread.pins?.length>0&&<section><h4>Pinned</h4><ul className="ws-panel-pins">{thread.pins.map(pin=>{const m=byId.get(pin.messageId);return m?<li key={pin.messageId}><strong>{m.by}</strong><span>{plainText(m.text)||'Attached files'}</span></li>:null;})}</ul></section>}
  <section><h4>Files in this conversation{files.length>0&&<span>{files.length}</span>}</h4>
   {files.length?<div className="ws-panel-files">{files.slice(0,9).map(file=><a key={file.fileId} href={fileUrl(thread,file,studio,fileHref)} target="_blank" rel="noreferrer" title={file.name+' · '+file.by}>{file.mime?.startsWith('image/')?<img src={fileUrl(thread,file,studio,fileHref)} alt={file.name} loading="lazy"/>:<span><FileText size={18}/><small>{file.name}</small></span>}</a>)}</div>:<p className="ws-panel-empty">Files shared in messages will collect here.</p>}
  </section>
  <section><h4>People</h4>{thread.participants.map(person=>{const seen=(thread.seenBy||[]).find(s=>s.userId===person.id),seenAt=seen&&byId.get(seen.messageId)?.at;return <div className="relationship-person" key={person.id}><WorkspaceAvatar name={person.name}/><span><strong>{person.name}</strong><small>{person.role}{seenAt?' · seen up to '+new Date(seenAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''}</small></span></div>;})}</section>
  {project&&<section><h4>Project</h4><div className="ws-panel-project"><strong>{project.title}</strong><WorkspaceStatus value={project.status}/></div>
   <div className="ws-panel-links"><WorkspaceButton variant="secondary" size="small" onClick={()=>go(project,'Overview')}>View project</WorkspaceButton>{latest&&<WorkspaceButton variant="ghost" size="small" onClick={()=>go(project,'Designs',null,latest.id)}>Version {latest.version}</WorkspaceButton>}<WorkspaceButton variant="ghost" size="small" onClick={()=>go(project,'Inspiration')}><FolderClosed size={14}/>Files</WorkspaceButton></div>
   {project.brief?.vision&&<p className="ws-panel-empty">{project.brief.vision}</p>}
  </section>}
 </div>;
}
