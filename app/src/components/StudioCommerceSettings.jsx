import React,{useEffect,useState} from 'react';
import {ArrowDown,ArrowUp,Copy,Plus,Trash2} from 'lucide-react';
import {WorkspaceButton,WorkspaceField,WorkspaceSelect,WorkspaceStatus,WorkspaceSwitch} from './workspace/WorkspaceUI';
import {InvoicePreview,printInvoice} from './InvoiceDocument';
import {invoiceFonts,invoiceLayouts,invoicePageHtml,sampleInvoice} from '../lib/invoice-design';
import {lateFeeTerms} from '../lib/invoice-charges';
import {DEFAULT_VAT_RATE} from '../lib/vat';
import '../studio-commerce.css';

const money=(minor,currency='GBP')=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(minor)||0)/100);}catch{return `${((Number(minor)||0)/100).toFixed(2)} ${currency}`;}};
const shortDate=value=>value?new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const units={each:'each',hour:'per hour',day:'per day',person:'per person',item:'per item',set:'per set'};
const dueLabels={on_issue:'When the plan starts',days_after_confirm:'Days after the estimate is confirmed',days_before_event:'Days before the project date'};

function useStudioData(url,request){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setError('');request(url).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[url,request]);
 async function send(body){setBusy(true);setError('');try{const result=await request(url,'POST',body);setData(previous=>({...previous,...result}));return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
 return {data,error,busy,send,setError};
}

/* ---------- Money: invoice details, payment plan, late fees, invoice design and price list ---------- */

function PlanTemplateEditor({plan,onChange}){
 const total=plan.reduce((sum,step)=>sum+(Number(step.percent)||0),0);
 const update=(index,patch)=>onChange(plan.map((step,i)=>i===index?{...step,...patch}:step));
 return <div className="commerce-plan-template">
  {plan.map((step,index)=><div className="commerce-plan-row" key={index}>
   <WorkspaceField label={`Payment ${index+1}`} value={step.label} maxLength={60} required onChange={e=>update(index,{label:e.target.value})}/>
   <WorkspaceField label="Share (%)" type="number" min="1" max="100" step="1" value={step.percent} required onChange={e=>update(index,{percent:Number(e.target.value)})}/>
   <WorkspaceField label="Due"><WorkspaceSelect label="Due" value={step.due.type} onValueChange={type=>update(index,{due:{...step.due,type}})} options={Object.entries(dueLabels).map(([value,label])=>({value,label}))}/></WorkspaceField>
   {step.due.type!=='on_issue'?<WorkspaceField label="Days" type="number" min="0" max="365" value={step.due.days} onChange={e=>update(index,{due:{...step.due,days:Number(e.target.value)}})}/>:<span className="commerce-plan-spacer" aria-hidden="true"/>}
   <WorkspaceButton variant="ghost" iconOnly aria-label={`Remove payment ${index+1}`} disabled={plan.length===1} onClick={()=>onChange(plan.filter((_,i)=>i!==index))}><Trash2 size={16}/></WorkspaceButton>
  </div>)}
  <div className="commerce-plan-foot"><WorkspaceButton variant="secondary" size="small" disabled={plan.length>=6} onClick={()=>onChange([...plan,{label:'Balance',percent:Math.max(0,100-total),due:{type:'days_before_event',days:14}}])}><Plus size={15}/>Add a payment</WorkspaceButton><span className={Math.abs(total-100)>0.001?'is-error':''}>{total}% of 100%</span></div>
 </div>;
}

function PriceList({studio,request}){
 const {data,error,busy,send}=useStudioData(`/api/catalogue?studio=${studio.id}`,request);
 const blank={name:'',description:'',category:'',unitAmount:'',currency:'GBP',unit:'each'};
 const [draft,setDraft]=useState(blank),[editing,setEditing]=useState(''),[showArchived,setShowArchived]=useState(false);
 const items=(data?.items||[]).filter(item=>showArchived||!item.archived);
 async function save(event){event.preventDefault();const item={...draft,unitAmount:Math.round(Number(draft.unitAmount)*100)};const result=await send(editing?{action:'update',id:editing,item}:{action:'create',item});if(result){setDraft(blank);setEditing('');}}
 return <section className="commerce-section" aria-labelledby="price-list-title">
  <header className="settings-pane-heading"><h2 id="price-list-title">Price list</h2><p>Services, add-ons and hire items you can add to an estimate in one click. Changing a price here never changes an estimate you have already shared.</p></header>
  {error&&<p className="commerce-error" role="alert">{error}</p>}
  <form className="commerce-item-form" onSubmit={save}>
   <WorkspaceField className="commerce-span-2" label="Item name" value={draft.name} maxLength={120} required onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="For example, organic balloon garland"/>
   <WorkspaceField label="Category (optional)" value={draft.category} maxLength={60} onChange={e=>setDraft({...draft,category:e.target.value})} placeholder="Installations"/>
   <WorkspaceField label="Price" type="number" min="0" step="0.01" value={draft.unitAmount} required onChange={e=>setDraft({...draft,unitAmount:e.target.value})}/>
   <WorkspaceField label="Currency"><WorkspaceSelect label="Currency" value={draft.currency} onValueChange={currency=>setDraft({...draft,currency})} options={['GBP','EUR','USD']}/></WorkspaceField>
   <WorkspaceField label="Charged"><WorkspaceSelect label="Charged" value={draft.unit} onValueChange={unit=>setDraft({...draft,unit})} options={Object.entries(units).map(([value,label])=>({value,label}))}/></WorkspaceField>
   <WorkspaceField className="commerce-span-3" label="Description (optional)" value={draft.description} maxLength={500} onChange={e=>setDraft({...draft,description:e.target.value})}/>
   <div className="commerce-form-actions"><WorkspaceButton type="submit" disabled={busy}>{editing?'Save item':'Add to price list'}</WorkspaceButton>{editing&&<WorkspaceButton variant="ghost" onClick={()=>{setEditing('');setDraft(blank);}}>Cancel</WorkspaceButton>}</div>
  </form>
  {!data&&!error?<p className="commerce-muted">Loading your price list…</p>:items.length?<ul className="commerce-list">{items.map((item,index)=><li key={item.id} className={item.archived?'is-archived':''}>
   <div><strong>{item.name}</strong><small>{[item.category,item.description].filter(Boolean).join(' · ')||'No description'}</small></div>
   <span className="commerce-price">{money(item.unitAmount,item.currency)}<small>{units[item.unit]}</small></span>
   <div className="commerce-row-actions">{item.archived?<WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>send({action:'restore',id:item.id})}>Restore</WorkspaceButton>:<>
    <WorkspaceButton variant="ghost" iconOnly aria-label={`Move ${item.name} up`} disabled={busy||index===0} onClick={()=>send({action:'move',id:item.id,direction:'up'})}><ArrowUp size={15}/></WorkspaceButton>
    <WorkspaceButton variant="ghost" iconOnly aria-label={`Move ${item.name} down`} disabled={busy||index===items.filter(x=>!x.archived).length-1} onClick={()=>send({action:'move',id:item.id,direction:'down'})}><ArrowDown size={15}/></WorkspaceButton>
    <WorkspaceButton variant="ghost" size="small" onClick={()=>{setEditing(item.id);setDraft({name:item.name,description:item.description,category:item.category,unitAmount:(item.unitAmount/100).toFixed(2),currency:item.currency,unit:item.unit});}}>Edit</WorkspaceButton>
    <WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>send({action:'archive',id:item.id})}>Archive</WorkspaceButton></>}</div>
  </li>)}</ul>:<p className="commerce-muted">Nothing on your price list yet. Add the services you quote most often.</p>}
  {data?.items?.some(item=>item.archived)&&<WorkspaceButton variant="ghost" size="small" onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Hide archived items':'Show archived items'}</WorkspaceButton>}
 </section>;
}

