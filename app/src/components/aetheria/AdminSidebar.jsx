// Studio Folio shell. Navigation and account authority remain backed by the API.
import React,{useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {WorkspacePopover,WorkspaceSelect,WorkspaceTooltip} from '../workspace/WorkspaceUI';
import {House,FolderClosed,Columns3,ListTodo,UserRound,Settings2,LogOut,CalendarDays,Mail,Images,Menu,X,ReceiptText,ClipboardList,FileText,CircleCheck,UsersRound,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
const ownerItems=[['overview','Overview',House],['projects','Projects',FolderClosed],['clients','Clients',UserRound],['forms','Forms',ClipboardList],['briefs','Briefs',FileText],['approvals','Approvals',CircleCheck],['pipeline','Pipeline',Columns3],['tasks','Tasks',ListTodo],['finances','Finances',ReceiptText],['inbox','Messages',Mail],['calendar','Calendar',CalendarDays],['library','Library',Images]];
const staffItems=[['overview','Overview',House],['projects','Projects',FolderClosed]];
const clientItems=[['overview','Overview',House],['projects','Projects',FolderClosed],['approvals','Approvals',CircleCheck],['inbox','Messages',Mail]];
const SIDEBAR_PREFERENCE='caleane.sidebar.collapsed';
function savedSidebarPreference(){try{return window.localStorage.getItem(SIDEBAR_PREFERENCE)==='true';}catch{return false;}}
function useMobileNavigation(){
 const [isMobile,setIsMobile]=useState(()=>window.matchMedia?.('(max-width:760px)').matches||false);
 useEffect(()=>{
  const media=window.matchMedia?.('(max-width:760px)');
  if(!media)return;
  const update=()=>setIsMobile(media.matches);
  update();media.addEventListener('change',update);
  return ()=>media.removeEventListener('change',update);
 },[]);
 return isMobile;
}
export function AdminSidebar({studio,session,owner,staffViewer=false,view,navigate,signOut,studioId,onStudioChange,rememberPreference=true,badges={}}){
 const [mobile,setMobile]=useState(false),[account,setAccount]=useState(false);
 const [collapsed,setCollapsed]=useState(()=>rememberPreference?savedSidebarPreference():false);
 const isMobile=useMobileNavigation(),compact=collapsed&&!isMobile;
 useEffect(()=>{
  if(rememberPreference)try{window.localStorage.setItem(SIDEBAR_PREFERENCE,String(collapsed));}catch{/* Layout still works when local storage is unavailable. */}
 },[collapsed,rememberPreference]);
 useEffect(()=>{setMobile(false);setAccount(false);},[isMobile]);
 const setNavigationOpen=open=>{setMobile(open);if(!open)setAccount(false);};
 const go=key=>{navigate(key);setNavigationOpen(false);setAccount(false);};
 const labelTip=(label,child)=><WorkspaceTooltip label={label} side="right" disabled={!compact}>{child}</WorkspaceTooltip>;
 const rail=<aside id="workspace-navigation" className={'folio-rail'+(isMobile?' is-open':'')} data-collapsed={compact} aria-label="Main navigation">
 {isMobile&&<><Dialog.Title className="folio-sr-only">Workspace navigation</Dialog.Title><Dialog.Close className="folio-mobile-close" aria-label="Close navigation"><X size={20}/></Dialog.Close></>}
 <a href="/" className="folio-rail-brand" aria-label="Caleane home" title={`Caleane · ${studio.name}`}><img className="calenne-symbol" src="/assets/identity/calenne-symbol-ivory.svg" alt=""/><span className="folio-brand-name">Caleane</span></a>
 <nav aria-label="Workspace">{(owner?ownerItems:staffViewer?staffItems:clientItems).map(([key,label,NavIcon])=>{const count=badges[key]||0,spoken=count?`${label}, ${count} ${key==='inbox'?(owner?(count===1?'needs a reply':'need a reply'):'unread'):'waiting'}`:label;return <WorkspaceTooltip key={key} label={spoken} side="right" disabled={!compact}><button type="button" aria-label={spoken} aria-current={view===key?'page':undefined} className={view===key?'active':''} onClick={()=>go(key)}><NavIcon size={20} strokeWidth={1.55} aria-hidden="true"/><span className="folio-nav-label">{label}</span>{count>0&&<span className="folio-nav-badge" aria-hidden="true">{count>9?'9+':count}</span>}</button></WorkspaceTooltip>;})}</nav>
 <div className="folio-rail-bottom">{owner&&labelTip('Team',<button type="button" aria-label="Team" className={'folio-settings'+(view==='members'?' active':'')} aria-current={view==='members'?'page':undefined} onClick={()=>go('members')}><UsersRound size={22} strokeWidth={1.55} aria-hidden="true"/><span className="folio-nav-label">Team</span></button>)}{owner&&labelTip('Settings',<button type="button" aria-label="Settings" className={'folio-settings'+(view==='settings'?' active':'')} aria-current={view==='settings'?'page':undefined} onClick={()=>go('settings')}><Settings2 size={22} strokeWidth={1.55} aria-hidden="true"/><span className="folio-nav-label">Settings</span></button>)}
 {!isMobile&&labelTip(compact?'Expand sidebar':'Collapse sidebar',<button type="button" className="folio-settings folio-rail-collapse" aria-label={compact?'Expand sidebar':'Collapse sidebar'} aria-expanded={!compact} aria-controls="workspace-navigation" onClick={()=>{setCollapsed(value=>!value);setAccount(false);}}>{compact?<PanelLeftOpen size={18} aria-hidden="true"/>:<PanelLeftClose size={18} aria-hidden="true"/>}<span className="folio-nav-label">Collapse sidebar</span></button>)}
 <WorkspacePopover open={account} onOpenChange={setAccount} side="right" align="end" className="ws-account-popover" trigger={<button className="folio-account-toggle" aria-label="Your account and studios"><span>{session.user.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('')}</span><span className="studio-account-label"><strong>{session.user.name}</strong><small>{owner?'Studio owner':staffViewer?'Studio member':'Client workspace'}</small></span></button>}>
 <div id="folio-account-menu" className="folio-account-menu"><strong>{session.user.name}</strong><small>{owner?'Studio owner':staffViewer?'Studio member':'Client'}</small><div className="folio-current-studio">{studio.branding?.logoUrl&&<img src={studio.branding.logoUrl} alt=""/>}<span>{studio.name}<small>{owner?'Studio workspace':staffViewer?'Studio workspace':'Client portal'}</small></span></div>{session.studios.length>1&&<label>Switch studio<WorkspaceSelect label="Switch studio" value={studioId} onValueChange={value=>{onStudioChange(value);setAccount(false);}} options={session.studios.map(s=>({value:s.id,label:s.name}))}/></label>}<button onClick={()=>{location.href="/account";}}><Settings2 size={16}/><span>Account security</span></button><button onClick={()=>{setAccount(false);signOut();}}><LogOut size={16}/><span>Sign out</span></button></div></WorkspacePopover>
 </div>
 </aside>;
 if(!isMobile)return rail;
 return <Dialog.Root open={mobile} onOpenChange={setNavigationOpen}>
  <Dialog.Trigger asChild><button type="button" className="folio-menu-toggle" aria-label="Open navigation"><Menu size={20}/></button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className="folio-nav-scrim"/><Dialog.Content asChild aria-describedby={undefined}>{rail}</Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
