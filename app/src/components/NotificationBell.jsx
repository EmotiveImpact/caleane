import React,{useEffect,useMemo,useState} from 'react';
import {NotificationDrawer} from './NotificationDrawer';
import {attentionFor} from '../lib/attention';
import {watchConversations} from '../lib/conversationFeed';

const todayLocal=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

// Works out the live needs-attention items; the shared drawer adds the saved updates history.
// Each item carries at, when it began waiting, so the drawer can show its age and group it by day.

// Conversations the studio still owes an answer, oldest first, so nothing slips past a busy week.
export function replyItems(conversations){
 return conversations.filter(c=>c.needsReply||(!c.projectId&&c.unreadMessages>0)).sort((a,b)=>(a.messages?.at(-1)?.at||a.updatedAt).localeCompare(b.messages?.at(-1)?.at||b.updatedAt)).map(c=>{
  const last=c.messages?.at(-1),who=(c.needsReply&&last?.by||c.clientName||'A client').split(' ')[0];
  return {id:'conversation-'+c.id,kind:'message',label:c.needsReply?`${who} is waiting for your reply`:'New client message',detail:'',at:last?.at||c.updatedAt,context:c.projectTitle||c.subject,conversation:c};
 });
}

export function NotificationBell({studio,owner,projects,request,openProject,openMail,openConversation,openTasks,openOverview,openNotification,openEmailSettings,onInboxCount}){
 const [conversations,setConversations]=useState([]),[tasks,setTasks]=useState([]),[loadError,setLoadError]=useState(false);
 useEffect(()=>{setConversations([]);setTasks([]);setLoadError(false);let active=true;
  let messagesFailed=false,tasksFailed=false;const show=()=>{if(active)setLoadError(messagesFailed||tasksFailed);};
  const stop=watchConversations(studio.id,request,{data:list=>{if(!active)return;messagesFailed=false;setConversations(list||[]);show();},error:()=>{messagesFailed=true;show();}});
  async function reload(){if(!owner)return;try{const data=await request('/api/crm/tasks?studio='+studio.id);if(active)setTasks(data.tasks||[]);tasksFailed=false;}catch{tasksFailed=true;}show();}
  reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},20000);return()=>{active=false;clearInterval(timer);stop();};
 },[owner,studio.id,request]);
 const items=useMemo(()=>{const today=todayLocal();const due=owner?tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<=today).map(t=>({id:'crm-'+t.id,kind:'task',label:t.title,detail:t.dueDate<today?'Overdue next step':'Due today',at:t.dueDate,context:t.clientName,destination:'tasks'})):[];
  const messages=owner?replyItems(conversations):[];
  // For the studio, conversations carry the message items, with who is waiting and for how long.
  const projectItems=projects.flatMap(project=>attentionFor(project,owner).filter(item=>!owner||item.kind!=='message').map(item=>({...item,context:project.title})));
  return [...messages,...due,...projectItems];
 },[tasks,conversations,projects,owner]);
 const inboxCount=owner?conversations.filter(c=>c.needsReply).length:conversations.filter(c=>c.unreadMessages>0).length;
 useEffect(()=>{onInboxCount?.(inboxCount);},[inboxCount]);
 function go(item){if(item.destination==='tasks')openTasks();else if(item.conversation)openConversation?openConversation(item.conversation):openMail(item.conversation.clientId);else if(item.clientId)openMail(item.clientId);else openProject(item.project,item.tab);}
 return <NotificationDrawer studio={studio} request={request} onOpen={openNotification} attention={{items,loadError,onOpen:go,onOverview:openOverview}} onEmailSettings={openEmailSettings}/>;
}