// Invoice details, the default plan, late fees and tips share one billing record.
// Each settings section edits only its own fields and saves them on top of the
// latest saved record, so saving one section never overwrites another.
const invoiceKeys=['currency','vatRegistered','taxRate','sellerAddress','paymentInstructions','sellerContact','taxRegistration','paymentTermsDays','plan'],extraKeys=['lateFee','tips'];
function useBillingDefaults(studio,request,keys){
 const url=`/api/billing-defaults?studio=${studio.id}`;
 const {data,error,busy,send,setError}=useStudioData(url,request);
 const [form,setForm]=useState(null),[saved,setSaved]=useState(false);
 useEffect(()=>{if(data?.defaults)setForm(data.defaults);},[data]);
 const set=patch=>{setSaved(false);setForm(previous=>({...previous,...patch}));};
 async function save(event){
  event.preventDefault();
  let latest;try{latest=(await request(url)).defaults;}catch(e){setError(e.message);return;}
  if(await send({...latest,...Object.fromEntries(keys.map(key=>[key,form[key]]))}))setSaved(true);
 }
 return {form,set,save,saved,busy,error};
}
const billingSaveRow=(busy,saved,label)=><footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':label}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}</footer>;

export function InvoiceDefaultsSettings({studio,request}){
 const {form,set,save,saved,busy,error}=useBillingDefaults(studio,request,invoiceKeys);
 if(!form)return <p className="commerce-muted">{error||'Loading invoice settings…'}</p>;
 return <div className="settings-pane-layout">
  <form className="settings-pane-form" onSubmit={save}>
   <header className="settings-pane-heading"><h2>Invoice details</h2><p>Saved once and filled in on every invoice. You can still change them on a single invoice.</p></header>
   <div className="settings-fields">
    <WorkspaceField label="Studio address"><textarea rows={3} maxLength={500} value={form.sellerAddress} onChange={e=>set({sellerAddress:e.target.value})}/></WorkspaceField>
    <WorkspaceField label="Payment instructions"><textarea rows={3} maxLength={1000} value={form.paymentInstructions} onChange={e=>set({paymentInstructions:e.target.value})} placeholder="Bank name, sort code, account number and the reference to use"/></WorkspaceField>
    <WorkspaceField label="Studio contact" value={form.sellerContact} maxLength={300} onChange={e=>set({sellerContact:e.target.value})} placeholder="Email or phone"/>
    <WorkspaceField label="Usual currency"><select value={form.currency||'GBP'} onChange={e=>set({currency:e.target.value})}>{['GBP','EUR','USD'].map(code=><option key={code}>{code}</option>)}</select></WorkspaceField>
    <WorkspaceField label="Payment terms (days)" type="number" min="0" max="120" value={form.paymentTermsDays} onChange={e=>set({paymentTermsDays:Number(e.target.value)})}/>
   </div>
   <header className="settings-pane-heading commerce-subheading"><h2>VAT</h2><p>Estimates and invoices show VAT only when you are registered. If you are not, there is no tax line at all.</p></header>
   <WorkspaceSwitch label="VAT registered" description={form.vatRegistered?'Invoices show your VAT number and a VAT line, for example VAT (20%).':'Turn this on once you are registered with HMRC for VAT.'} checked={!!form.vatRegistered} onCheckedChange={on=>set(on?{vatRegistered:true,taxRate:form.taxRate>0?form.taxRate:DEFAULT_VAT_RATE}:{vatRegistered:false,taxRate:0})}/>
   {form.vatRegistered&&<div className="settings-fields">
    <WorkspaceField label="VAT number" value={form.taxRegistration} maxLength={100} onChange={e=>set({taxRegistration:e.target.value})} placeholder="For example, GB123456789"/>
    <WorkspaceField label="Default VAT rate (%)" type="number" min="0" max="100" step="0.01" value={form.taxRate??DEFAULT_VAT_RATE} onChange={e=>set({taxRate:Number(e.target.value)})} hint="New estimates start with this rate. The standard UK rate is 20%."/>
   </div>}
   <header className="settings-pane-heading commerce-subheading"><h2>Default payment plan</h2><p>How you usually split a project into payments. Each project starts from this plan, and you can adjust it there.</p></header>
   <PlanTemplateEditor plan={form.plan} onChange={plan=>set({plan})}/>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   {billingSaveRow(busy,saved,'Save invoice settings')}
  </form>
  <aside className="settings-support"><h3>How payment plans work</h3><p>When a client confirms an estimate, open Billing on the project and start a plan. Caleane works out each amount and due date from these rules.</p><p>Each payment becomes a normal invoice when you issue it. If a payment date arrives and it has not been issued, a reminder appears in your follow-ups.</p></aside>
 </div>;
}

