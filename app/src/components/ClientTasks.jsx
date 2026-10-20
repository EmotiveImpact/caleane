import React,{useState} from 'react';
import {Check} from 'lucide-react';
import {WorkspaceConfirm} from './workspace/WorkspaceUI';
import {shortDate} from '../lib/studio-view';
import './client-tasks.css';

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const byDue=(a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999');

// A follow-up saved on the client before tasks lived on the record reads as one more open task.
export function clientTodos(client,tasks){
 const open=tasks.filter(t=>t.clientId===client?.id&&!t.completed).map(t=>({...t,kind:'task'}));
 if(client?.followUp)open.push({id:'follow-up',kind:'follow-up',title:client.followUpNote||`Follow up with ${client.name}`,dueDate:client.followUp,priority:'Normal'});
 return open.sort(byDue);
}
export const nextTodo=(client,tasks)=>clientTodos(client,tasks)[0]||null;

// Follow-ups and tasks for one client, in one list that can be ticked off.
export function ClientTasks({studio,client,tasks,request,run,busy,onTasks,onClient}){
 const [removing,setRemoving]=useState(null),[showDone,setShowDone]=useState(false);const q='?studio='+studio.id,due=today();
 const open=clientTodos(client,tasks),done=tasks.filter(t=>t.clientId===client.id&&t.completed).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
 async function add(e){e.preventDefault();const form=e.currentTarget,data=Object.fromEntries(new FormData(form));const d=await run(()=>request('/api/crm/tasks'+q,'POST',{...data,clientId:client.id}));if(d){onTasks(list=>[...list,d.task]);form.reset();}}
 async function toggle(t){if(t.kind==='follow-up'){const d=await run(()=>request(`/api/clients/${client.id}${q}`,'PATCH',{followUpDone:true}));if(d)onClient(d.client);return;}const d=await run(()=>request(`/api/crm/tasks/${t.id}${q}`,'PATCH',{completed:!t.completed}));if(d)onTasks(list=>list.map(x=>x.id===t.id?d.task:x));}
 async function remove(t){const d=await run(()=>request(`/api/crm/tasks/${t.id}${q}`,'PATCH',{remove:true}));if(d)onTasks(list=>list.filter(x=>x.id!==t.id));}
 const row=t=><article key={t.id} className={t.completed?'done':''}><button type="button" className="crm-task-complete" disabled={busy} onClick={()=>toggle(t)} aria-label={(t.completed?'Reopen ':'Mark done: ')+t.title}>{t.completed&&<Check size={15}/>}</button><div><strong>{t.title}</strong>{t.detail&&<p>{t.detail}</p>}<small>{t.kind==='follow-up'?'Follow-up':t.opportunityTitle||'Relationship task'}{t.completed&&t.completedAt?' · done '+shortDate(t.completedAt):''}{t.kind!=='follow-up'&&<> · <button type="button" aria-label={'Delete '+t.title} disabled={busy} onClick={()=>setRemoving(t)}>Delete</button></>}</small></div><span className={'crm-priority '+String(t.priority).toLowerCase()}>{t.priority}</span><time className={t.dueDate&&t.dueDate<due&&!t.completed?'overdue':''}>{t.dueDate?shortDate(t.dueDate):'No due date'}</time></article>;
 return <section className="folio-overview crm-client-panel client-tasks">
  <div className="crm-section-title"><h2>Tasks and follow-ups</h2><span>{open.length}</span></div>
  <p>Next steps with {client.name.split(' ')[0]}. They also appear in Tasks and on the Calendar.</p>
  <form className="crm-client-activity-form" onSubmit={add}><div><input name="title" required maxLength="200" placeholder="What needs to happen next?" aria-label="Task"/><input name="dueDate" type="date" aria-label="Due date"/><select name="priority" aria-label="Priority" defaultValue="Normal"><option>Normal</option><option>High</option><option>Low</option></select></div><button className="crm-secondary" disabled={busy}>Add task</button></form>
  <div className="crm-task-list">{open.map(row)}{!open.length&&<p className="crm-empty">Nothing waiting. Add a follow-up so the next step isn’t forgotten.</p>}</div>
  {done.length>0&&<><button type="button" className="folio-text-button client-tasks-done-toggle" aria-expanded={showDone} onClick={()=>setShowDone(v=>!v)}>{showDone?'Hide':'Show'} done ({done.length})</button>{showDone&&<div className="crm-task-list">{done.map(row)}</div>}</>}
  <WorkspaceConfirm open={!!removing} onOpenChange={v=>{if(!v)setRemoving(null);}} title="Delete this task?" description={removing?`“${removing.title}” will be removed from this client and from Tasks.`:''} confirmLabel="Delete task" onConfirm={()=>remove(removing)}/>
 </section>;
}
