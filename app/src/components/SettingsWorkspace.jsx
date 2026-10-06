import React,{useEffect,useRef,useState} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {WorkspaceButton,WorkspaceField,WorkspaceHeading,WorkspaceSelect} from './workspace/WorkspaceUI';
import {AccentPicker} from './AccentPicker';
import {CalendarSyncSettings} from './CalendarSyncSettings';
import {DataGovernanceSettings} from './DataGovernanceSettings';
import {OperationsReadiness} from './OperationsReadiness';
import {StripeConnectSettings} from './StripeConnectSettings';
import {BrandKitSettings} from './BrandKitSettings';
import {WebhookSettings} from './WebhookSettings';
import {XeroSettings} from './XeroSettings';
import {BookingIntegrations} from './BookingIntegrations';
import {BookingSettings,PricingSettings,ReminderSettings,TemplateSettings} from './StudioCommerceSettings';
import {StarterGallery} from './StarterGallery';
import {CustomFieldSettings} from './CustomFields';
import {DEFAULT_WORKFLOW,projectTypesFor,workflowOptionsFor} from '../lib/workflows';

const sections=[['studio','Studio'],['appearance','Appearance'],['brand','Brand kit'],['website','Website'],['bookings','Bookings'],['pricing','Pricing & billing'],['reminders','Reminders'],['templates','Templates'],['fields','Custom fields'],['connections','Connections'],['integrations','Integrations'],['data','Data'],['status','Status']];
export function settingsSection(search){
  const params=new URLSearchParams(search);
  if(params.has('calendar_callback')||['pending','connected'].includes(params.get('stripe')))return 'connections';
  const section=params.get('settingsTab');
  return sections.some(([value])=>value===section)?section:'studio';
}
const identityOf=studio=>({name:studio.name,portalTitle:studio.branding?.portalTitle||studio.name,welcome:studio.branding?.welcome||'Your project, thoughtfully brought together.',logoUrl:studio.branding?.logoUrl||'',profession:studio.branding?.profession||DEFAULT_WORKFLOW});
// The current endpoint expects a complete settings record. Each pane overlays
// only its own changes on the latest saved record, never another pane's draft.
const savedSettings=studio=>({...identityOf(studio),accent:studio.accent,origins:studio.origins,projectTypes:studio.branding?.projectTypes||projectTypesFor(studio.branding?.profession||DEFAULT_WORKFLOW),intakeQuestions:studio.branding?.intakeQuestions||[]});