// Both are off until the studio turns them on. A late fee is only ever added to
// invoices that showed the terms when they were issued, and nothing is sent.
export function LateFeeSettings({studio,request}){
 const {form,set,save,saved,busy,error}=useBillingDefaults(studio,request,extraKeys);
 if(!form)return <p className="commerce-muted">{error||'Loading late fees and tips…'}</p>;
 const fee=form.lateFee,update=patch=>set({lateFee:{...fee,...patch}});
 return <div className="settings-pane-layout">
  <form className="settings-pane-form commerce-extras-form" onSubmit={save}>
   <header className="settings-pane-heading"><h2>Late fees and tips</h2><p>Optional extras on your invoices. Each one is shown to the client on the invoice itself.</p></header>
   <WorkspaceSwitch label="Add a late fee to overdue invoices" description="Applies once, after the grace period, to invoices issued while this is on. Caleane adds it to the invoice and notes it on the project. It does not message, email or charge the client." checked={fee.enabled} onCheckedChange={enabled=>update({enabled})}/>
   {fee.enabled&&<div className="settings-fields commerce-late-fee">
    <WorkspaceField label="Fee"><WorkspaceSelect label="Fee" value={fee.type} onValueChange={type=>update({type})} options={[{value:'fixed',label:'Fixed amount'},{value:'percent',label:'Percentage of the unpaid balance'}]}/></WorkspaceField>
    {fee.type==='fixed'?<WorkspaceField label="Amount" type="number" min="0.01" max="1000" step="0.01" value={(fee.amountMinor/100).toFixed(2)} onChange={e=>update({amountMinor:Math.round(Number(e.target.value)*100)})}/>
    :<WorkspaceField label="Percentage" type="number" min="0.1" max="25" step="0.1" value={fee.percent} onChange={e=>update({percent:Number(e.target.value)})}/>}
    <WorkspaceField label="Days after the due date" type="number" min="1" max="90" value={fee.afterDays} onChange={e=>update({afterDays:Number(e.target.value)})}/>
    <p className="commerce-muted commerce-late-fee-preview">Clients will read: “{lateFeeTerms(fee,'GBP')}”</p>
   </div>}
   <WorkspaceSwitch label="Let clients add a tip to final invoices" description="Adds an optional tip choice to balance and full invoices. Deposits never ask for a tip. Tips carry no tax." checked={form.tips.enabled} onCheckedChange={enabled=>set({tips:{enabled}})}/>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   {billingSaveRow(busy,saved,'Save late fees and tips')}
  </form>
  <aside className="settings-support"><h3>What changes for clients</h3><p>A late fee only applies to invoices issued while it is switched on, because the terms are printed on the invoice. While it is off, no new late fees are added.</p><p>Tips are always optional for the client, and are only offered on balance and full invoices.</p></aside>
 </div>;
}

