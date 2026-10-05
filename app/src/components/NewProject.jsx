import React,{useEffect,useId,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Check,FolderPlus,MessageSquareText,Plus,X} from 'lucide-react';
import {briefFieldsFor,DEFAULT_WORKFLOW,projectTypesFor,workflowFor,workflowOptionsFor} from '../lib/workflows';

const previewImages={
 'event-styling':'/assets/candlelit-table.webp',
 'event-planning':'/assets/hospitality-studio.webp',
 'wedding-planning':'/assets/blush-celebration.webp',
 'floral-design':'/assets/sage-blush-florals.webp',
 'balloon-styling':'/assets/blush-celebration.webp',
 'interior-design':'/assets/interiors-studio.webp',
 'creative-studio':'/assets/campaign-set.webp',
 'bespoke-making':'/assets/silk-detail.webp',
 'photo-film':'/assets/campaign-set.webp',
 'general':'/assets/silk-detail.webp'
};

function previewDate(value){if(!value)return 'To be decided';const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}

function emptyProject(studio,client){return {
 name:client?.name||'',email:client?.email||'',
 workflowType:studio.branding?.profession||DEFAULT_WORKFLOW,
 occasion:'',date:'',venue:'',vision:'',details:{}
};}

export function NewProject({studio,request,busy,onCreate,client,onOpenPipeline}){
 const [open,setOpen]=useState(false);
 const [mode,setMode]=useState('blank');
 const [form,setForm]=useState(()=>emptyProject(studio,client));
 const [opportunities,setOpportunities]=useState([]);
 const [opportunitiesLoading,setOpportunitiesLoading]=useState(false);
 const [opportunitiesError,setOpportunitiesError]=useState('');
 const [selectedId,setSelectedId]=useState('');
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState('');
 const projectTypesId=useId();
 const opportunity=opportunities.find(item=>item.id===selectedId);
 const available=opportunities.filter(item=>!item.projectId&&item.stage!=='Lost'&&(!client||item.clientId===client.id));
 const workflow=workflowFor(studio,{brief:{workflowType:form.workflowType}});
 const previewImage=previewImages[form.workflowType]||previewImages[DEFAULT_WORKFLOW];
 const setField=(key,value)=>setForm(current=>({...current,[key]:value}));

 useEffect(()=>{
  if(!open)return;
  let active=true;
  setMode('blank');setForm(emptyProject(studio,client));setSelectedId('');setError('');
  setOpportunitiesError('');setOpportunitiesLoading(true);
  request('/api/opportunities?studio='+studio.id).then(result=>{
   if(active)setOpportunities(result.opportunities||[]);
  }).catch(cause=>{if(active)setOpportunitiesError(cause.message||'The enquiries could not be loaded.');})
   .finally(()=>{if(active)setOpportunitiesLoading(false);});
  return()=>{active=false;};
 },[open,studio.id,client?.id]);

 function chooseMode(next){
  setMode(next);setSelectedId('');setForm(emptyProject(studio,client));setError('');
 }
 function chooseOpportunity(id){
  setSelectedId(id);setError('');
  const item=opportunities.find(entry=>entry.id===id);
  setForm({...emptyProject(studio,client),name:item?.clientName||'',email:item?.clientEmail||'',occasion:item?.title||'',vision:item?.description||''});
 }
 async function submit(event){
  event.preventDefault();
  if(mode==='enquiry'&&!opportunity){setError('Choose an enquiry to carry into this project.');return;}
  setSubmitting(true);setError('');
  const payload={
   ...form,
   ...(mode==='blank'&&client?{clientId:client.id}:{}),
   details:Object.fromEntries(briefFieldsFor(form.workflowType).map(field=>[field.key,form.details[field.key]||'']))
  };
  try{
   const result=mode==='enquiry'
    ?await request('/api/opportunities/'+opportunity.id+'/project?studio='+studio.id,'POST',{...payload,revision:opportunity.revision})
    :await request('/api/projects?studio='+studio.id,'POST',payload);
   setOpen(false);
   onCreate(result.project);
  }catch(cause){setError(cause.message||'The project could not be created. Please try again.');}
  finally{setSubmitting(false);}
 }
 return <Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger asChild><button type="button" className="button"><Plus size={15}/>New project</button></Dialog.Trigger>
  <Dialog.Portal>
   <Dialog.Overlay className="modal-backdrop"/>
   <Dialog.Content className="modal modal-dialog studio-project-setup">
    <div className="studio-setup-top"><span>PROJECTS / CREATE</span><Dialog.Close asChild><button type="button" aria-label="Close project setup"><X size={19}/></button></Dialog.Close></div>
    <div className="studio-setup-layout">
     <form id="studio-new-project" className="studio-setup-form" onSubmit={submit}>
      <Dialog.Title>Create project</Dialog.Title>
      <Dialog.Description>Begin with a client and a starting point. The brief can grow with the work.</Dialog.Description>
      <div className="studio-setup-fields two">
       <label>Client name<input name="name" value={form.name} onChange={event=>setField('name',event.target.value)} readOnly={Boolean(client)||mode==='enquiry'} maxLength="120" required placeholder="Who is this for?"/></label>
       <label>Client email<input name="email" type="email" value={form.email} onChange={event=>setField('email',event.target.value)} readOnly={Boolean(client)||mode==='enquiry'} required placeholder="client@example.com"/></label>
      </div>
      {client&&mode==='blank'&&<p className="studio-setup-help">This project will stay connected to {client.name}'s client record. Change contact details in Clients.</p>}
      <div className="studio-setup-fields two">
       <label>Service area<select name="workflowType" value={form.workflowType} onChange={event=>setForm(current=>({...current,workflowType:event.target.value,occasion:mode==='enquiry'?current.occasion:'',details:{}}))}>{workflowOptionsFor(form.workflowType).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
       <label>Project type<input name="occasion" list={projectTypesId} value={form.occasion} onChange={event=>setField('occasion',event.target.value)} maxLength="120" required placeholder="Name the work"/><datalist id={projectTypesId}>{projectTypesFor(form.workflowType).map(type=><option key={type} value={type}/>)}</datalist></label>
      </div>
      <div className="studio-setup-fields two">
       <label>{workflow.date}<input name="date" type="date" value={form.date} onChange={event=>setField('date',event.target.value)}/></label>
       <label>{workflow.place}<input name="venue" value={form.venue} onChange={event=>setField('venue',event.target.value)} maxLength="300" placeholder="To be decided"/></label>
      </div>
      <div className="studio-setup-section"><h3>Starting point</h3><p>How would you like to bring this work into the studio?</p></div>
      <div className="studio-setup-choices" role="group" aria-label="Project starting point">
       <button type="button" className={mode==='blank'?'selected':''} aria-pressed={mode==='blank'} onClick={()=>chooseMode('blank')}><FolderPlus size={20}/><span><strong>New project</strong><small>Start a fresh brief and add references as the work develops.</small></span></button>
       <button type="button" className={mode==='enquiry'?'selected':''} aria-pressed={mode==='enquiry'} onClick={()=>chooseMode('enquiry')}><MessageSquareText size={20}/><span><strong>From enquiry</strong><small>Carry an existing client and opportunity into the project.</small></span></button>
      </div>
      {mode==='enquiry'&&<div className="studio-setup-enquiry">
       <label>Choose an opportunity<select aria-label="Choose an opportunity" value={selectedId} onChange={event=>chooseOpportunity(event.target.value)} required><option value="">{opportunitiesLoading?'Loading opportunities…':'Select an opportunity'}</option>{available.map(item=><option key={item.id} value={item.id}>{item.title} · {item.clientName}</option>)}</select></label>
       {opportunitiesError&&<p role="alert" className="studio-setup-error">{opportunitiesError}</p>}
       {!opportunitiesLoading&&!opportunitiesError&&!available.length&&<div className="studio-setup-no-enquiries"><p>{client?`${client.name} has no unlinked opportunities.`:'No unlinked opportunities are ready to use.'}</p>{onOpenPipeline&&<button type="button" onClick={()=>{setOpen(false);onOpenPipeline();}}>Open pipeline</button>}</div>}
       {opportunity&&<div className="studio-setup-opportunity"><strong>{opportunity.title}</strong><span>{opportunity.clientName} · {opportunity.stage}{opportunity.source?' · '+opportunity.source:''}</span><p>{opportunity.description||'No enquiry summary yet. Add the starting idea below.'}</p><small>The client relationship and opportunity history will stay linked.</small></div>}
      </div>}
      <label className="studio-setup-idea">The starting idea<textarea name="vision" value={form.vision} onChange={event=>setField('vision',event.target.value)} rows="3" maxLength="5000" placeholder="What are we creating, and what matters most?"/></label>
      <div className="studio-setup-fields two studio-setup-specific">{briefFieldsFor(form.workflowType).map(field=><label key={field.key}>{field.label}<input value={form.details[field.key]||''} onChange={event=>setForm(current=>({...current,details:{...current.details,[field.key]:event.target.value}}))} maxLength="500" placeholder={field.hint}/></label>)}</div>
      {error&&<p role="alert" className="studio-setup-error">{error}</p>}
     </form>
     <aside className="studio-setup-preview">
      <p className="studio-setup-kicker">PROJECT PREVIEW <span>ILLUSTRATIVE IMAGE</span></p>
      <img src={previewImage} alt="Illustrative creative work for this service area"/>
      <h2>{form.occasion||'Your next project'}</h2>
      <p>{form.name||opportunity?.clientName||'Client to be added'} · {workflow.name}</p>
      <div className="studio-setup-preview-facts"><div><span>Starting from</span><strong>{mode==='enquiry'?'Existing opportunity':'A new brief'}</strong></div><div><span>{workflow.date}</span><strong>{previewDate(form.date)}</strong></div><div><span>{workflow.place}</span><strong>{form.venue||'To be decided'}</strong></div></div>
      <p className="studio-setup-preview-note">The project will hold the brief, references, messages, versions and decisions together. You can invite the client after creating it.</p>
      <div className="studio-setup-preview-steps"><span><Check size={16}/>Add and refine the brief</span><span><Check size={16}/>Collect real project references</span><span><Check size={16}/>Review each direction and decision</span></div>
     </aside>
    </div>
    <div className="studio-setup-actions"><button type="button" className="studio-setup-cancel" onClick={()=>setOpen(false)}>Cancel</button><button type="submit" form="studio-new-project" className="button" disabled={busy||submitting||mode==='enquiry'&&!opportunity}>{submitting?'Creating…':mode==='enquiry'?'Create linked project':'Create project'}</button></div>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