export function SettingsWorkspace({studio,request,run,busy,reload,navigate}){
  const [section,setSection]=useState(()=>settingsSection(location.search));
  const [identity,setIdentity]=useState(()=>identityOf(studio));
  const [origins,setOrigins]=useState(()=>studio.origins.join('\n'));
  const [saved,setSaved]=useState(''),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
  const revisions=useRef({});
  // Unsaved drafts are compared with what was last loaded or saved for each pane.
  const [baseline,setBaseline]=useState(()=>({studio:JSON.stringify(identityOf(studio)),website:studio.origins.join('\n'),appearance:studio.accent}));
  const [accentDraft,setAccentDraft]=useState(studio.accent),[accentKey,setAccentKey]=useState(0),[leaving,setLeaving]=useState(false),[templatesKey,setTemplatesKey]=useState(0);
  const unsaved=[['studio','Studio',JSON.stringify(identity)!==baseline.studio],['website','Website',origins!==baseline.website],['appearance','Appearance',accentDraft!==baseline.appearance]].filter(([,,dirty])=>dirty);
  const dirty=unsaved.length>0;
  useEffect(()=>{if(!dirty){setLeaving(false);return;}const savedURL=location.href;const guard=event=>{event.preventDefault();event.returnValue='';},internal=event=>{event.preventDefault();history.replaceState(null,'',savedURL);setLeaving(true);};window.addEventListener('beforeunload',guard);window.addEventListener('caleane:before-navigate',internal);return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('caleane:before-navigate',internal);};},[dirty]);
  function discard(){setIdentity(JSON.parse(baseline.studio));setOrigins(baseline.website);setAccentDraft(baseline.appearance);setAccentKey(key=>key+1);setLeaving(false);}
  const code=`<script src="${location.origin}/embed.js" data-studio="${studio.slug}" data-label="Plan your project" defer></script>`;
  useEffect(()=>{const restore=()=>setSection(settingsSection(location.search));window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  function choose(next){
    setSection(next);
    const url=new URL(location.href);url.searchParams.set('settingsTab',next);url.searchParams.delete('stripe');history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  function edited(pane){revisions.current[pane]=(revisions.current[pane]||0)+1;setSaved(previous=>previous===pane?'':previous);}
  function updateIdentity(key,value){edited('studio');setIdentity(previous=>({...previous,[key]:value}));}
  async function save(pane,patch){
    const revision=revisions.current[pane]||0;
    const payload={...savedSettings(studio),...patch},snapshot=pane==='studio'?JSON.stringify(identity):pane==='website'?origins:patch.accent;
    const result=await run(async()=>{await request('/api/settings?studio='+studio.id,'PATCH',payload);await reload();return true;});
    if(result){setBaseline(previous=>({...previous,[pane]:snapshot}));if(pane==='appearance')setAccentDraft(current=>revision===(revisions.current[pane]||0)?snapshot:current);}
    if(result&&revision===(revisions.current[pane]||0))setSaved(pane);
  }
  const panel=(value,children)=><Tabs.Content key={value} value={value} forceMount hidden={section!==value} className="settings-tab-panel">{children}</Tabs.Content>;
  const saveAction=(pane,label)=><footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':label}</WorkspaceButton>{saved===pane&&<span role="status">Saved.</span>}</footer>;

  return <div className="folio-settings-page settings-tabbed">
    <WorkspaceHeading className="page-heading" title="Workspace settings" description="Your studio identity, client experience and connected services." action={<WorkspaceButton variant="secondary" onClick={()=>navigate('members')}>Members and access</WorkspaceButton>}/>
    {leaving&&dirty&&<div className="settings-unsaved" role="alert"><p>You have unsaved changes in {unsaved.map(([,label])=>label).join(' and ')}. Save them, or discard them before leaving settings.</p><div><WorkspaceButton variant="secondary" size="small" onClick={()=>{choose(unsaved[0][0]);setLeaving(false);}}>Review changes</WorkspaceButton><WorkspaceButton variant="danger" size="small" onClick={discard}>Discard changes</WorkspaceButton></div></div>}
    <Tabs.Root value={section} onValueChange={choose} activationMode="manual">
      <Tabs.List className="settings-tabs-nav" aria-label="Workspace settings sections">{sections.map(([value,label])=><Tabs.Trigger key={value} value={value}>{label}</Tabs.Trigger>)}</Tabs.List>

      {panel('studio',<div className="settings-pane-layout">
        <form className="settings-pane-form" onSubmit={event=>{event.preventDefault();save('studio',{...identity,projectTypes:identity.profession===savedSettings(studio).profession?savedSettings(studio).projectTypes:projectTypesFor(identity.profession)});}}>
          <header className="settings-pane-heading"><h2>Studio identity</h2><p>The details your clients see, and the kind of work you do.</p></header>
          <div className="settings-fields">
            <WorkspaceField label="Studio name" name="name" value={identity.name} onChange={event=>updateIdentity('name',event.target.value)} required maxLength={120}/>
            <WorkspaceField label="Client portal title" name="portalTitle" value={identity.portalTitle} onChange={event=>updateIdentity('portalTitle',event.target.value)} required maxLength={120}/>
            <WorkspaceField className="settings-field-wide" label="Client welcome message" name="welcome" value={identity.welcome} onChange={event=>updateIdentity('welcome',event.target.value)} maxLength={300}/>
            <WorkspaceField className="settings-field-wide" label="Logo URL (optional)" type="url" name="logoUrl" value={identity.logoUrl} onChange={event=>updateIdentity('logoUrl',event.target.value)}/>
            <WorkspaceField className="settings-field-wide" label="Kind of work"><WorkspaceSelect label="Kind of work" value={identity.profession} onValueChange={value=>updateIdentity('profession',value)} options={workflowOptionsFor(savedSettings(studio).profession).map(option=>({value:option.id,label:option.label}))}/></WorkspaceField>
          </div>
          {saveAction('studio','Save studio details')}
        </form>
        <aside className="settings-support"><h3>Client portal preview</h3><div className="settings-identity-preview">{identity.logoUrl?<img src={identity.logoUrl} alt="Studio logo preview"/>:<strong>Caleane</strong>}<h4>{identity.portalTitle||identity.name}</h4><p>{identity.welcome}</p></div><p>Your kind of work tailors the language and starting points for new projects.</p></aside>
      </div>)}

      {panel('appearance',<div className="settings-pane-layout">
        <form className="settings-pane-form" onSubmit={event=>{event.preventDefault();save('appearance',{accent:new FormData(event.currentTarget).get('accent')});}}>
          <header className="settings-pane-heading"><h2>Workspace appearance</h2><p>Choose the accent that feels right for your studio.</p></header>
          <AccentPicker key={accentKey} value={studio.accent} onChange={next=>{edited('appearance');setAccentDraft(next);}}/>
          {saveAction('appearance','Save appearance')}
        </form>
        <aside className="settings-support"><h3>See it in context</h3><div className="settings-accent-preview"><span>Amelia’s wedding</span><strong>The next step, together.</strong><p>Your accent gives actions and selected items a clear place in the workspace.</p><span className="settings-preview-action">Review direction</span></div><p>Accent changes preview immediately. Save appearance to keep your choice.</p></aside>
      </div>)}

      {panel('website',<div className="settings-pane-layout">
        <form className="settings-pane-form" onSubmit={event=>{event.preventDefault();save('website',{origins:origins.split('\n').map(value=>value.trim()).filter(Boolean)});}}>
          <header className="settings-pane-heading"><h2>Connect your website</h2><p>Let enquiries arrive in the same place as the work.</p></header>
          <WorkspaceField label="Connected website origins" hint="One origin per line, including https://. Only these websites may embed your planner or submit enquiries through the public API."><textarea name="origins" rows={4} value={origins} onChange={event=>{edited('website');setOrigins(event.target.value);}}/></WorkspaceField>
          {saveAction('website','Save website settings')}
          <section className="settings-form-shortcut"><h3>Your enquiry forms</h3><p>Build, preview and publish your questionnaires in Forms.</p><WorkspaceButton variant="secondary" onClick={()=>navigate('forms')}>Open forms</WorkspaceButton></section>
        </form>
        <aside className="settings-support settings-embed"><h3>Add the planner to your site</h3><p>Use this snippet to open the planner from your existing website.</p><pre>{code}</pre><WorkspaceButton variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setCopyError('');}catch{setCopyError('Select the snippet above and copy it manually.');}}}>{copied?'Copied':'Copy embed code'}</WorkspaceButton>{copyError&&<p role="alert">{copyError}</p>}<h3>Or share a direct link</h3><a href={`/intake/${studio.slug}`} target="_blank" rel="noreferrer">{location.origin}/intake/{studio.slug}</a><details><summary>Advanced connection options</summary><p>Already have a form? Send its enquiries to:</p><code>POST /api/public/{studio.slug}/enquiries</code><a href="/embed-demo" target="_blank" rel="noreferrer">See the plugin on an example website</a></details></aside>
      </div>)}

      {panel('bookings',section==='bookings'&&<><BookingSettings studio={studio} request={request}/><BookingIntegrations studio={studio} request={request} navigate={choose}/></>)}
      {panel('brand',section==='brand'&&<BrandKitSettings studio={studio} request={request}/>)}
      {panel('pricing',section==='pricing'&&<PricingSettings studio={studio} request={request}/>)}
      {panel('reminders',section==='reminders'&&<ReminderSettings studio={studio} request={request}/>)}
      {panel('templates',section==='templates'&&<><StarterGallery studio={studio} request={request} navigate={navigate} onAdded={()=>setTemplatesKey(key=>key+1)}/><TemplateSettings key={templatesKey} studio={studio} request={request}/></>)}
      {panel('fields',section==='fields'&&<CustomFieldSettings studio={studio} request={request}/>)}
      {panel('connections',<div className="settings-connections"><CalendarSyncSettings studio={studio} request={request}/><StripeConnectSettings studio={studio} request={request}/></div>)}
      {panel('integrations',section==='integrations'&&<><XeroSettings studio={studio} request={request}/><WebhookSettings studio={studio} request={request}/></>)}
      {panel('data',<DataGovernanceSettings studio={studio} request={request} onChanged={reload}/>)}
      {panel('status',<><OperationsReadiness studio={studio} request={request}/>{['localhost','127.0.0.1'].includes(location.hostname)&&<a className="settings-component-link" href="/?view=components">Explore the component gallery</a>}</>)}
    </Tabs.Root>
  </div>;
}