export function InvoiceDesignSection({studio,request}){
 const {data,error}=useStudioData(`/api/billing-defaults?studio=${studio.id}`,request);
 if(!data&&!error)return <p className="commerce-muted">Loading invoice design…</p>;
 return <InvoiceDesignSettings studio={studio} request={request} defaults={data?.defaults||{}}/>;
}

export function PriceListSettings({studio,request}){return <PriceList studio={studio} request={request}/>;}

function InvoiceDesignSettings({studio,request,defaults}){
 const {data,error,busy,send}=useStudioData(`/api/invoice-design?studio=${studio.id}`,request);
 const [design,setDesign]=useState(null),[saved,setSaved]=useState(false),[brandKit,setBrandKit]=useState(null);
 useEffect(()=>{let active=true;request(`/api/brand-kit?studio=${studio.id}`).then(result=>{if(active)setBrandKit(result.kit);}).catch(()=>{});return()=>{active=false;};},[studio.id,request]);
 useEffect(()=>{if(data?.design)setDesign(data.design);},[data]);
 if(!design)return <p className="commerce-muted">{error||'Loading invoice design…'}</p>;
 const set=patch=>{setSaved(false);setDesign({...design,...patch});};
 const hasLogo=!!(brandKit?.logos?.primary||studio.branding?.logoUrl),brandColour=brandKit?.colours?.primary||studio.accent||'#1f2a24';
 const sample=sampleInvoice(studio,defaults),html=invoicePageHtml(sample.invoice,{studio,design,brandKit,estimate:sample.estimate});
 return <section className="settings-pane-layout commerce-invoice-design" aria-labelledby="invoice-design-heading">
  <form className="settings-pane-form" onSubmit={async e=>{e.preventDefault();if(await send(design))setSaved(true);}}>
   <header className="settings-pane-heading"><h2 id="invoice-design-heading">Invoice design</h2><p>How your invoices look to clients, on screen and when printed or saved as a PDF. Changes apply to every invoice, including ones already issued. The amounts and details never change.</p></header>
   <fieldset className="commerce-choice-group"><legend>Layout</legend><div className="commerce-layout-options">{invoiceLayouts.map(([key,label,hint])=><label key={key} className={design.layout===key?'is-selected':''}><input type="radio" name="layout" value={key} checked={design.layout===key} onChange={()=>set({layout:key})}/><span className={`commerce-layout-thumb is-${key}`} aria-hidden="true"><i/><b/><b/><b/><em/></span><strong>{label}</strong><small>{hint}</small></label>)}</div></fieldset>
   <fieldset className="commerce-choice-group"><legend>Typeface</legend><div className="commerce-pill-options">{invoiceFonts.map(([key,label])=><label key={key} className={design.font===key?'is-selected':''}><input type="radio" name="font" value={key} checked={design.font===key} onChange={()=>set({font:key})}/><span className={`is-${key}`}>{label}</span></label>)}</div></fieldset>
   <div className="settings-fields">
    <WorkspaceSwitch label="Use my brand colour" description={`From your brand kit (${brandColour}). Change it in Settings, Brand kit.`} checked={!design.accent} onCheckedChange={on=>set({accent:on?'':brandColour})}/>
    {design.accent&&<div className="commerce-colour-row"><label htmlFor="invoice-accent">Invoice colour</label><input id="invoice-accent" type="color" value={design.accent} onChange={e=>set({accent:e.target.value})}/><code>{design.accent}</code></div>}
    <WorkspaceSwitch label="Show my logo" description={hasLogo?'Uses the logo from your brand kit.':'Upload a logo in Settings, Brand kit. Until then your studio name is used.'} checked={design.showLogo} onCheckedChange={on=>set({showLogo:on})}/>
    <WorkspaceSwitch label="List the project items" description="Shows each line from the confirmed estimate, and what share this invoice covers." checked={design.showItems} onCheckedChange={on=>set({showItems:on})}/>
    <WorkspaceField label="Closing line (optional)" value={design.thankYou} maxLength={300} onChange={e=>set({thankYou:e.target.value})} placeholder="Thank you for your business."/>
    <WorkspaceField label="Footer (optional)" hint="Company number, registered office or VAT details. Shown at the bottom of every page."><textarea rows={2} maxLength={500} value={design.footer} onChange={e=>set({footer:e.target.value})}/></WorkspaceField>
   </div>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':'Save invoice design'}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}</footer>
  </form>
  <aside className="settings-support commerce-invoice-preview"><div className="commerce-preview-head"><h3>Preview</h3><button type="button" className="commerce-link-button" onClick={()=>printInvoice(html)}>Print a sample</button></div><InvoicePreview html={html} title="Sample invoice preview"/><p>A sample invoice using your saved details.</p></aside>
 </section>;
}

