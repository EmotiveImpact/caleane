import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Inbox,MessageSquare,FileText,UserCheck,Sparkles} from 'lucide-react';
import {WorkspaceDialog,WorkspaceButton,WorkspaceEmpty,WorkspaceFilters} from './workspace/WorkspaceUI';
import {NOTIFICATION_KIND_LABEL,notificationAge} from '../lib/notifications';
import './notification-drawer.css';

const ICONS={enquiry:Sparkles,message:MessageSquare,project_update:FileText,task_assigned:UserCheck};
const FILTERS=[{value:'all',label:'All'},{value:'unread',label:'Unread'}];

// Saved history of what happened, separate from the needs-attention bell, which shows live work still waiting.
export function NotificationDrawer({studio,request,onOpen}){
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[unread,setUnread]=useState(0),[cursor,setCursor]=useState(null);
 const [filter,setFilter]=useState('all'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(()=>Date.now());
 const trigger=useRef(null),generation=useRef(0);
 const base='/api/notifications?studio='+studio.id;

 const apply=useCallback((data,append=false)=>{setItems(prev=>append?[...prev,...data.notifications.filter(item=>!prev.some(p=>p.id===item.id))]:data.notifications);setUnread(data.unread);if(!append)setCursor(data.nextCursor);setClock(Date.now());},[]);
 const reload=useCallback(async()=>{const mine=++generation.current;try{const data=await request(base);if(mine!==generation.current)return;apply(data);setError('');}catch{if(mine===generation.current)setError('Notifications could not be refreshed. They will retry automatically.');}},[base,request,apply]);

 useEffect(()=>{setItems([]);setUnread(0);setCursor(null);reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},30000);return()=>{generation.current++;clearInterval(timer);};},[reload]);
 useEffect(()=>{if(open)reload();},[open,reload]);

 async function loadOlder(){if(!cursor||loading)return;setLoading(true);const mine=generation.current;try{const data=await request(base+'&before='+encodeURIComponent(cursor));if(mine!==generation.current)return;apply(data,true);setCursor(data.nextCursor);}catch{setError('Older notifications could not be loaded.');}finally{setLoading(false);}}
 async function mark(body,path='read'){const mine=++generation.current;try{const data=await request('/api/notifications/'+path+'?studio='+studio.id,'POST',{...body,limit:Math.max(20,items.length)});if(mine===generation.current){apply(data);setError('');}}catch{if(mine===generation.current)setError('That change could not be saved. Try again.');}}
 function choose(item){if(!item.read){setItems(prev=>prev.map(p=>p.id===item.id?{...p,read:true}:p));setUnread(count=>Math.max(0,count-1));mark({ids:[item.id]});}setOpen(false);onOpen(item);}

 const shown=filter==='unread'?items.filter(item=>!item.read):items;
 const label=`Notifications, ${unread} unread`;
 return <>
  <button ref={trigger} type="button" className="folio-attention-trigger notification-drawer-trigger" aria-label={label} title="Notifications" onClick={()=>setOpen(true)}><Inbox size={18} strokeWidth={1.6}/>{unread>0&&<span className="folio-attention-count">{unread>9?'9+':unread}</span>}</button>
  <WorkspaceDialog open={open} onOpenChange={setOpen} drawer title="Notifications" description="Updates from your projects, clients and team." className="notification-drawer" returnFocusRef={trigger}>
   <div className="notification-drawer-toolbar">
    <WorkspaceFilters items={FILTERS} value={filter} onChange={setFilter} label="Show notifications"/>
    <WorkspaceButton variant="ghost" size="small" disabled={!unread} onClick={()=>mark({all:true})}>Mark all as read</WorkspaceButton>
   </div>
   {error&&<p className="notification-drawer-error" role="status">{error}</p>}
   {shown.length?<ul className="notification-drawer-list">{shown.map(item=>{const Icon=ICONS[item.kind]||Inbox;return <li key={item.id} className={item.read?'':'is-unread'}>
    <button type="button" className="notification-drawer-item" onClick={()=>choose(item)}>
     <span className="notification-drawer-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.7}/></span>
     <span className="notification-drawer-copy"><span className="notification-drawer-kind">{NOTIFICATION_KIND_LABEL[item.kind]}{!item.read&&<span className="sr-only">, unread</span>}</span><strong>{item.title}</strong><small>{[item.detail,notificationAge(item.createdAt,clock)].filter(Boolean).join(' · ')}</small></span>
    </button>
    {item.read&&<button type="button" className="notification-drawer-unread" onClick={()=>mark({ids:[item.id]},'unread')}>Mark unread</button>}
   </li>;})}</ul>
   :<WorkspaceEmpty icon={Inbox} title={filter==='unread'&&items.length?'Nothing unread':'No notifications yet'} description={filter==='unread'&&items.length?'You have read everything here.':'New enquiries, messages, project updates and assignments will be kept here.'}/>}
   {cursor&&filter==='all'&&<div className="notification-drawer-more"><WorkspaceButton variant="secondary" size="small" loading={loading} onClick={loadOlder}>Show older</WorkspaceButton></div>}
  </WorkspaceDialog>
 </>;
}
