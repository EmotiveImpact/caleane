import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Bell,Inbox,MessageSquare,FileText,UserCheck,Sparkles,Clock,Mail} from 'lucide-react';
import {WorkspaceDialog,WorkspaceButton,WorkspaceEmpty,WorkspaceFilters,WorkspaceTabs} from './workspace/WorkspaceUI';
import {MessageEmailSetting} from './MessageEmailSetting';
import {NOTIFICATION_KIND_LABEL,notificationAge,notificationAction,attentionAction,groupByDay} from '../lib/notifications';
import './notification-drawer.css';

const ICONS={enquiry:Sparkles,message:MessageSquare,project_update:FileText,task_assigned:UserCheck,follow_up:Clock};
const FILTERS=[{value:'all',label:'All'},{value:'unread',label:'Unread'}];
const attentionIcon=item=>item.kind==='message'?MessageSquare:item.kind==='enquiry'?Sparkles:item.kind==='task'||item.kind.startsWith('task-')?UserCheck:FileText;
const attentionKind=item=>item.kind==='message'?'Message':item.kind==='task'||item.kind.startsWith('task-')?'Next step':'Project';
// The project or client, then the detail, skipping a detail the project title already says ("Brand launch · Noah Williams").
const attentionContext=item=>[item.context,item.detail&&!String(item.context||'').includes(item.detail)?item.detail:''].filter(Boolean).join(' · ');
const isDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');

// One boxed card per item. Its own button says what it does; clicking anywhere else on the card does the same.
// Only the button takes keyboard focus, so each card is a single stop.
function NotificationCard({icon:Icon,kind,unread=false,read=false,title,context,time,action,onOpen,children}){
 return <li className={'notification-card'+(unread?' is-unread':read?' is-read':'')} onClick={event=>{if(!event.target.closest('button,a'))onOpen();}}>
  <span className="notification-card-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.7}/></span>
  <div className="notification-card-body">
   <div className="notification-card-head"><strong><span className="sr-only">{kind}{unread?', unread':''}: </span>{title}</strong>{time&&<span className="notification-card-time">{time}</span>}</div>
   {context&&<p className="notification-card-context">{context}</p>}
   <div className="notification-card-actions"><WorkspaceButton variant="secondary" size="small" className="notification-card-action" aria-label={`${action}: ${title}`} onClick={onOpen}>{action}</WorkspaceButton>{children}</div>
  </div>
 </li>;
}

function Grouped({groups,render}){
 return groups.map(group=><section key={group.key} className="notification-group">
  {group.label&&<h3 className="notification-group-label">{group.label}</h3>}
  <ul className="notification-card-list">{group.items.map(render)}</ul>
 </section>);
}