/* ---------- Reminders ---------- */

export function ReminderSettings({studio,request}){
 const {data,error,busy,send}=useStudioData(`/api/reminders?studio=${studio.id}`,request);
 const [form,setForm]=useState(null),[saved,setSaved]=useState(false),[ran,setRan]=useState(null);
 useEffect(()=>{if(data?.settings)setForm(data.settings);},[data?.settings]);
 if(!form)return <p className="commerce-muted">{error||'Loading reminders…'}</p>;
 const set=patch=>{setSaved(false);setForm({...form,...patch});};
 const number=(key,label,min,max,hint)=><WorkspaceField label={label} hint={hint} type="number" min={min} max={max} value={form[key]} onChange={e=>set({[key]:Number(e.target.value)})}/>;
 return <div className="settings-pane-layout">
  <form className="settings-pane-form" onSubmit={async e=>{e.preventDefault();if(await send({action:'save',settings:form}))setSaved(true);}}>
   <header className="settings-pane-heading"><h2>Automatic reminders</h2><p>Caleane can nudge clients about things waiting on them. Reminders are posted as a message from your studio in the client’s project conversation, once each.</p></header>
   <WorkspaceSwitch label="Send reminders automatically" description="Checked every hour. Clients without portal access are skipped." checked={form.enabled} onCheckedChange={enabled=>set({enabled})}/>
   <div className="settings-fields commerce-reminder-fields">
    {number('invoiceBeforeDueDays','Invoice due soon',0,30,'Days before the due date')}
    {number('overdueRepeatDays','Overdue invoice, repeat every',1,60,'Days between overdue reminders')}
    {number('overdueMaxReminders','Overdue reminders at most',0,10,'Use 0 to switch them off')}
    {number('proposalBeforeExpiryDays','Proposal about to expire',0,30,'Days before it expires')}
    {number('contractBeforeExpiryDays','Contract awaiting response',0,30,'Days before it expires')}
    {number('approvalAfterDays','Design waiting for review',0,60,'Days after sharing. Use 0 to switch off')}
   </div>
   <WorkspaceSwitch label="Remind me when a planned payment is due to be invoiced" description="Adds a private follow-up for you. Nothing is sent to the client." checked={form.planStepTasks} onCheckedChange={planStepTasks=>set({planStepTasks})}/>
   <div className="commerce-follow-ups"><h3>Follow-ups for you</h3><p>Private nudges in your notifications when a conversation goes quiet. Clients never see these, and they run even when client reminders are off.</p></div>
   <div className="settings-fields commerce-reminder-fields">
    {number('quietClientDays','Client has not replied',0,30,'Days after your last message. Use 0 to switch off')}
    {number('unansweredDays','Client is waiting for you',0,30,'Days after their message. Use 0 to switch off')}
   </div>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':'Save reminders'}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}{data.settings.enabled&&<WorkspaceButton variant="secondary" disabled={busy} onClick={async()=>{const result=await send({action:'run'});if(result)setRan(result.sent.length);}}>Send due reminders now</WorkspaceButton>}{ran!==null&&<span role="status">{ran?`${ran} reminder${ran===1?'':'s'} sent.`:'Nothing was due.'}</span>}</footer>
  </form>
  <aside className="settings-support commerce-reminder-aside">
   <h3>Coming up in the next two weeks</h3>
   {data.upcoming.length?<ul className="commerce-timeline">{data.upcoming.slice(0,12).map(item=><li key={item.key}><span>{shortDate(item.on)}</span><div><strong>{item.kind}</strong><small>{item.projectTitle} · {item.summary}</small>{!item.deliverable&&<small className="commerce-warning">Not sent: the client has no portal access yet.</small>}</div></li>)}</ul>:<p>Nothing is due to be reminded.</p>}
   <h3>Recently sent</h3>
   {data.recent.length?<ul className="commerce-timeline">{data.recent.slice(0,8).map(item=><li key={item.key}><span>{shortDate(item.sentAt)}</span><div><strong>{item.kind}</strong><small>{item.summary}</small></div></li>)}</ul>:<p>No reminders have been sent yet.</p>}
   <p>{data.emailQueued?'Each client reminder is also queued for email.':'Email delivery is not switched on, so reminders appear in the client portal only.'}</p>
  </aside>
 </div>;
}

