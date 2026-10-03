import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Search,FolderClosed,UsersRound,TrendingUp,ListTodo,Receipt} from 'lucide-react';
import {WorkspaceFilters} from './workspace/WorkspaceUI';

const icons={project:FolderClosed,client:UsersRound,opportunity:TrendingUp,task:ListTodo,invoice:Receipt};
const scopes={projects:'Projects',clients:'Clients',pipeline:'Pipeline',tasks:'Tasks',finances:'Invoices'};
export function WorkspaceSearch({studio,section,request,onOpenResult}){
 const context=Object.hasOwn(scopes,section)?section:'all';
 const [open,setOpen]=useState(false),[scope,setScope]=useState(context),[query,setQuery]=useState(''),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(0);
 const input=useRef(null);
 function changeOpen(next){if(next)setScope(context);setOpen(next);}
 useEffect(()=>{setOpen(false);},[section,studio.id]);
 useEffect(()=>{
  const key=event=>{
   const element=document.activeElement,editing=element?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(element?.tagName);
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();changeOpen(!open);}
   else if(event.key==='/'&&!open&&!editing){event.preventDefault();changeOpen(true);}
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[open,context]);
 useEffect(()=>{
  setData(null);setError('');setActive(0);
  if(!open){setQuery('');setLoading(false);return;}
  const term=query.trim();if(term.length<2){setLoading(false);return;}
  let current=true;setLoading(true);
  const timer=setTimeout(()=>request('/api/search?studio='+studio.id+'&scope='+scope+'&q='+encodeURIComponent(term)).then(result=>{if(current)setData(result);}).catch(err=>{if(current)setError(err.message);}).finally(()=>{if(current)setLoading(false);}),180);
  return()=>{current=false;clearTimeout(timer);};
 },[open,query,scope,studio.id]);
 const items=useMemo(()=>data?.groups.flatMap(group=>group.items)||[],[data]);
 function choose(item){setOpen(false);onOpenResult(item);}
 function keyDown(event){
  if(event.key==='ArrowDown'){event.preventDefault();setActive(index=>Math.max(0,Math.min(items.length-1,index+1)));}
  if(event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,index-1));}
  if(event.key==='Enter'&&!loading&&items[active]){event.preventDefault();choose(items[active]);}
 }
 let offset=0;
 const scopeName=scope==='all'?'your workspace':scopes[scope].toLowerCase();
 return <Dialog.Root open={open} onOpenChange={changeOpen}>
  <Dialog.Trigger asChild><button className="workspace-search-trigger" type="button" aria-label="Search workspace"><Search size={16}/><span>Search workspace</span><kbd>⌘ K</kbd></button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className="workspace-search-overlay"/><Dialog.Content className="workspace-search-dialog" aria-describedby={undefined}>
   <Dialog.Title className="folio-sr-only">Search workspace</Dialog.Title>
   <div className="workspace-search-input"><Search size={19}/><input ref={input} autoFocus aria-label="Search workspace records" placeholder={`Search ${scopeName}…`} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={keyDown}/><button type="button" aria-label="Close search" onClick={()=>setOpen(false)}>Esc</button></div>
   {context!=='all'&&<WorkspaceFilters className="workspace-search-scopes" label="Search scope" value={scope} items={[{value:context,label:scopes[context]},{value:'all',label:'All workspace'}]} onChange={value=>{setScope(value);input.current?.focus();}}/>}
   <div className="folio-sr-only" role="status">{loading?'Searching':data?`${data.total} matches`:error}</div>
   <div className="workspace-search-results">{error?<p className="workspace-search-empty" role="alert">{error}</p>:query.trim().length<2?<div className="workspace-search-empty">{scope==='all'?'Find projects, clients, opportunities, tasks and invoices.':`Find ${scopeName} across your studio.`}</div>:loading?<div className="workspace-search-empty">Searching…</div>:items.length===0?<div className="workspace-search-empty">No matches in {scopeName} for “{query.trim()}”.{scope!=='all'&&<button className="workspace-search-widen" onClick={()=>setScope('all')}>Search all workspace</button>}</div>:data.groups.map(group=>{
    const start=offset;offset+=group.items.length;
    return <section key={group.label}><h3>{group.label}</h3>{group.items.map((item,index)=>{const ItemIcon=icons[item.type];return <button className={'workspace-search-result'+(active===start+index?' is-active':'')} key={item.type+item.id} type="button" onMouseEnter={()=>setActive(start+index)} onClick={()=>choose(item)}><span className="workspace-search-icon"><ItemIcon size={17}/></span><span className="workspace-search-result-text"><strong>{item.title}</strong><small>{item.subtitle}</small></span><span className="workspace-search-result-meta">{item.meta}</span></button>;})}</section>;
   })}</div>
   <footer className="workspace-search-footer"><span>{data?.total>items.length?`Showing ${items.length} of ${data.total} matches`:`Search ${scopeName}`}</span><span>↑ ↓ to move · ↵ to open</span></footer>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
