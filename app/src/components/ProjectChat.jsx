import React,{useEffect,useRef,useState} from 'react';
import {MessageSquare,Send,Users,X,Reply,Paperclip,AtSign,FileText,Pin,PinOff,ListChecks,MailWarning,CheckCircle2,Clock,ChevronDown,PenLine,Undo2} from 'lucide-react';
import './project-chat.css';
import {NotJoinedNotice} from './NotJoinedNotice';
import {WorkspaceButton,WorkspaceSearch,WorkspaceAvatar,WorkspacePopover,WorkspaceMenu} from './workspace/WorkspaceUI';
import {TemplatePicker} from './TemplatePicker';
import {loadDraft,saveDraft} from '../lib/message-drafts';
import {watchConversations} from '../lib/conversationFeed';
import {useHelperEnabled} from './QuietHelper';
const day=at=>new Date(at).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'});
const clock=at=>new Date(at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
export const plainText=text=>String(text||'').replace(/^Replying to [^\n]+:\n(?:>[^\n]*\n?)+/,'').replace(/\s+/g,' ').trim();
const clip=(text,n=140)=>{const line=plainText(text);return line.length>n?line.slice(0,n-1).trimEnd()+'…':line;};
// Plain text with web links made clickable. Nothing else is interpreted.
function Linked({text}){return String(text).split(/(https?:\/\/[^\s<>"]+)/g).map((part,i)=>i%2?<a key={i} href={part} target="_blank" rel="noreferrer noopener">{part}</a>:part);}
function MessageBody({text}){const match=text?.match(/^Replying to ([^\n]+):\n((?:>[^\n]*(?:\n|$))+)(?:\n)?([\s\S]*)$/);return match?<><blockquote className="project-talk-inline-quote"><strong>Replying to {match[1]}</strong><p>{match[2].replace(/^> ?/gm,'').trim()}</p></blockquote><p><Linked text={match[3]}/></p></>:text?<p><Linked text={text}/></p>:null;}
const sendTime=at=>new Date(at).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const localInput=date=>{const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);return d.toISOString().slice(0,16);};
// Quick choices for sending later, in the writer's own time zone.
export function laterChoices(from=new Date()){
 const at=(days,hour)=>{const d=new Date(from);d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d;};
 const choices=[];
 if(from.getHours()<13)choices.push({label:'This afternoon',at:at(0,14)});
 // Weekends are skipped, so on a Friday the next morning offered is Monday's.
 if(![0,6].includes(at(1,9).getDay()))choices.push({label:'Tomorrow morning',at:at(1,9)});
 const monday=((8-from.getDay())%7)||7;if(monday>1)choices.push({label:'Monday morning',at:at(monday,9)});
 return choices;
}
export function fileUrl(thread,file,studio,fileHref){return fileHref?.(thread,file)||`/api/conversations/${thread.id}/files/${file.fileId}?studio=${studio.id}`;}

// helper: offer the quiet helper's "Draft a reply" in the composer when it is switched on for the studio.
export function ProjectChat({p,studio,user,owner,request,conversationId,fileHref,firstUnreadId=null,onConversation,onMarkedUnread,helper=false,openTask}){
 const [thread,setThread]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[draft,setDraftState]=useState(''),[sending,setSending]=useState(false),[query,setQuery]=useState(''),[people,setPeople]=useState(false),[reply,setReply]=useState(null),[attachments,setAttachments]=useState([]),[uploading,setUploading]=useState(false),[mentionPicker,setMentionPicker]=useState(false),[mentionIds,setMentionIds]=useState([]),[unreadFrom,setUnreadFrom]=useState(firstUnreadId),[flash,setFlash]=useState(null),[picked,setPicked]=useState(null),[working,setWorking]=useState('');
 const [later,setLater]=useState(false),[customAt,setCustomAt]=useState(''),[drafting,setDrafting]=useState(false),[drafted,setDrafted]=useState(null);
 const helperOn=useHelperEnabled(studio,request,!!(helper&&owner)),moreSend=useRef(null),draftNow=useRef('');
 const revision=useRef(0),pending=useRef(null),scroll=useRef(null),nearBottom=useRef(true),input=useRef(null),fileInput=useRef(null),placed=useRef(false),holdSeen=useRef(false),unreadCaptured=useRef(!!firstUnreadId);
 const draftKey=conversationId||thread?.id;
 function setDraft(value){setDraftState(current=>{const next=typeof value==='function'?value(current):value;if(draftKey)saveDraft(draftKey,next);return next;});}
 draftNow.current=draft;
 function accept(conversation){setThread(conversation);onConversation?.(conversation);}
 useEffect(()=>{setThread(null);setDrafted(null);setReply(null);setAttachments([]);setMentionIds([]);setLoading(true);placed.current=false;holdSeen.current=false;pending.current=null;setDraftState(conversationId?loadDraft(conversationId):'');return watchConversations(studio.id,request,{start:()=>revision.current,data:(list,version)=>{if(version!==revision.current)return;const found=list.find(t=>conversationId?t.id===conversationId:t.projectId===p?.id)||null;setThread(found);if(found&&!unreadCaptured.current){unreadCaptured.current=true;setUnreadFrom(found.firstUnreadId||null);}if(found&&!conversationId)setDraftState(current=>current||loadDraft(found.id));setError('');},error:e=>setError(e.message),done:()=>setLoading(false)});},[p?.id,studio.id,conversationId]);
 // Open at the first unread message when there is one, otherwise at the latest.
 useEffect(()=>{const el=scroll.current;if(!el||!thread)return;if(!placed.current){placed.current=true;const divider=el.querySelector('.project-talk-unread');if(divider){el.scrollTop+=divider.getBoundingClientRect().top-el.getBoundingClientRect().top-12;nearBottom.current=false;return;}}if(nearBottom.current)el.scrollTop=el.scrollHeight;},[thread?.messages.length,query,!!thread]);
 useEffect(()=>{if(holdSeen.current||!thread?.unreadMessages||!thread.messages.length)return;request(`/api/conversations/${thread.id}/seen?studio=${studio.id}`,'POST',{lastMessageId:thread.messages.at(-1).id}).then(d=>onConversation?.(d.conversation)).catch(e=>setError(e.message));},[thread?.id,thread?.messages.length,thread?.unreadMessages]);
 const canWrite=owner||(!p&&!!thread)||['Approver','Collaborator','Contributor'].includes(p?.accessRole),all=thread?.messages||[],participants=thread?.participants||[],byId=new Map(all.map(m=>[m.id,m])),pinned=new Set((thread?.pins||[]).map(x=>x.messageId)),asks=new Map((thread?.asks||[]).map(a=>[a.messageId,a]));
 const matches=m=>!query||`${m.by} ${m.text} ${(m.attachments||[]).map(a=>a.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()),messages=all.filter(matches);
 const myLast=[...all].reverse().find(m=>m.userId===user.id),seenMine=myLast?(thread?.seenBy||[]).filter(s=>all.findIndex(m=>m.id===s.messageId)>=all.indexOf(myLast)).map(s=>s.name.split(' ')[0]):[];
 async function act(path,body,label){setWorking(label);setError('');revision.current++;try{const d=await request(`/api/conversations/${thread.id}/${path}?studio=${studio.id}`,'POST',body);accept(d.conversation);return d.conversation;}catch(e){setError(e.message);}finally{revision.current++;setWorking('');}}
 async function markUnread(m){holdSeen.current=true;const c=await act('unseen',{messageId:m.id},'unread-'+m.id);if(c){setUnreadFrom(m.id);onMarkedUnread?.(c);}else holdSeen.current=false;}
 function jump(id){const el=scroll.current?.querySelector(`[data-message="${id}"]`);if(!el)return;setQuery('');el.scrollIntoView({block:'center',behavior:'smooth'});setFlash(id);setTimeout(()=>setFlash(v=>v===id?null:v),1600);}
 function outgoing(){return {text:draft.trim(),parentId:reply?.id||null,attachmentIds:attachments.map(a=>a.fileId),mentionIds:mentionIds.filter(id=>{const person=participants.find(p=>p.id===id);return person&&draft.includes('@'+person.name);})};}
 async function schedule(at){if((!draft.trim()&&!attachments.length)||sending||uploading||!thread)return;if(!(at instanceof Date)||Number.isNaN(at.getTime())){setError('Choose when to send this message.');return;}setSending(true);setError('');revision.current++;try{const d=await request(`/api/conversations/${thread.id}/scheduled?studio=${studio.id}`,'POST',{...outgoing(),sendAt:at.toISOString()});accept(d.conversation);setDraft('');setDrafted(null);setReply(null);setAttachments([]);setMentionIds([]);setLater(false);setCustomAt('');}catch(e){setError(e.message);}finally{revision.current++;setSending(false);}}
 async function editScheduled(item){const c=await act('scheduled/'+item.id,{action:'cancel'},'scheduled-'+item.id);if(!c)return;setDraft(item.text);setReply(item.parentId?byId.get(item.parentId)||null:null);setMentionIds(item.mentionIds||[]);input.current?.focus();}
 async function send(e){e.preventDefault();if((!draft.trim()&&!attachments.length)||sending||uploading||!thread)return;const body=outgoing();const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,clientMessageId:crypto.randomUUID()}};setSending(true);setError('');revision.current++;try{const d=await request(`/api/conversations/${thread.id}/messages?studio=${studio.id}`,'POST',pending.current.body);nearBottom.current=true;holdSeen.current=false;setUnreadFrom(null);accept(d.conversation);setDraft('');setDrafted(null);setReply(null);setAttachments([]);setMentionIds([]);pending.current=null;input.current?.focus();}catch(e){setError(e.message);}finally{revision.current++;setSending(false);}}
 async function upload(event){const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length||!thread)return;if(attachments.length+files.length>5){setError('Attach up to five files per message.');return;}setUploading(true);setError('');revision.current++;try{for(const file of files){if(file.size>6000000)throw new Error('Choose files smaller than 6 MB.');const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read this file.'));reader.readAsDataURL(file);});const d=await request(`/api/conversations/${thread.id}/files?studio=${studio.id}`,'POST',{name:file.name,content});setAttachments(current=>[...current,d.file]);}}catch(e){setError(e.message);}finally{revision.current++;setUploading(false);}}
 // The helper's draft goes straight into the message box; Undo puts back whatever was there before.
 async function draftReply(){if(!thread||drafting)return;setDrafting(true);setError('');try{const d=await request('/api/assistant?studio='+studio.id,'POST',{kind:'reply',conversationId:thread.id});setDrafted(prev=>prev||{before:draftNow.current});setDraft(d.draft.text);input.current?.focus();}catch(e){setError(e.message);}finally{setDrafting(false);}}
 function undoDraft(){if(!drafted)return;setDraft(drafted.before);setDrafted(null);input.current?.focus();}
 function beginReply(message){setReply(message.parentId?byId.get(message.parentId)||message:message);input.current?.focus();}
 function renderMessage(m){
  const parent=m.parentId&&byId.get(m.parentId),ask=asks.get(m.id),isPinned=pinned.has(m.id),mine=m.userId===user.id;
  return <article key={m.id} data-message={m.id} className={'project-talk-message'+(mine?' is-mine':'')+(m.id===unreadFrom?' is-first-unread':'')+(flash===m.id?' is-flash':'')+(picked===m.id?' is-picked':'')} onClick={e=>{if(!e.target.closest('a,button'))setPicked(v=>v===m.id?null:m.id);}}>
   <WorkspaceAvatar name={m.by} className="project-talk-avatar"/>
   <div className="project-talk-message-content">
    <header><strong>{m.by}</strong>{mine&&<small>You</small>}<time dateTime={m.at}>{clock(m.at)}</time>{isPinned&&<span className="project-talk-pinned-mark"><Pin size={11}/>Pinned</span>}</header>
    {parent&&<button type="button" className="project-talk-reply-quote" onClick={()=>jump(parent.id)}><span>Replying to <strong>{parent.userId===user.id?'you':parent.by}</strong></span><q>{clip(parent.text,160)||'Attached files'}</q></button>}
    <MessageBody text={m.text}/>
    {m.mentionIds?.length>0&&<div className="project-talk-mentions">{m.mentionIds.map(id=><span key={id}>{id===user.id?'Mentioned you':'@'+(participants.find(p=>p.id===id)?.name||'Participant')}</span>)}</div>}
    {m.attachments?.length>0&&<div className="project-talk-files">{m.attachments.map(file=>file.mime?.startsWith('image/')?<a key={file.fileId} className="project-talk-image" href={fileUrl(thread,file,studio,fileHref)} target="_blank" rel="noreferrer"><img src={fileUrl(thread,file,studio,fileHref)} alt={file.name} onLoad={()=>{if(nearBottom.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;}}/></a>:<a key={file.fileId} href={fileUrl(thread,file,studio,fileHref)} target="_blank" rel="noreferrer"><FileText size={16}/><span>{file.name}<small>{Math.max(1,Math.round(file.size/1024))} KB</small></span></a>)}</div>}
    {ask&&<div className="project-talk-ask-mark"><span className={ask.completed?'is-done':''}>{ask.completed?<CheckCircle2 size={12}/>:<ListChecks size={12}/>}{ask.completed?'Task done':'Task added'}</span>{openTask&&<button type="button" className="project-talk-ask-open" onClick={()=>openTask(ask.taskKey)}>Open task</button>}</div>}
    {mine&&m.id===myLast?.id&&seenMine.length>0&&<p className="project-talk-seen">Seen by {seenMine.join(', ')}</p>}
   </div>
   <div className="project-talk-actions" role="group" aria-label={'Actions for '+m.by+'’s message'}>
    {canWrite&&<button type="button" aria-label={'Reply to '+m.by} title="Reply" onClick={()=>beginReply(m)}><Reply size={15}/></button>}
    {canWrite&&<button type="button" aria-label={isPinned?'Unpin message':'Pin message'} title={isPinned?'Unpin':'Pin'} disabled={!!working} onClick={()=>act('pins',{messageId:m.id,pinned:!isPinned},'pin')}>{isPinned?<PinOff size={15}/>:<Pin size={15}/>}</button>}
    {owner&&!ask&&<button type="button" aria-label="Make this a task" title="Make this a task" disabled={!!working} onClick={()=>act('asks',{messageId:m.id},'ask')}><ListChecks size={15}/></button>}
    {!mine&&<button type="button" aria-label="Mark unread from here" title="Mark unread" disabled={!!working} onClick={()=>markUnread(m)}><MailWarning size={15}/></button>}
   </div>
  </article>;
 }
 const pinnedMessages=(thread?.pins||[]).map(x=>byId.get(x.messageId)).filter(Boolean),unreadCount=unreadFrom?all.length-all.findIndex(m=>m.id===unreadFrom):0;
 return <section className={'project-chat ws-conversation'} aria-label={p?'Project conversation':'Client conversation'}>
  <header className="project-project-talk-head"><div><MessageSquare size={19}/><div><h2>{p?'Project conversation':'Client conversation'}</h2><p>{p?'Shared with this project’s participants':'Shared with this client and the studio'}</p></div></div><button className="project-talk-people-toggle" aria-expanded={people} onClick={()=>setPeople(!people)}><Users size={16}/>{participants.length||''} People</button></header>
  <WorkspaceSearch className="project-talk-search" label="Search messages" placeholder="Find a message, person or file…" value={query} onChange={e=>setQuery(e.target.value)}>{query&&<WorkspaceButton variant="ghost" iconOnly aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></WorkspaceButton>}</WorkspaceSearch>
  {pinnedMessages.length>0&&<nav className="project-talk-pins" aria-label="Pinned messages"><span><Pin size={13}/>Pinned</span>{pinnedMessages.map(m=><button type="button" key={m.id} onClick={()=>jump(m.id)} title={plainText(m.text)}>{clip(m.text,48)||m.by+'’s files'}</button>)}</nav>}
  {error&&<p className="alert" role="alert">{error}</p>}
  <div className={'project-talk-body'+(people?' has-people':'')}><div className="project-talk-main">
   <div ref={scroll} className="project-talk-timeline" onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} aria-label="Messages">
    {loading?<p className="project-talk-empty" role="status">Loading conversation…</p>:messages.length?messages.map((m,i)=><React.Fragment key={m.id}>
     {(!i||day(messages[i-1].at)!==day(m.at))&&<div className="project-talk-day"><span>{day(m.at)}</span></div>}
     {m.id===unreadFrom&&!query&&<div className="project-talk-unread" role="separator"><span>{unreadCount} new since you last looked</span></div>}
     {renderMessage(m)}
    </React.Fragment>):<div className="project-talk-empty"><MessageSquare size={26}/><h3>{query?'No matching messages':'Bring the conversation together'}</h3><p>{query?'Try another name or phrase.':'Discuss the details, ask questions and keep everyone informed.'}</p></div>}
   </div>
   {canWrite&&thread?<WorkspacePopover open={later} onOpenChange={setLater} side="top" align="end" className="project-talk-later" title="Send later" onOpenAutoFocus={e=>{const first=e.currentTarget?.querySelector?.('.project-talk-later-choices button');if(first){e.preventDefault();first.focus();}}} onCloseAutoFocus={e=>{e.preventDefault();(moreSend.current?.isConnected?moreSend.current:input.current)?.focus();}} anchor={<div className="project-talk-dock">
    {thread.scheduled?.length>0&&<div className="project-talk-scheduled" aria-label="Your scheduled messages">{thread.scheduled.map(item=><div key={item.id} className={item.state==='failed'?'is-failed':''}>
    <Clock size={14} aria-hidden="true"/><span><strong>{item.state==='failed'?'Not sent':'Sends '+sendTime(item.sendAt)}</strong><small>{clip(item.text,90)||'Attached files'}{item.error?' · '+item.error:''}</small></span>
    <button type="button" disabled={!!working} onClick={()=>{nearBottom.current=true;act('scheduled/'+item.id,{action:'send'},'scheduled-'+item.id);}}>Send now</button><button type="button" disabled={!!working} onClick={()=>editScheduled(item)}>Edit</button><button type="button" disabled={!!working} aria-label="Cancel scheduled message" onClick={()=>act('scheduled/'+item.id,{action:'cancel'},'scheduled-'+item.id)}><X size={14}/></button>
   </div>)}</div>}
    {owner&&<NotJoinedNotice className="project-talk-not-joined" waiting={thread.waitingToJoin} studio={studio} request={request} projectId={thread.projectId} clientId={thread.clientId} what="messages here"/>}
    <form className="project-talk-composer" onSubmit={send}>
    {reply&&<div className="project-talk-quote"><div><strong>Replying to {reply.userId===user.id?'your message':reply.by}</strong><p>{clip(reply.text,200)||'Attached files'}</p></div><button type="button" aria-label="Cancel reply" onClick={()=>setReply(null)}><X size={16}/></button></div>}
    {drafted&&<div className="project-talk-drafted" role="status"><PenLine size={13} aria-hidden="true"/><span>Drafted by Caleane. Check it before sending.</span><button type="button" onClick={undoDraft}><Undo2 size={13} aria-hidden="true"/>Undo</button></div>}
    <label className="sr-only" htmlFor={'message-'+thread.id}>Message participants</label>
    <textarea ref={input} id={'message-'+thread.id} placeholder={reply?'Write your reply…':'Write a message…'} value={draft} onChange={e=>setDraft(e.target.value)} disabled={sending} rows={3} maxLength={5000} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();send(e);}}}/>
    {attachments.length>0&&<div className="project-talk-pending-files">{attachments.map(f=><span key={f.fileId}><Paperclip size={13}/>{f.name}<button type="button" aria-label={'Remove '+f.name} onClick={()=>setAttachments(v=>v.filter(a=>a.fileId!==f.fileId))}><X size={13}/></button></span>)}</div>}
    {mentionPicker&&<div className="project-talk-mention-picker" aria-label="Mention a participant">{participants.filter(p=>p.id!==user.id).map(person=><button type="button" key={person.id} onClick={()=>{setDraft(v=>v+(v&&!v.endsWith(' ')?' ':'')+'@'+person.name+' ');setMentionIds(v=>[...new Set([...v,person.id])]);setMentionPicker(false);input.current?.focus();}}><WorkspaceAvatar name={person.name} className="project-talk-avatar"/>{person.name}<small>{person.role}</small></button>)}{participants.filter(p=>p.id!==user.id).length===0&&<p>No other participants have access yet.</p>}</div>}
    <footer><div className="project-talk-composer-tools"><input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={upload}/><WorkspaceButton variant="ghost" iconOnly aria-label="Attach files" title="PNG, JPG, WebP or PDF · up to 6 MB each" disabled={sending||uploading||attachments.length>=5} onClick={()=>fileInput.current?.click()}><Paperclip size={16}/></WorkspaceButton><WorkspaceButton variant="ghost" iconOnly aria-label="Mention someone" aria-expanded={mentionPicker} disabled={sending} onClick={()=>setMentionPicker(v=>!v)}><AtSign size={16}/></WorkspaceButton>{owner&&<TemplatePicker studio={studio} clientName={p?.brief?.name||thread.clientName||''} projectTitle={p?.title||thread.projectTitle||''} projectDate={p?.brief?.date||''} onInsert={text=>{setDraft(current=>current.trim()?current+'\n\n'+text:text);input.current?.focus();}}/>}{helperOn&&<WorkspaceButton variant="ghost" size="small" className="project-talk-draft" loading={drafting} disabled={sending||drafting} onClick={draftReply}>{!drafting&&<PenLine size={15}/>}<span className="project-talk-draft-label">{drafting?'Drafting…':'Draft a reply'}</span></WorkspaceButton>}<span role="status" className={uploading||(draft.trim()&&!sending)?'':'is-hint'}>{uploading?'Uploading…':draft.trim()&&!sending?'Draft saved':'⌘ / Ctrl + Enter to send'}</span></div><div className="project-talk-send project-talk-split"><WorkspaceButton type="submit" title="⌘ / Ctrl + Enter" loading={sending} disabled={uploading||(!draft.trim()&&!attachments.length)}>{!sending&&<Send size={15}/>} {sending?'Sending…':reply?'Reply':'Send'}</WorkspaceButton><WorkspaceMenu label="Send options" trigger={<WorkspaceButton ref={moreSend} iconOnly className="project-talk-split-more" aria-label="More send options" disabled={sending||uploading}><ChevronDown size={15}/></WorkspaceButton>} items={[{label:'Send later…',icon:Clock,disabled:!draft.trim()&&!attachments.length,onSelect:()=>setTimeout(()=>setLater(true),0)}]}/></div></footer>
    </form></div>}>
     <p>Only you can see it until it goes. You can send it early, change it or cancel it.</p>
     <div className="project-talk-later-choices">{laterChoices().map(choice=><button type="button" key={choice.label} onClick={()=>schedule(choice.at)}><strong>{choice.label}</strong><small>{sendTime(choice.at)}</small></button>)}</div>
     <label className="project-talk-later-custom"><span>Pick a date and time</span><input type="datetime-local" value={customAt} min={localInput(new Date())} onChange={e=>setCustomAt(e.target.value)}/></label>
     <WorkspaceButton disabled={!customAt||sending} onClick={()=>schedule(new Date(customAt))}><Clock size={15}/>Schedule</WorkspaceButton>
   </WorkspacePopover>:!loading&&<p className="project-talk-readonly">{canWrite?'The conversation is unavailable. Please refresh and try again.':'You have read-only access to this conversation.'}</p>}
  </div>{people&&<aside className="project-talk-people" aria-label="Conversation participants"><h3>People with access</h3><p>Only people with an active login are listed.</p>{participants.map(person=><div key={person.id}><WorkspaceAvatar name={person.name} className="project-talk-avatar"/><span><strong>{person.name}</strong><small>{person.role}</small></span></div>)}<p>Viewers can read. Collaborators and approvers can reply.</p></aside>}</div>
 </section>;
}
