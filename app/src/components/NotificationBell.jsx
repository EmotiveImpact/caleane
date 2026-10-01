import React,{useEffect,useMemo,useState} from 'react';
import {WorkspacePopover} from './workspace/WorkspaceUI';
import {Bell} from 'lucide-react';
import {attentionFor} from '../lib/attention';

const todayLocal=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

export function NotificationBell({studio,owner,projects,request,openProject,openMail,openTasks,openOverview}){
 const [open,setOpen]=useState(false),[conversations,setConversations]=useState([]),[tasks,setTasks]=useState([]),[loadError,setLoadError]=useState(false);
 useEffect(()=>{setConversations([]);setTasks([]);setLoadError(false);if(!owner)return;let active=true;
  async function reload(){const results=await Promise.allSettled([request('/api/conversations?studio='+studio.id),request('/api/crm/tasks?studio='+studio.id)]);if(!active)return;let failed=false;if(results[0].status==='fulfilled')setConversations(results[0].value.conversations||[]);else failed=true;if(results[1].status==='fulfilled')setTasks(results[1].value.tasks||[]);else failed=true;setLoadError(failed);}
  reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},20000);return()=>{active=false;clearInterval(timer);};
 },[owner,studio.id,request]);
 const items=useMemo(()=>{const today=todayLocal();const due=owner?tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<=today).map(t=>({id:'crm-'+t.id,kind:'task',label:t.title,detail:t.dueDate<today?'Overdue next step':'Due today',context:t.clientName,destination:'tasks'})):[];
  const messages=owner?conversations.filter(c=>!c.projectId&&c.unreadMessages>0).map(c=>({id:'client-'+c.id,kind:'message',label:'New client message',detail:c.subject,context:c.clientName,clientId:c.clientId})):[];
  const projectItems=projects.flatMap(project=>attentionFor(project,owner).map(item=>({...item,context:project.title})));
  return [...due,...messages,...projectItems];
 },[tasks,conversations,projects,owner]);
 function go(item){setOpen(false);if(item.destination==='tasks')openTasks();else if(item.clientId)openMail(item.clientId);else openProject(item.project,item.tab);}
 return <WorkspacePopover open={open} onOpenChange={setOpen} title="Needs attention" className="ws-attention-popover" trigger={<button type="button" className="folio-attention-trigger" aria-label={`Needs attention, ${items.length} ${items.length===1?'item':'items'}`}><Bell size={18} strokeWidth={1.6}/>{items.length>0&&<span className="folio-attention-count">{items.length>9?'9+':items.length}</span>}</button>}><p className="ws-attention-description">Messages and work waiting for you.</p><div className="folio-attention-list">{items.length?items.slice(0,8).map(item=><button type="button" key={item.id} onClick={()=>go(item)}><span className="folio-attention-item-kind">{item.kind==='message'?'Message':item.kind.startsWith('task')?'Next step':'Project'}</span><strong>{item.label}</strong><small>{item.context}{item.detail?' · '+item.detail:''}</small></button>):<p className="folio-attention-empty">You’re up to date. New messages and decisions will appear here.</p>}{items.length>8&&<p className="folio-attention-more">{items.length-8} more items on Overview.</p>}{loadError&&<p className="folio-attention-error">Some items could not be refreshed. They will retry automatically.</p>}</div><button type="button" className="folio-attention-view-all" onClick={()=>{setOpen(false);openOverview();}}>Open overview</button></WorkspacePopover>;
}
