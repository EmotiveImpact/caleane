import {messagePreview,messageSearchText} from '../lib/message-preview';
import React,{useEffect,useState} from 'react';
import {Plus,MessageSquare,PanelRight,ArrowLeft} from 'lucide-react';
import {ProjectChat} from './ProjectChat';
import {ConversationPanel} from './ConversationPanel';
import {ProjectImage} from './StudioViews';
import {WorkspaceButton,WorkspaceHeading,WorkspaceSearch,WorkspaceFilters,WorkspaceAvatar,WorkspaceDialog,WorkspaceEmpty} from './workspace/WorkspaceUI';
import './relationship-workspace.css';
const when=at=>{if(!at)return '';const d=new Date(at),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):Date.now()-d<6*864e5?d.toLocaleDateString('en-GB',{weekday:'short'}):d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});};
export const WIDE='(min-width: 1280px)',NARROW='(max-width: 760px)';
const days=at=>Math.max(0,Math.floor((Date.now()-new Date(at))/864e5));
const FILTERS={'Needs reply':t=>t.needsReply,Unread:t=>t.unreadMessages>0,Mentions:t=>t.mentionsMe>0,Waiting:t=>t.status!=='Resolved'&&(t.status==='Waiting'||!!t.waitingSince),All:t=>t.status!=='Resolved',Resolved:t=>t.status==='Resolved'};
// One label per conversation, in order of what most needs attention.
export function triageLabel(t){if(t.status==='Resolved')return ['done','Resolved'];if(t.needsReply)return ['reply','Needs your reply'];if(t.mentionsMe>0)return ['mention','Mentioned you'];if(t.waitingSince||t.status==='Waiting'){const n=t.waitingSince?days(t.waitingSince):0;return ['wait','Waiting on client'+(n?` · ${n} ${n===1?'day':'days'}`:'')];}return null;}

