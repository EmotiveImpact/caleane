import {messagePreview,messageSearchText} from '../lib/message-preview';
import React,{useState} from 'react';
import {Plus,MessageSquare,PanelRight,FolderClosed} from 'lucide-react';
import {ProjectChat} from './ProjectChat';
import {ProjectImage} from './StudioViews';
import {WorkspaceButton,WorkspaceHeading,WorkspaceSearch,WorkspaceFilters,WorkspaceAvatar,WorkspaceStatus,WorkspaceDialog,WorkspaceEmpty,WorkspaceSelect} from './workspace/WorkspaceUI';
import './relationship-workspace.css';
const time=at=>at?new Date(at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';

export function InboxWorkspace({studio,user,clients,conversations,projects,thread,loading,error,busy,request,openProject,onChoose,onNew,onAdd,onStatus,fileHref}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[mobileOpen,setMobileOpen]=useState(false),[context,setContext]=useState(false);
 const project=projects.find(p=>p.id===thread?.projectId),client=clients.find(c=>c.id===thread?.clientId),latest=project?.designs?.at(-1);
 const visible=conversations.filter(t=>(filter!=='Unread'||t.unreadMessages>0)&&[t.subject,clients.find(c=>c.id===t.clientId)?.name,...(t.messages||[]).map(messageSearchText)].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 return <section className={'relationship-inbox ws-inbox'+(mobileOpen?' conversation-open':'')}>
  <WorkspaceHeading title="Messages" description="Keep the conversation close to the work." action={<WorkspaceButton onClick={clients.length?onNew:onAdd}><Plus size={16}/>{clients.length?'New conversation':'Add client'}</WorkspaceButton>}/>
  {error&&<p role="alert" className="alert">{error}</p>}
  <div className="relationship-inbox-grid">
   <aside className="relationship-thread-list">
    <WorkspaceSearch label="Search conversations" placeholder="Search conversations…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <WorkspaceFilters items={[{value:'All',label:'All',count:conversations.length},{value:'Unread',label:'Unread',count:conversations.filter(t=>t.unreadMessages>0).length}]} label="Conversation filter" value={filter} onChange={setFilter}/>
    <nav aria-label="Conversations">{visible.map(t=>{
     const p=projects.find(p=>p.id===t.projectId),c=clients.find(c=>c.id===t.clientId),last=t.messages?.at(-1);
     return <button className={'relationship-thread '+(t.id===thread?.id?'active':'')} aria-current={t.id===thread?.id?'true':undefined} key={t.id} onClick={()=>{onChoose(t);setMobileOpen(true);}}>
      {p?<ProjectImage p={p} studio={studio} className="studio-project-image" compact/>:<WorkspaceAvatar name={c?.name}/>}
      <span className="ws-thread-copy"><strong>{p?.title||t.subject}</strong><small>{last?last.by+': '+messagePreview(last):c?.name||'No messages yet'}</small></span>
      <span className="relationship-thread-meta"><time>{time(last?.at)}</time>{t.unreadMessages>0&&<b>{t.unreadMessages}</b>}</span>
     </button>;
    })}</nav>
    {!visible.length&&<p className="relationship-empty">{loading?'Loading conversations…':query?'No matching conversations.':filter==='Unread'?'You’re all caught up.':'Start a conversation with a client.'}</p>}
   </aside>
   <div className="relationship-conversation">
    <WorkspaceButton className="relationship-back" variant="ghost" size="small" onClick={()=>setMobileOpen(false)}>All conversations</WorkspaceButton>
    {thread?<>
     <header className="relationship-conversation-head">
      <div><h2>{project?.title||thread.subject}</h2><div className="ws-conversation-members"><div className="ws-avatar-stack">{(thread.participants||[]).slice(0,3).map(person=><WorkspaceAvatar key={person.id} name={person.name} size="small"/>)}</div><span>{thread.participants?.length||0} people{project?' · Project conversation':''}</span></div></div>
      <div className="ws-conversation-actions"><WorkspaceSelect label="Conversation status" options={['Open','Waiting','Resolved']} value={thread.status} disabled={busy} onValueChange={onStatus}/><WorkspaceButton variant="ghost" iconOnly tooltip="Project details" onClick={()=>setContext(true)} aria-label="View conversation details"><PanelRight size={18}/></WorkspaceButton></div>
     </header>
     <ProjectChat key={thread.id} p={project} conversationId={thread.id} studio={studio} user={user} owner={true} request={request} fileHref={fileHref}/>
    </>:<WorkspaceEmpty icon={MessageSquare} title="Your conversations, together" description="Select a conversation to see its messages and project context."/>}
   </div>
  </div>
  <WorkspaceDialog drawer open={context&&!!thread} onOpenChange={setContext} title={project?'Project details':'Conversation details'} description="The people, files and decisions connected to this conversation.">
   <div className="ws-context-panel">{project?<>
    <ProjectImage p={project} studio={studio} className="ws-context-image"/><h3>{project.title}</h3><WorkspaceStatus value={project.status}/>
    <WorkspaceButton variant="secondary" onClick={()=>{setContext(false);openProject(project,'Overview');}}>View project</WorkspaceButton>
    {latest&&<section><h4>Latest version</h4><button onClick={()=>{setContext(false);openProject(project,'Designs',null,latest.id);}}>{latest.title}<small>Version {latest.version}</small></button><WorkspaceStatus value={latest.status}/></section>}
    <section><h4>Project files</h4><WorkspaceButton variant="secondary" onClick={()=>{setContext(false);openProject(project,'Inspiration');}}><FolderClosed size={16}/>View project files</WorkspaceButton></section>
   </>:client?<><div className="relationship-person"><WorkspaceAvatar name={client.name}/><strong>{client.name}</strong></div><a href={'mailto:'+client.email}>{client.email}</a></>:null}
   <section><h4>People with access</h4>{(thread?.participants||[]).map(person=><div className="relationship-person" key={person.id}><WorkspaceAvatar name={person.name}/><span><strong>{person.name}</strong><small>{person.role}</small></span></div>)}</section>
   {project?.brief?.vision&&<section><h4>About this project</h4><p>{project.brief.vision}</p></section>}
   </div>
  </WorkspaceDialog>
 </section>;
}
