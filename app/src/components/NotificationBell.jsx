import React,{useEffect,useRef,useState} from 'react';
import {WorkspaceDialog,WorkspaceButton,WorkspaceFilters,WorkspaceEmpty} from './workspace/WorkspaceUI';
import {Bell,MessageSquare,CheckSquare,FileText,FileImage,Check,Eye} from 'lucide-react';
import './notification-centre.css';
const iconFor=kind=>kind==='message'?MessageSquare:kind.startsWith('task')?CheckSquare:kind==='design'||['approval','feedback','comment','stale'].includes(kind)?FileImage:FileText;
const when=stamp=>new Date(stamp).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const initial={actions:[],updates:[],unreadCount:0,total:0,offset:0,limit:25,watermark:0};

export function NotificationBell({studio,userId,projects,request,onOpen}){
 const [open,setOpen]=useState(false),[mode,setMode]=useState('Action required'),[filter,setFilter]=useState('unread'),[offset,setOffset]=useState(0),[actionLimit,setActionLimit]=useState(25);
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const reload=useRef(null),sequence=useRef(0),trigger=useRef(null),identity=useRef('');
 const identityKey=studio.id+':'+userId;identity.current=identityKey;
 const projectVersion=JSON.stringify((projects||[]).map(p=>[p.id,p.updatedAt,p.unreadMessages,p.enquiryReviewedAt]));
 useEffect(()=>{setData(initial);setOffset(0);setError('');setBusy(false);setOpen(false);setActionLimit(25);},[identityKey]);
 useEffect(()=>{
  let active=true;
  async function load(quiet=false){
   const version=++sequence.current;if(!quiet)setLoading(true);
   try{const next=await request(`/api/notification-centre?studio=${studio.id}&filter=${filter}&offset=${offset}`);if(active&&version===sequence.current){setData(next);setError('');if(next.offset!==offset)setOffset(next.offset);}}
   catch(e){if(active&&version===sequence.current)setError(e.message||'Notifications could not be loaded.');}
   finally{if(active&&version===sequence.current)setLoading(false);}
  }
  reload.current=load;load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load(true);},20000);
  const focused=()=>load(true);window.addEventListener('focus',focused);
  return()=>{active=false;sequence.current++;clearInterval(timer);window.removeEventListener('focus',focused);};
 },[identityKey,request,filter,offset,projectVersion]);
 async function changeRead(body,then){
  if(busy)return;const target=identityKey;setBusy(true);setError('');sequence.current++;
  try{await request('/api/notification-centre?studio='+studio.id,'POST',body);if(identity.current!==target)return;await reload.current?.(true);if(then){setOpen(false);onOpen(then.destination);}}
  catch(e){if(identity.current===target)setError(e.message||'The read state could not be saved.');}
  finally{if(identity.current===target)setBusy(false);}
 }
 function follow(item){setOpen(false);onOpen(item.destination);}
 const items=mode==='Action required'?data.actions.slice(0,actionLimit):data.updates;
 const sectionName=mode==='Action required'?'action items':'updates';
 return <>
  <button ref={trigger} type="button" className="folio-attention-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications, ${data.unreadCount} unread updates, ${data.actions.length} actions`} onClick={()=>{setMode(data.actions.length?'Action required':'Updates');setOpen(true);reload.current?.(true);}}><Bell size={18} strokeWidth={1.6}/>{data.unreadCount>0&&<span className="folio-attention-count">{data.unreadCount>99?'99+':data.unreadCount}</span>}</button>
  <WorkspaceDialog open={open} onOpenChange={setOpen} drawer returnFocusRef={trigger} className="notification-drawer" title="Notifications" description="The work waiting for you, and what changed.">
   <div className="notification-views"><WorkspaceFilters label="Notification view" items={[{value:'Action required',label:`Action required (${data.actions.length})`},{value:'Updates',label:`Updates (${data.unreadCount})`}]} value={mode} onChange={setMode}/></div>
   {mode==='Updates'?<div className="notification-tools"><WorkspaceFilters label="Update filter" value={filter} onChange={value=>{setFilter(value);setOffset(0);}} items={[{value:'unread',label:'Unread'},{value:'all',label:'All updates'}]}/><WorkspaceButton variant="ghost" size="small" disabled={busy||loading||!data.unreadCount} onClick={()=>changeRead({action:'read-all',through:data.watermark})}>Mark all read</WorkspaceButton></div>:<p className="notification-explanation">Items stay here until the work is resolved.</p>}
   {error&&<div className="notification-error" role="alert"><p>{error}</p><WorkspaceButton variant="secondary" size="small" disabled={busy} onClick={()=>reload.current?.()}>Retry</WorkspaceButton></div>}
   {loading?<p className="notification-loading" role="status">Loading {sectionName}…</p>:<div className="notification-items">
    {items.map(item=>{const Icon=iconFor(item.kind),update=mode==='Updates';return <article key={item.id} className={'notification-item '+(update&&!item.readAt?'is-unread':'')}>
     <span className="notification-icon"><Icon size={18} strokeWidth={1.6}/></span>
     <div className="notification-copy"><button className="notification-open" disabled={busy} aria-label={'Open '+item.label} onClick={()=>update?changeRead({action:'read',id:item.id,read:true},item):follow(item)}><strong>{item.label}</strong><span>{item.context}</span>{item.detail&&<small>{item.detail}</small>}</button>{update&&<div className="notification-meta"><time dateTime={item.at}>{when(item.at)}</time>{item.actor&&<span>{item.actor}</span>}</div>}</div>
     {update?<button type="button" className="notification-read-toggle" disabled={busy} aria-label={(item.readAt?'Mark unread: ':'Mark read: ')+item.label} title={item.readAt?'Mark unread':'Mark read'} onClick={()=>changeRead({action:'read',id:item.id,read:!item.readAt})}>{item.readAt?<Eye size={15}/>:<><i aria-hidden="true"/><Check size={15}/></>}</button>:null}
    </article>})}
    {!items.length&&!error&&<WorkspaceEmpty icon={mode==='Action required'?CheckSquare:Bell} title={mode==='Action required'?'Nothing needs action right now.':filter==='unread'?'You’re caught up.':'No updates yet.'} description={mode==='Action required'?'New enquiries, due tasks and client decisions will appear here.':filter==='unread'?'Switch to All updates to see your history.':'Shared work and incoming messages will appear here.'}/>}
   </div>}
   {mode==='Action required'&&data.actions.length>actionLimit&&<WorkspaceButton variant="secondary" onClick={()=>setActionLimit(n=>n+25)}>Show more ({data.actions.length-actionLimit})</WorkspaceButton>}
   {mode==='Updates'&&data.total>25&&<nav className="notification-pagination" aria-label="Update pages"><WorkspaceButton variant="ghost" size="small" disabled={busy||loading||data.offset===0} onClick={()=>setOffset(Math.max(0,data.offset-25))}>Previous</WorkspaceButton><span>{data.offset+1}–{Math.min(data.offset+25,data.total)} of {data.total}</span><WorkspaceButton variant="ghost" size="small" disabled={busy||loading||data.offset+25>=data.total} onClick={()=>setOffset(data.offset+25)}>Next</WorkspaceButton></nav>}
   <p className="notification-footer">{mode==='Updates'?'The bell counts unread updates. Marking an update read does not complete the work.':'Open an item to review it in context.'}</p>
  </WorkspaceDialog>
 </>;
}
