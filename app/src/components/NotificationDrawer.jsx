import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Bell,Inbox,MessageSquare,FileText,UserCheck,Sparkles,Clock} from 'lucide-react';
import {WorkspaceDialog,WorkspaceButton,WorkspaceEmpty,WorkspaceFilters,WorkspaceTabs,WorkspaceSwitch} from './workspace/WorkspaceUI';
import {NOTIFICATION_KIND_LABEL,notificationAge} from '../lib/notifications';
import './notification-drawer.css';

const ICONS={enquiry:Sparkles,message:MessageSquare,project_update:FileText,task_assigned:UserCheck,follow_up:Clock};
const FILTERS=[{value:'all',label:'All'},{value:'unread',label:'Unread'}];

// One bell for both views: live work still waiting (attention, worked out by the caller) and the saved history of updates.
// Without attention, as for studio contributors, the drawer shows updates only.
export function NotificationDrawer({studio,request,onOpen,attention=null}){
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[unread,setUnread]=useState(0),[byKind,setByKind]=useState({}),[cursor,setCursor]=useState(null);
 const [filter,setFilter]=useState('all'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(()=>Date.now()),[view,setView]=useState('attention');
 const trigger=useRef(null),generation=useRef(0);
 const base='/api/notifications?studio='+studio.id;

 const apply=useCallback((data,append=false)=>{setItems(prev=>append?[...prev,...data.notifications.filter(item=>!prev.some(p=>p.id===item.id))]:data.notifications);setUnread(data.unread);setByKind(data.unreadByKind||{});if(!append)setCursor(data.nextCursor);setClock(Date.now());},[]);
 const reload=useCallback(async()=>{const mine=++generation.current;try{const data=await request(base);if(mine!==generation.current)return;apply(data);setError('');}catch{if(mine===generation.current)setError('Notifications could not be refreshed. They will retry automatically.');}},[base,request,apply]);

 useEffect(()=>{setItems([]);setUnread(0);setByKind({});setCursor(null);reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},30000);return()=>{generation.current++;clearInterval(timer);};},[reload]);
 useEffect(()=>{if(open)reload();},[open,reload]);
 // Each person chooses whether new messages also reach them by email.
 const [email,setEmail]=useState(null);
 useEffect(()=>{if(!open)return;let active=true;request('/api/notifications/preferences?studio='+studio.id).then(data=>{if(active&&typeof data?.messageEmail==='boolean')setEmail(data);}).catch(()=>{});return()=>{active=false;};},[open,studio.id,request]);
 async function chooseEmail(messageEmail){const previous=email;setEmail({...email,messageEmail});try{setEmail(await request('/api/notifications/preferences?studio='+studio.id,'POST',{messageEmail}));}catch{setEmail(previous);setError('Your email choice could not be saved. Try again.');}}
 useEffect(()=>{if(open)setView(attention&&(attention.items.length||!unread)?'attention':'updates');},[open]);

 async function loadOlder(){if(!cursor||loading)return;setLoading(true);const mine=generation.current;try{const data=await request(base+'&before='+encodeURIComponent(cursor));if(mine!==generation.current)return;apply(data,true);setCursor(data.nextCursor);}catch{setError('Older notifications could not be loaded.');}finally{setLoading(false);}}
 async function mark(body,path='read'){const mine=++generation.current;try{const data=await request('/api/notifications/'+path+'?studio='+studio.id,'POST',{...body,limit:Math.max(20,items.length)});if(mine===generation.current){apply(data);setError('');}}catch{if(mine===generation.current)setError('That change could not be saved. Try again.');}}
 function chooseAttention(item){setOpen(false);attention.onOpen(item);}
 function choose(item){if(!item.read){setItems(prev=>prev.map(p=>p.id===item.id?{...p,read:true}:p));setUnread(count=>Math.max(0,count-1));setByKind(prev=>({...prev,[item.kind]:Math.max(0,(prev[item.kind]||0)-1)}));mark({ids:[item.id]});}setOpen(false);onOpen(item);}

 const shown=filter==='unread'?items.filter(item=>!item.read):items,waiting=attention?attention.items.length:0;
 // Unread messages and enquiries already appear under Needs attention, so the badge counts them once.
 const total=attention?waiting+(byKind.project_update||0)+(byKind.task_assigned||0)+(byKind.follow_up||0):unread;
 const label=attention?`Notifications, ${waiting} need${waiting===1?'s':''} attention, ${unread} unread`:`Notifications, ${unread} unread`;
 const updates=<>
   <div className="notification-drawer-toolbar">
    <WorkspaceFilters items={FILTERS} value={filter} onChange={setFilter} label="Show updates"/>
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
   :<WorkspaceEmpty icon={Inbox} title={filter==='unread'&&items.length?'Nothing unread':'No updates yet'} description={filter==='unread'&&items.length?'You have read everything here.':'New enquiries, messages, project updates and assignments will be kept here.'}/>}
   {cursor&&filter==='all'&&<div className="notification-drawer-more"><WorkspaceButton variant="secondary" size="small" loading={loading} onClick={loadOlder}>Show older</WorkspaceButton></div>}
 </>;
 const waitingList=attention&&<>
   {attention.items.length?<ul className="notification-drawer-list">{attention.items.slice(0,12).map(item=><li key={item.id}><button type="button" className="notification-drawer-item" onClick={()=>chooseAttention(item)}>
    <span className="notification-drawer-icon" aria-hidden="true">{item.kind==='message'?<MessageSquare size={16} strokeWidth={1.7}/>:item.kind.startsWith('task')?<UserCheck size={16} strokeWidth={1.7}/>:<FileText size={16} strokeWidth={1.7}/>}</span>
    <span className="notification-drawer-copy"><span className="notification-drawer-kind">{item.kind==='message'?'Message':item.kind.startsWith('task')?'Next step':'Project'}</span><strong>{item.label}</strong><small>{item.context}{item.detail?' · '+item.detail:''}</small></span>
   </button></li>)}</ul>
   :<WorkspaceEmpty icon={Bell} title="You’re up to date" description="New messages and decisions will appear here."/>}
   {attention.items.length>12&&<p className="notification-drawer-note">{attention.items.length-12} more items on Overview.</p>}
   {attention.loadError&&<p className="notification-drawer-error" role="status">Some items could not be refreshed. They will retry automatically.</p>}
   {attention.onOverview&&<div className="notification-drawer-more"><WorkspaceButton variant="secondary" size="small" onClick={()=>{setOpen(false);attention.onOverview();}}>Open overview</WorkspaceButton></div>}
 </>;
 return <>
  <button ref={trigger} type="button" className="folio-attention-trigger" aria-label={label} title="Notifications" onClick={()=>setOpen(true)}><Bell size={18} strokeWidth={1.6}/>{total>0&&<span className="folio-attention-count">{total>9?'9+':total}</span>}</button>
  <WorkspaceDialog open={open} onOpenChange={setOpen} drawer title="Notifications" description={attention?'Work waiting for you and recent updates.':'Updates from your projects and team.'} className="notification-drawer" returnFocusRef={trigger}>
   {attention?<WorkspaceTabs className="notification-drawer-tabs" label="Notification views" value={view} onChange={setView} items={[{value:'attention',label:`Needs attention${waiting?` (${waiting})`:''}`,content:waitingList},{value:'updates',label:`Updates${unread?` (${unread})`:''}`,content:updates}]}/>:updates}
   {email&&<div className="notification-drawer-email"><WorkspaceSwitch label="Email me about new messages" description={email.emailActive?'Sent a few minutes after a message arrives, unless you have already read it.':'Email is not switched on for this workspace yet. Your choice is saved for when it is.'} checked={email.messageEmail} onCheckedChange={chooseEmail}/></div>}
  </WorkspaceDialog>
 </>;
}