/* ---------- Message templates ---------- */

const placeholderHelp={client_first_name:'Client’s first name',client_name:'Client’s full name',project_title:'Project title',project_date:'Project date',studio_name:'Your studio name',booking_link:'Your consultation booking page',portal_link:'Link to the client portal'};
export function TemplateSettings({studio,request}){
 const {data,error,busy,send}=useStudioData(`/api/message-templates?studio=${studio.id}`,request);
 const blank={name:'',category:'',body:''};
 const [draft,setDraft]=useState(blank),[editing,setEditing]=useState('');
 async function save(event){event.preventDefault();const result=await send(editing?{action:'update',id:editing,template:draft}:{action:'create',template:draft});if(result){setDraft(blank);setEditing('');}}
 return <div className="settings-pane-layout">
  <div className="settings-pane-form">
   <header className="settings-pane-heading"><h2>Message templates</h2><p>Saved replies you can drop into any conversation, then edit before sending.</p></header>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <form className="commerce-template-form" onSubmit={save}>
    <div className="settings-fields"><WorkspaceField label="Template name" value={draft.name} maxLength={80} required onChange={e=>setDraft({...draft,name:e.target.value})}/><WorkspaceField label="Group (optional)" value={draft.category} maxLength={40} onChange={e=>setDraft({...draft,category:e.target.value})}/></div>
    <WorkspaceField label="Message"><textarea rows={7} maxLength={4000} required value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></WorkspaceField>
    <div className="commerce-form-actions"><WorkspaceButton type="submit" disabled={busy}>{editing?'Save template':'Add template'}</WorkspaceButton>{editing&&<WorkspaceButton variant="ghost" onClick={()=>{setEditing('');setDraft(blank);}}>Cancel</WorkspaceButton>}</div>
   </form>
   {!data&&!error?<p className="commerce-muted">Loading templates…</p>:<ul className="commerce-list commerce-template-list">{(data?.templates||[]).map(item=><li key={item.id}><div><strong>{item.name}</strong><small>{item.category||'General'}</small><p>{item.body}</p></div><div className="commerce-row-actions"><WorkspaceButton variant="ghost" size="small" onClick={()=>{setEditing(item.id);setDraft({name:item.name,category:item.category,body:item.body});window.scrollTo?.({top:0,behavior:'smooth'});}}>Edit</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>send({action:'delete',id:item.id})}>Delete</WorkspaceButton></div></li>)}</ul>}
  </div>
  <aside className="settings-support"><h3>Personal details</h3><p>Use these in a template and Caleane fills them in when you insert it into a message.</p><dl className="commerce-placeholders">{Object.entries(placeholderHelp).map(([key,label])=><div key={key}><dt><code>{`{${key}}`}</code></dt><dd>{label}</dd></div>)}</dl></aside>
 </div>;
}

/* ---------- Consultation booking ---------- */

