import React,{useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,FileCheck2,MessageSquare,FolderClosed} from 'lucide-react';
import {WorkspaceButton,WorkspaceDialog} from './workspace/WorkspaceUI';
import './onboarding.css';

// A new owner's first steps. Each step ticks itself from real studio records.
export function StudioSetup({studio,request,onStep}){
 const [setup,setSetup]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;setSetup(null);request('/api/onboarding?studio='+studio.id).then(data=>{if(live)setSetup(data.studioSetup||null);}).catch(()=>{});return()=>{live=false;};},[studio.id,request]);
 if(!setup||setup.complete||setup.dismissed)return null;
 async function dismiss(){setSaving(true);try{const data=await request('/api/onboarding?studio='+studio.id,'POST',{action:'dismiss-setup'});setSetup(data.studioSetup);}catch{setError('That could not be saved. Try again.');}finally{setSaving(false);}}
 const next=setup.steps.find(step=>!step.done&&!step.optional)?.id;
 return <section className="studio-setup" aria-labelledby="studio-setup-title">
  <header><div><p className="studio-setup-count">{setup.completed} of {setup.total} done</p><h2 id="studio-setup-title">Get your studio ready</h2><p>A few steps so enquiries arrive here and clients have a place to follow their project.</p></div>
   <WorkspaceButton variant="ghost" size="small" loading={saving} onClick={dismiss}>Hide for now</WorkspaceButton></header>
  <div className="studio-setup-progress" role="progressbar" aria-label="Studio setup" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.completed}><span style={{width:`${setup.completed/setup.total*100}%`}}/></div>
  {error&&<p className="studio-setup-error" role="alert">{error}</p>}
  <ol className="studio-setup-steps">{setup.steps.map(step=><li key={step.id} className={(step.done?'is-done ':'')+(step.id===next?'is-next':'')}>
   <button type="button" onClick={()=>onStep(step.id)} aria-label={`${step.title}${step.done?', done':step.optional?', optional':''}`}>
    <span className="studio-setup-mark" aria-hidden="true">{step.done?<Check size={14} strokeWidth={2.2}/>:null}</span>
    <span className="studio-setup-copy"><strong>{step.title}{step.optional&&<small> Optional</small>}</strong><span>{step.detail}</span></span>
    <ChevronRight className="studio-setup-go" size={16} aria-hidden="true"/>
   </button></li>)}</ol>
 </section>;
}

// Shown once to an invited client, in the studio's own words.
export function ClientWelcome({studio,request,onOpenProject}){
 const [welcome,setWelcome]=useState(null),[open,setOpen]=useState(false),primary=useRef(null);
 useEffect(()=>{let live=true;request('/api/onboarding?studio='+studio.id).then(data=>{if(live&&data.clientWelcome?.show){setWelcome(data.clientWelcome);setOpen(true);}}).catch(()=>{});return()=>{live=false;};},[studio.id,request]);
 function finish(project){setOpen(false);request('/api/onboarding?studio='+studio.id,'POST',{action:'welcome-seen'}).catch(()=>{});if(project)onOpenProject(project);}
 if(!welcome)return null;
 const project=welcome.projects.length===1?welcome.projects[0]:null;
 return <WorkspaceDialog open={open} onOpenChange={value=>{if(!value)finish(null);}} title={`Welcome to ${welcome.studioName}`} description={welcome.welcome} className="client-welcome" initialFocusRef={primary}>
  {welcome.logoUrl&&<img className="client-welcome-logo" src={welcome.logoUrl} alt=""/>}
  <ul className="client-welcome-points">
   <li><FolderClosed size={18} aria-hidden="true"/><span><strong>Your project in one place</strong>The brief, inspiration, designs and documents the studio shares with you.</span></li>
   <li><FileCheck2 size={18} aria-hidden="true"/><span><strong>Decisions waiting for you</strong>Anything that needs your answer appears under Ready for you, and in the bell.</span></li>
   <li><MessageSquare size={18} aria-hidden="true"/><span><strong>Talk to the studio</strong>Messages go straight to the team and stay with the project.</span></li>
  </ul>
  <div className="client-welcome-actions">
   <WorkspaceButton variant="secondary" onClick={()=>finish(null)}>Look around</WorkspaceButton>
   {project?<WorkspaceButton ref={primary} onClick={()=>finish(project)}>Open {project.title}</WorkspaceButton>:<WorkspaceButton ref={primary} onClick={()=>finish(null)}>Get started</WorkspaceButton>}
  </div>
 </WorkspaceDialog>;
}