// One bell for both views: live work still waiting (attention, worked out by the caller) and the saved history of updates.
// Without attention, as for studio contributors, the drawer shows updates only.
// onEmailSettings, for people who have Settings, swaps the email switch for a link to where it lives.
export function NotificationDrawer({studio,request,onOpen,attention=null,onEmailSettings=null}){
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[unread,setUnread]=useState(0),[byKind,setByKind]=useState({}),[cursor,setCursor]=useState(null);
 const [filter,setFilter]=useState('all'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(()=>Date.now()),[view,setView]=useState('attention');
 const trigger=useRef(null),generation=useRef(0);
 const base='/api/notifications?studio='+studio.id;

 const apply=useCallback((data,append=false)=>{setItems(prev=>append?[...prev,...data.notifications.filter(item=>!prev.some(p=>p.id===item.id))]:data.notifications);setUnread(data.unread);setByKind(data.unreadByKind||{});if(!append)setCursor(data.nextCursor);setClock(Date.now());},[]);
 const reload=useCallback(async()=>{const mine=++generation.current;try{const data=await request(base);if(mine!==generation.current)return;apply(data);setError('');}catch{if(mine===generation.current)setError('Notifications could not be refreshed. They will retry automatically.');}},[base,request,apply]);

 useEffect(()=>{setItems([]);setUnread(0);setByKind({});setCursor(null);reload();const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},30000);return()=>{generation.current++;clearInterval(timer);};},[reload]);
 useEffect(()=>{if(open){reload();setClock(Date.now());}},[open,reload]);
 useEffect(()=>{if(open)setView(attention&&(attention.items.length||!unread)?'attention':'updates');},[open]);

 async function loadOlder(){if(!cursor||loading)return;setLoading(true);const mine=generation.current;try{const data=await request(base+'&before='+encodeURIComponent(cursor));if(mine!==generation.current)return;apply(data,true);setCursor(data.nextCursor);}catch{setError('Older notifications could not be loaded.');}finally{setLoading(false);}}
 async function mark(body,path='read'){const mine=++generation.current;try{const data=await request('/api/notifications/'+path+'?studio='+studio.id,'POST',{...body,limit:Math.max(20,items.length)});if(mine===generation.current){apply(data);setError('');}}catch{if(mine===generation.current)setError('That change could not be saved. Try again.');}}
 function chooseAttention(item){setOpen(false);attention.onOpen(item);}
 function choose(item){if(!item.read){setItems(prev=>prev.map(p=>p.id===item.id?{...p,read:true}:p));setUnread(count=>Math.max(0,count-1));setByKind(prev=>({...prev,[item.kind]:Math.max(0,(prev[item.kind]||0)-1)}));mark({ids:[item.id]});}setOpen(false);onOpen(item);}
 function leave(go){setOpen(false);go();}

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
   {shown.length?<Grouped groups={groupByDay(shown,item=>item.createdAt,clock)} render={item=><NotificationCard key={item.id} icon={ICONS[item.kind]||Inbox} kind={NOTIFICATION_KIND_LABEL[item.kind]} unread={!item.read} read={item.read} title={item.title} context={item.detail} time={notificationAge(item.createdAt,clock)} action={notificationAction(item)} onOpen={()=>choose(item)}>
     {item.read&&<button type="button" className="notification-card-unread" onClick={()=>mark({ids:[item.id]},'unread')}>Mark unread</button>}
    </NotificationCard>}/>
   :<WorkspaceEmpty icon={Inbox} title={filter==='unread'&&items.length?'Nothing unread':'No updates yet'} description={filter==='unread'&&items.length?'You have read everything here.':'New enquiries, messages, project updates and assignments will be kept here.'}/>}
   {cursor&&filter==='all'&&<div className="notification-drawer-more"><WorkspaceButton variant="secondary" size="small" loading={loading} onClick={loadOlder}>Show older</WorkspaceButton></div>}
 </>;
 const listed=attention?attention.items.slice(0,12):[];
 const waitingList=attention&&<>
   {listed.length?<Grouped groups={groupByDay(listed,item=>item.at,clock)} render={item=><NotificationCard key={item.id} icon={attentionIcon(item)} kind={attentionKind(item)} title={item.label} context={attentionContext(item)} time={item.at&&!isDay(item.at)?notificationAge(item.at,clock):''} action={attentionAction(item)} onOpen={()=>chooseAttention(item)}/>}/>
   :<WorkspaceEmpty icon={Bell} title="You’re up to date" description="New messages and decisions will appear here."/>}
   {attention.items.length>12&&attention.onOverview&&<p className="notification-drawer-note"><button type="button" className="notification-drawer-link" onClick={()=>leave(attention.onOverview)}>{attention.items.length-12} more on Overview</button></p>}
   {attention.loadError&&<p className="notification-drawer-error" role="status">Some items could not be refreshed. They will retry automatically.</p>}
 </>;
 return <>
  <button ref={trigger} type="button" className="folio-attention-trigger" aria-label={label} title="Notifications" onClick={()=>setOpen(true)}><Bell size={18} strokeWidth={1.6}/>{total>0&&<span className="folio-attention-count">{total>9?'9+':total}</span>}</button>
  <WorkspaceDialog open={open} onOpenChange={setOpen} drawer title="Notifications" description={attention?'Work waiting for you and recent updates.':'Updates from your projects and team.'} className="notification-drawer" returnFocusRef={trigger}>
   <div className="notification-drawer-main">{attention?<WorkspaceTabs className="notification-drawer-tabs" label="Notification views" value={view} onChange={setView} items={[{value:'attention',label:`Needs attention${waiting?` (${waiting})`:''}`,content:waitingList},{value:'updates',label:`Updates${unread?` (${unread})`:''}`,content:updates}]}/>:updates}</div>
   {onEmailSettings?<footer className="notification-drawer-foot">
     <button type="button" className="notification-drawer-link" onClick={()=>leave(onEmailSettings)}><Mail size={14} strokeWidth={1.7} aria-hidden="true"/>Email settings</button>
    </footer>
   :<MessageEmailSetting className="notification-drawer-email" studio={studio} request={request}/>}
  </WorkspaceDialog>
 </>;
}