export function InboxWorkspace({openId=null,studio,user,clients,conversations,projects,thread,loading,error,busy,request,openProject,onChoose,onNew,onAdd,onStatus,onConversation,onMarkedUnread,fileHref}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[mobileOpen,setMobileOpen]=useState(false),[context,setContext]=useState(false),[wide,setWide]=useState(()=>matchMedia(WIDE).matches),[narrow,setNarrow]=useState(()=>matchMedia(NARROW).matches);
 useEffect(()=>{const wideMedia=matchMedia(WIDE),narrowMedia=matchMedia(NARROW),update=()=>{setWide(wideMedia.matches);setNarrow(narrowMedia.matches);};wideMedia.addEventListener('change',update);narrowMedia.addEventListener('change',update);return()=>{wideMedia.removeEventListener('change',update);narrowMedia.removeEventListener('change',update);};},[]);
 useEffect(()=>{if(openId)setMobileOpen(true);},[openId]);
 const project=projects.find(p=>p.id===thread?.projectId),label=thread&&triageLabel(thread);
 const count=name=>conversations.filter(FILTERS[name]).length,resolved=count('Resolved');
 const visible=conversations.filter(t=>FILTERS[filter](t)&&[t.subject,clients.find(c=>c.id===t.clientId)?.name,...(t.messages||[]).map(messageSearchText)].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.messages?.at(-1)?.at||b.updatedAt).localeCompare(a.messages?.at(-1)?.at||a.updatedAt));
 const panel=<ConversationPanel thread={thread} project={project} studio={studio} request={request} owner onConversation={onConversation} openProject={openProject} onLeave={()=>setContext(false)} fileHref={fileHref}/>;
 return <section className={'relationship-inbox ws-inbox'+(mobileOpen?' conversation-open':'')+(wide&&thread?' has-panel':'')}>
  <WorkspaceHeading title="Messages" description="Every client conversation, with what still needs an answer." action={<WorkspaceButton onClick={clients.length?onNew:onAdd}><Plus size={16}/>{clients.length?'New conversation':'Add client'}</WorkspaceButton>}/>
  {error&&<p role="alert" className="alert">{error}</p>}
  <div className="relationship-inbox-grid">
   <aside className="relationship-thread-list">
    <WorkspaceSearch label="Search conversations" placeholder="Search messages, people and files…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <WorkspaceFilters className="ws-inbox-filters" items={['Needs reply','Unread','Mentions','Waiting','All'].map(value=>({value,label:value,count:count(value)}))} label="Conversation filter" value={filter} onChange={setFilter}/>
    <nav aria-label="Conversations">{visible.map(t=>{
     const p=projects.find(p=>p.id===t.projectId),c=clients.find(c=>c.id===t.clientId),last=t.messages?.at(-1),tag=triageLabel(t);
     return <button className={'relationship-thread '+(t.id===thread?.id?'active ':'')+(t.unreadMessages>0?'is-unread':'')} aria-current={t.id===thread?.id?'true':undefined} key={t.id} onClick={()=>{onChoose(t);setMobileOpen(true);}}>
      {p?<ProjectImage p={p} studio={studio} className="studio-project-image" compact/>:<WorkspaceAvatar name={c?.name}/>}
      <span className="ws-thread-copy"><strong>{p?.title||t.subject}</strong><small>{last?(last.userId===user.id?'You':last.by.split(' ')[0])+': '+messagePreview(last):c?.name||'No messages yet'}</small>{tag&&<em className={'ws-triage ws-triage--'+tag[0]}>{tag[1]}</em>}</span>
      <span className="relationship-thread-meta"><time>{when(last?.at)}</time>{t.unreadMessages>0&&<b>{t.unreadMessages}</b>}</span>
     </button>;
    })}</nav>
    {!visible.length&&<p className="relationship-empty">{loading?'Loading conversations…':query?'No matching conversations.':filter==='Needs reply'?'Nothing is waiting on you.':filter==='Unread'?'You’re all caught up.':filter==='Mentions'?'Nobody has mentioned you since your last message.':filter==='Waiting'?'No conversations are waiting on a client.':filter==='Resolved'?'No resolved conversations yet.':'Start a conversation with a client.'}</p>}
    {resolved>0&&<p className="ws-inbox-resolved">{filter==='Resolved'?<button type="button" onClick={()=>setFilter('All')}>Back to open conversations</button>:<>{resolved} resolved {resolved===1?'conversation':'conversations'} hidden · <button type="button" onClick={()=>setFilter('Resolved')}>Show</button></>}</p>}
   </aside>
   <div className="relationship-conversation">
    {thread?<>
     <header className="relationship-conversation-head">
      {narrow&&<WorkspaceButton className="relationship-back" variant="ghost" iconOnly aria-label="All conversations" onClick={()=>setMobileOpen(false)}><ArrowLeft size={18}/></WorkspaceButton>}
      <div className="ws-conversation-title"><h2>{project?.title||thread.subject}{label&&<em className={'ws-triage ws-triage--'+label[0]}>{label[1]}</em>}</h2><div className="ws-conversation-members"><div className="ws-avatar-stack">{(thread.participants||[]).slice(0,3).map(person=><WorkspaceAvatar key={person.id} name={person.name} size="small"/>)}</div><span>{thread.participants?.map(p=>p.name.split(' ')[0]).join(', ')}{project?' · Project conversation':''}</span></div></div>
      <div className="ws-conversation-actions"><div className="ws-status-switch" role="radiogroup" aria-label="Conversation status">{['Open','Waiting','Resolved'].map(s=><button type="button" role="radio" key={s} aria-checked={thread.status===s} disabled={busy} onClick={()=>thread.status!==s&&onStatus(s)}>{s}</button>)}</div>{!wide&&<WorkspaceButton variant="ghost" iconOnly tooltip="Open asks, files and people" onClick={()=>setContext(true)} aria-label="View conversation details"><PanelRight size={18}/></WorkspaceButton>}</div>
     </header>
     {/* On phones the conversation stays closed until chosen, so nothing is marked read unseen. */}
     {(!narrow||mobileOpen)&&<ProjectChat key={thread.id} p={project} conversationId={thread.id} firstUnreadId={thread.firstUnreadId} studio={studio} user={user} owner={true} request={request} fileHref={fileHref} onConversation={onConversation} onMarkedUnread={c=>{onMarkedUnread?.(c);setMobileOpen(false);}}/>}
    </>:<WorkspaceEmpty icon={MessageSquare} title="Your conversations, together" description="Select a conversation to see its messages and project context."/>}
   </div>
   {wide&&thread&&<aside className="relationship-context ws-inbox-panel" aria-label="Conversation details">{panel}</aside>}
  </div>
  <WorkspaceDialog drawer open={context&&!!thread&&!wide} onOpenChange={setContext} title="Conversation details" description="Open asks, files and the people in this conversation.">{panel}</WorkspaceDialog>
 </section>;
}
