import React,{useEffect,useState} from 'react';
import {LayoutTemplate} from 'lucide-react';
import {WorkspaceButton,WorkspaceCheckbox,WorkspaceConfirm,WorkspaceDialog,WorkspaceField} from './workspace/WorkspaceUI';
import {workflowFor} from '../lib/workflows';
import '../studio-commerce.css';
import '../project-templates.css';

const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const estimateTotal=estimate=>(estimate?.items||[]).reduce((sum,item)=>sum+item.quantity*item.unitAmount,0);

// One line saying what a template brings into a new project.
export function templateSummary(template){
 const parts=[];
 if(template.tasks?.length)parts.push(plural(template.tasks.length,'task'));
 if(template.estimate?.items?.length)parts.push(`estimate of ${money(estimateTotal(template.estimate),template.estimate.currency)} before tax`);
 return parts.length?parts.join(' · '):'Brief only';
}

// What choosing a template adds, as a sentence for Create project.
export function templateAdds(template){
 const tasks=template.tasks?.length,lines=template.estimate?.items?.length;
 const estimate=lines?`an estimate of ${money(estimateTotal(template.estimate),template.estimate.currency)} before tax, saved as a draft`:'';
 if(tasks&&estimate)return `Fills in the brief, adds ${plural(tasks,'task')} to the plan and ${estimate}.`;
 if(tasks)return `Fills in the brief and adds ${plural(tasks,'task')} to the plan.`;
 if(estimate)return `Fills in the brief and adds ${estimate}.`;
 return 'Fills in the brief.';
}

// Owner-only, on a project page. Keeps what repeats from job to job and
// leaves the client, messages, files and payments behind.
export function SaveAsTemplate({p,studio,request}){
 const source=p.estimateDraft||p.estimates?.at(-1);
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[tasks,setTasks]=useState(true),[estimate,setEstimate]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(null);
 function begin(){setName(p.brief?.occasion||'');setDescription('');setTasks(true);setEstimate(true);setError('');setSaved(null);setOpen(true);}
 async function save(event){
  event.preventDefault();setBusy(true);setError('');
  try{const result=await request('/api/project-templates?studio='+studio.id,'POST',{action:'create',projectId:p.id,name,description,include:{tasks,estimate}});setSaved(result.template);}
  catch(cause){setError(cause.message||'The template could not be saved. Please try again.');}
  finally{setBusy(false);}
 }
 const taskCount=p.tasks?.length||0,lineCount=source?.items?.length||0;
 return <>
  <WorkspaceButton variant="secondary" onClick={begin}><LayoutTemplate size={16}/><span className="project-template-label">Save as template</span></WorkspaceButton>
  <WorkspaceDialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}} className="project-template-dialog" title={saved?'Template saved':'Save as a template'} description={saved?undefined:'Start your next project of this kind from here. The client, messages, files and payments stay with this project.'}>
   {saved?<div className="project-template-saved" role="status">
    <p><strong>{saved.name}</strong> is ready. Choose it under <strong>Start from</strong> when you create a new project.</p>
    <p className="commerce-muted">{templateSummary(saved)}</p>
    <div className="commerce-form-actions"><WorkspaceButton onClick={()=>setOpen(false)}>Done</WorkspaceButton></div>
   </div>:<form className="project-template-form" onSubmit={save}>
    <WorkspaceField label="Template name" value={name} maxLength={80} required placeholder="For example, Wedding flowers package" onChange={e=>setName(e.target.value)}/>
    <WorkspaceField label="Note for yourself (optional)" hint="Shown when you choose a template.">
     <textarea rows={2} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/>
    </WorkspaceField>
    <fieldset className="project-template-include"><legend>Bring into each new project</legend>
     <p className="project-template-always">The kind of work, project type, starting idea and brief details.</p>
     <WorkspaceCheckbox label={taskCount?`The plan: ${plural(taskCount,'task')}, with dates moved to fit the new project`:'The plan (no tasks on this project yet)'} checked={tasks&&taskCount>0} disabled={!taskCount} onCheckedChange={value=>setTasks(value===true)}/>
     <WorkspaceCheckbox label={lineCount?`The estimate: ${plural(lineCount,'line')}, ${money(estimateTotal(source),source.currency)} before tax, as a draft to review`:'The estimate (no estimate on this project yet)'} checked={estimate&&lineCount>0} disabled={!lineCount} onCheckedChange={value=>setEstimate(value===true)}/>
    </fieldset>
    {error&&<p className="commerce-error" role="alert">{error}</p>}
    <div className="commerce-form-actions"><WorkspaceButton type="submit" loading={busy} disabled={!name.trim()}>{busy?'Saving…':'Save template'}</WorkspaceButton><WorkspaceButton variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancel</WorkspaceButton></div>
   </form>}
  </WorkspaceDialog>
 </>;
}