const weekdays=[[1,'Monday'],[2,'Tuesday'],[3,'Wednesday'],[4,'Thursday'],[5,'Friday'],[6,'Saturday'],[0,'Sunday']];
const zones=['Europe/London','Europe/Dublin','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Amsterdam','Africa/Lagos','Africa/Accra','America/New_York','America/Chicago','America/Los_Angeles','America/Toronto','Asia/Dubai','Australia/Sydney'];
const timeLabel=(iso,zone)=>new Date(iso).toLocaleString('en-GB',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export function BookingSettings({studio,request}){
 const {data,error,busy,send}=useStudioData(`/api/consultations?studio=${studio.id}`,request);
 const [form,setForm]=useState(null),[saved,setSaved]=useState(false),[copied,setCopied]=useState(false),[closing,setClosing]=useState(null);
 useEffect(()=>{if(data?.settings)setForm(data.settings);},[data?.settings]);
 if(!form)return <p className="commerce-muted">{error||'Loading booking settings…'}</p>;
 const set=patch=>{setSaved(false);setForm({...form,...patch});};
 const setDay=(day,windows)=>{const weekly={...form.weekly};if(windows.length)weekly[day]=windows;else delete weekly[day];set({weekly});};
 const upcoming=data.consultations.filter(item=>item.status==='Booked'&&new Date(item.end)>=new Date()),past=data.consultations.filter(item=>!upcoming.includes(item)).slice(0,10);
 return <div className="settings-pane-layout">
  <form className="settings-pane-form" onSubmit={async e=>{e.preventDefault();if(await send({action:'save-settings',settings:form}))setSaved(true);}}>
   <header className="settings-pane-heading"><h2>Consultation booking</h2><p>Share a link where new clients pick a time for a first call. Each booking adds the client to your records and a follow-up on that day.</p></header>
   <WorkspaceSwitch label="Accept online bookings" description="Your booking page is only available while this is on." checked={form.enabled} onCheckedChange={enabled=>set({enabled})}/>
   <div className="settings-fields">
    <WorkspaceField label="What clients are booking" value={form.title} maxLength={80} required onChange={e=>set({title:e.target.value})}/>
    <WorkspaceField label="Time zone"><WorkspaceSelect label="Time zone" value={form.timezone} onValueChange={timezone=>set({timezone})} options={[...new Set([form.timezone,...zones])]}/></WorkspaceField>
    <WorkspaceField className="settings-field-wide" label="Short description"><textarea rows={2} maxLength={500} value={form.description} onChange={e=>set({description:e.target.value})}/></WorkspaceField>
    <WorkspaceField label="Length (minutes)" type="number" min="15" max="240" step="5" value={form.durationMinutes} onChange={e=>set({durationMinutes:Number(e.target.value)})}/>
    <WorkspaceField label="Gap between calls (minutes)" type="number" min="0" max="120" step="5" value={form.bufferMinutes} onChange={e=>set({bufferMinutes:Number(e.target.value)})}/>
    <WorkspaceField label="Minimum notice (hours)" type="number" min="0" max="336" value={form.minNoticeHours} onChange={e=>set({minNoticeHours:Number(e.target.value)})}/>
    <WorkspaceField label="Bookable up to (days ahead)" type="number" min="1" max="120" value={form.horizonDays} onChange={e=>set({horizonDays:Number(e.target.value)})}/>
    <WorkspaceField label="Most calls in one day" type="number" min="1" max="20" value={form.maxPerDay} onChange={e=>set({maxPerDay:Number(e.target.value)})}/>
    <WorkspaceField label="How you meet"><WorkspaceSelect label="How you meet" value={form.location.type} onValueChange={type=>set({location:{...form.location,type}})} options={[{value:'video',label:'Video call'},{value:'phone',label:'Phone call'},{value:'in_person',label:'In person'}]}/></WorkspaceField>
    <WorkspaceField className="settings-field-wide" label={form.location.type==='video'?'Video link (shown after booking)':form.location.type==='phone'?'Who calls whom (shown after booking)':'Address (shown after booking)'} value={form.location.detail} maxLength={300} onChange={e=>set({location:{...form.location,detail:e.target.value}})}/>
   </div>
   <h3 className="commerce-small-heading">Payment when booking</h3>
   <WorkspaceSwitch label="Ask for payment when clients book" description={data.paymentsAvailable?'Clients pay by card on Stripe before the time is confirmed. Unpaid times are released after about half an hour.':'Connect Stripe in Settings, Connections to take a fee or deposit at booking.'} checked={form.payment.required} disabled={!data.paymentsAvailable&&!form.payment.required} onCheckedChange={required=>set({payment:{...form.payment,required}})}/>
   {(form.payment.required||data.paymentsAvailable)&&<div className="settings-fields commerce-payment-fields">
    <WorkspaceField label="What the payment is called" value={form.payment.label} maxLength={60} required onChange={e=>set({payment:{...form.payment,label:e.target.value}})} placeholder="Booking fee or deposit"/>
    <WorkspaceField label={`Amount (${form.payment.currency})`} type="number" min="1" max="10000" step="0.01" value={(form.payment.amountMinor/100).toFixed(2)} onChange={e=>set({payment:{...form.payment,amountMinor:Math.round(Number(e.target.value)*100)}})}/>
    <WorkspaceField label="Currency"><WorkspaceSelect label="Currency" value={form.payment.currency} onValueChange={currency=>set({payment:{...form.payment,currency}})} options={['GBP','EUR','USD']}/></WorkspaceField>
   </div>}
   <h3 className="commerce-small-heading">Weekly hours</h3>
   <div className="commerce-week">{weekdays.map(([day,label])=>{const windows=form.weekly[day]||[];return <div key={day} className="commerce-week-row"><span>{label}</span>{windows.length?<div className="commerce-week-windows">{windows.map((window,index)=><div key={index}><input aria-label={`${label} start`} type="time" value={window.start} onChange={e=>setDay(day,windows.map((w,i)=>i===index?{...w,start:e.target.value}:w))}/><span>to</span><input aria-label={`${label} end`} type="time" value={window.end} onChange={e=>setDay(day,windows.map((w,i)=>i===index?{...w,end:e.target.value}:w))}/><WorkspaceButton variant="ghost" iconOnly aria-label={`Remove ${label} hours`} onClick={()=>setDay(day,windows.filter((_,i)=>i!==index))}><Trash2 size={15}/></WorkspaceButton></div>)}{windows.length<3&&<WorkspaceButton variant="ghost" size="small" onClick={()=>setDay(day,[...windows,{start:'14:00',end:'17:00'}])}>Add hours</WorkspaceButton>}</div>:<div className="commerce-week-windows"><small>Unavailable</small><WorkspaceButton variant="ghost" size="small" onClick={()=>setDay(day,[{start:'10:00',end:'17:00'}])}>Add hours</WorkspaceButton></div>}</div>;})}</div>
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':'Save booking settings'}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}</footer>
  </form>
  <aside className="settings-support">
   <h3>Your booking page</h3>
   {data.settings.enabled?<><a className="commerce-link" href={data.bookingUrl} target="_blank" rel="noreferrer">{data.bookingUrl}</a><WorkspaceButton variant="secondary" size="small" onClick={async()=>{try{await navigator.clipboard.writeText(data.bookingUrl);setCopied(true);}catch{setCopied(false);}}}><Copy size={14}/>{copied?'Copied':'Copy link'}</WorkspaceButton><p>Add it to your website, email signature or the “Enquiry received” template.</p></>:<p>Switch on online bookings and save to get your link.</p>}
   <h3>Upcoming</h3>
   {upcoming.length?<ul className="commerce-bookings">{upcoming.map(item=><li key={item.id}><div><strong>{item.name}</strong><small>{timeLabel(item.start,item.timezone)} · {item.email}{item.phone?` · ${item.phone}`:''}</small>{item.payment?.status==='paid'&&<small>{item.payment.label} paid · {money(item.payment.amountMinor,item.payment.currency)}</small>}{item.notes&&<p>{item.notes}</p>}</div>{closing===item.id?<div className="commerce-row-actions"><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={async()=>{await send({action:'complete',id:item.id});setClosing(null);}}>Mark as held</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={async()=>{await send({action:'no_show',id:item.id});setClosing(null);}}>No-show</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={async()=>{await send({action:'cancel',id:item.id});setClosing(null);}}>Cancel booking</WorkspaceButton></div>:<WorkspaceButton variant="ghost" size="small" onClick={()=>setClosing(item.id)}>Update</WorkspaceButton>}</li>)}</ul>:<p>No upcoming consultations.</p>}
   {upcoming.length>0&&<p>Cancelling frees the time but does not contact the client. Let them know with a message, and refund any booking payment from your Stripe dashboard.</p>}
   {past.length>0&&<><h3>Earlier</h3><ul className="commerce-bookings">{past.map(item=><li key={item.id}><div><strong>{item.name}</strong><small>{timeLabel(item.start,item.timezone)}</small></div><WorkspaceStatus value={item.status==='Booked'?'Held':item.status}/>{item.payment?.review&&<small className="commerce-review">{item.payment.review}</small>}</li>)}</ul></>}
  </aside>
 </div>;
}
