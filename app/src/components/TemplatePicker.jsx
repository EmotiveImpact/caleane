import React,{useEffect,useRef,useState} from 'react';
import {FileText} from 'lucide-react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import '../studio-commerce.css';

const longDate=value=>value?new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'your date';

export function fillTemplate(body,values){return body.replace(/\{([a-z_]+)\}/g,(match,key)=>values[key]??match);}

// Owner-only: inserts a saved message template into a reply, with the
// client and project details filled in. The owner edits it before sending.
export function TemplatePicker({studio,clientName='',projectTitle='',projectDate='',onInsert}){
 const [open,setOpen]=useState(false),[templates,setTemplates]=useState(null),[bookingUrl,setBookingUrl]=useState(''),wrapper=useRef(null);
 useEffect(()=>{
  if(!open||templates)return;
  fetch(`/api/message-templates?studio=${studio.id}`,{credentials:'same-origin'}).then(r=>r.ok?r.json():{templates:[]}).then(d=>setTemplates(d.templates||[])).catch(()=>setTemplates([]));
  fetch(`/api/consultations?studio=${studio.id}`,{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.settings?.enabled)setBookingUrl(d.bookingUrl);}).catch(()=>{});
 },[open,templates,studio.id]);
 useEffect(()=>{if(!open)return;const close=event=>{if(!wrapper.current?.contains(event.target))setOpen(false);};const escape=event=>{if(event.key==='Escape')setOpen(false);};document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};},[open]);
 const values={client_first_name:clientName.split(' ')[0]||'there',client_name:clientName||'there',project_title:projectTitle||'your project',project_date:longDate(projectDate),studio_name:studio.name,booking_link:bookingUrl||`${location.origin}/book/${studio.slug}`,portal_link:`${location.origin}/login`};
 return <div className="template-picker" ref={wrapper}>
  <WorkspaceButton variant="ghost" size="small" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(!open)} tooltip="Insert a saved template"><FileText size={16}/>Templates</WorkspaceButton>
  {open&&<div className="template-picker-menu" role="menu" aria-label="Message templates">{!templates?<p className="commerce-muted">Loading…</p>:templates.length?templates.map(item=><button key={item.id} role="menuitem" type="button" onClick={()=>{onInsert(fillTemplate(item.body,values));setOpen(false);}}><strong>{item.name}</strong><small>{item.category||'General'}</small></button>):<p className="commerce-muted">No templates yet. Add them in Settings, Templates.</p>}</div>}
 </div>;
}
