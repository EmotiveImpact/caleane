import React,{useEffect,useMemo,useState} from 'react';
import {NotificationDrawer} from './NotificationDrawer';
import {attentionFor} from '../lib/attention';

const todayLocal=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

// Works out the live needs-attention items; the shared drawer adds the saved updates history.
const ago=at=>{const days=Math.floor((Date.now()-new Date(at))/864e5);return days<1?'Today':days===1?'Since yesterday':`For ${days} days`;};

// Conversations the studio still owes an answer, oldest first, so nothing slips past a busy week.
export function replyItems(conversations){
 return conversations.filter(c=>c.needsReply||(!c.projectId&&c.unreadMessages>0)).sort((a,b)=>(a.messages?.at(-1)?.at||a.updatedAt).localeCompare(b.messages?.at(-1)?.at||b.updatedAt)).map(c=>{
  const last=c.messages?.at(-1),who=(c.needsReply&&last?.by||c.clientName||'A client').split(' ')[0];
  return {id:'conversation-'+c.id,kind:'message',label:c.needsReply?`${who} is waiting for your reply`:'New client message',detail:c.needsReply&&last?ago(last.at):'',context:c.projectTitle||c.subject,conversation:c};
 });
}

export function NotificationBell({studio,owner,projects,request,openProject,openMail,openConversation,openTasks,openOverview,openNotification,onInboxCount}){
 const [conversations,setConversations]=useState([]),[tasks,setTasks]=useState([]),[loadError,setLoadError]=useState(false);
 useEffect(()=>{setConversations([]);setTasks([]);setLoadError(false);let active=true;
  async function reload(){const results=await Promise.allSettled([request('/api/conversations?studio='+studio.id),owner?request('/api/crm/tasks?studio='+studio.id):Promise.resolve({tasks:[]})]);if(!active)return;let failed=false;if(results[0].status==='fulfilled')setConversations(results[0].value.conversations||[]);else failed=true;if(results[1].status==='fulfilled')setTasks(results[1].value.tasks||[]);else failed=true;setLoadError(failed);}
  reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},20000);return()=>{active=false;clearInterval(timer);};
 },[owner,studio.id,request]);
 const items=useMemo(()=>{const today=todayLocal();const due=owner?tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<=today).map(t=>({id:'crm-'+t.id,kind:'task',label:t.title,detail:t.dueDate<today?'Overdue next step':'Due today',context:t.clientName,destination:'tasks'})):[];
  const messages=owner?replyItems(conversations):[];
  // For the studio, conversations carry the message items, with who is waiting and for how long.
  const projectItems=projects.flatMap(project=>attentionFor(project,owner).filter(item=>!owner||item.kind!=='message').map(item=>({...item,context:project.title})));
  return [...messages,...due,...projectItems];
 },[tasks,conversations,projects,owner]);
 const inboxCount=owner?conversations.filter(c=>c.needsReply).length:conversations.filter(c=>c.unreadMessages>0).length;
 useEffect(()=>{onInboxCount?.(inboxCount);},[inboxCount]);
 function go(item){if(item.destination==='tasks')openTasks();else if(item.conversation)openConversation?openConversation(item.conversation):openMail(item.conversation.clientId);else if(item.clientId)openMail(item.clientId);else openProject(item.project,item.tab);}
 return <NotificationDrawer studio={studio} request={request} onOpen={openNotification} attention={{items,loadError,onOpen:go,onOverview:openOverview}}/>;
}
