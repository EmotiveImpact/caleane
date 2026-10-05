import React,{useEffect,useMemo,useState} from 'react';
import {NotificationDrawer} from './NotificationDrawer';
import {attentionFor} from '../lib/attention';

const todayLocal=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

// Works out the live needs-attention items; the shared drawer adds the saved updates history.
export function NotificationBell({studio,owner,projects,request,openProject,openMail,openTasks,openOverview,openNotification}){
 const [conversations,setConversations]=useState([]),[tasks,setTasks]=useState([]),[loadError,setLoadError]=useState(false);
 useEffect(()=>{setConversations([]);setTasks([]);setLoadError(false);if(!owner)return;let active=true;
  async function reload(){const results=await Promise.allSettled([request('/api/conversations?studio='+studio.id),request('/api/crm/tasks?studio='+studio.id)]);if(!active)return;let failed=false;if(results[0].status==='fulfilled')setConversations(results[0].value.conversations||[]);else failed=true;if(results[1].status==='fulfilled')setTasks(results[1].value.tasks||[]);else failed=true;setLoadError(failed);}
  reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},20000);return()=>{active=false;clearInterval(timer);};
 },[owner,studio.id,request]);
 const items=useMemo(()=>{const today=todayLocal();const due=owner?tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<=today).map(t=>({id:'crm-'+t.id,kind:'task',label:t.title,detail:t.dueDate<today?'Overdue next step':'Due today',context:t.clientName,destination:'tasks'})):[];
  const messages=owner?conversations.filter(c=>!c.projectId&&c.unreadMessages>0).map(c=>({id:'client-'+c.id,kind:'message',label:'New client message',detail:c.subject,context:c.clientName,clientId:c.clientId})):[];
  const projectItems=projects.flatMap(project=>attentionFor(project,owner).map(item=>({...item,context:project.title})));
  return [...due,...messages,...projectItems];
 },[tasks,conversations,projects,owner]);
 function go(item){if(item.destination==='tasks')openTasks();else if(item.clientId)openMail(item.clientId);else openProject(item.project,item.tab);}
 return <NotificationDrawer studio={studio} request={request} onOpen={openNotification} attention={{items,loadError,onOpen:go,onOverview:openOverview}}/>;
}