// Owner-only, in Settings, Templates: rename or delete saved project templates.
export function ProjectTemplateSettings({studio,request}){
 const [templates,setTemplates]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(''),[draft,setDraft]=useState({name:'',description:''}),[removing,setRemoving]=useState(null);
 useEffect(()=>{let active=true;request('/api/project-templates?studio='+studio.id).then(d=>{if(active)setTemplates(d.templates||[]);}).catch(e=>{if(active){setError(e.message);setTemplates([]);}});return()=>{active=false;};},[studio.id,request]);
 async function send(body){setBusy(true);setError('');try{const d=await request('/api/project-templates?studio='+studio.id,'POST',body);setTemplates(d.templates);return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 return <section className="project-template-settings" aria-labelledby="project-templates-title">
  <header className="settings-pane-heading"><h2 id="project-templates-title">Project templates</h2><p>Your own starting points, saved from real projects. Choose one under <strong>Start from</strong> when you create a project.</p></header>
  {error&&<p className="commerce-error" role="alert">{error}</p>}
  {!templates?<p className="commerce-muted">Loading project templates…</p>:!templates.length?<div className="project-template-empty"><LayoutTemplate size={20} aria-hidden="true"/><div><strong>No project templates yet</strong><p>Open a project you would like to repeat and choose <strong>Save as template</strong> at the top of the page.</p></div></div>:
  <ul className="commerce-list project-template-list">{templates.map(item=><li key={item.id}>{editing===item.id?<form className="project-template-edit" onSubmit={async e=>{e.preventDefault();if(await send({action:'update',id:item.id,...draft}))setEditing('');}}>
    <WorkspaceField label="Template name" value={draft.name} maxLength={80} required onChange={e=>setDraft({...draft,name:e.target.value})}/>
    <WorkspaceField label="Note for yourself (optional)"><textarea rows={2} maxLength={500} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></WorkspaceField>
    <div className="commerce-form-actions"><WorkspaceButton type="submit" size="small" disabled={busy||!draft.name.trim()}>Save</WorkspaceButton><WorkspaceButton variant="ghost" size="small" onClick={()=>setEditing('')}>Cancel</WorkspaceButton></div>
   </form>:<><div><strong>{item.name}</strong><small>{workflowFor(studio,{brief:{workflowType:item.brief?.workflowType}}).name} · {item.brief?.occasion||'Any project type'}</small><p>{item.description||templateSummary(item)}</p>{item.description&&<p className="commerce-muted">{templateSummary(item)}</p>}</div>
   <div className="commerce-row-actions"><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>{setEditing(item.id);setDraft({name:item.name,description:item.description||''});}}>Edit</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>setRemoving(item)}>Delete</WorkspaceButton></div></>}</li>)}</ul>}
  <WorkspaceConfirm open={!!removing} onOpenChange={value=>{if(!value)setRemoving(null);}} title={`Delete “${removing?.name||''}”?`} description="Projects already started from it keep their tasks and estimate. You can save a new template from any project." confirmLabel="Delete template" onConfirm={()=>{const target=removing;setRemoving(null);if(target)send({action:'delete',id:target.id});}}/>
 </section>;
}
