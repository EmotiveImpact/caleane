import React,{useEffect,useState} from 'react';
import {Check,FileText,MessageSquare,ReceiptText,ScrollText} from 'lucide-react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import {starterContract,starterFormDefinition,starterFormSlug,starterKindFor,starterKinds,starterKit} from '../lib/starter-gallery';
import {fillMergeFields} from '../lib/merge-fields';
import {accentContrast} from '../lib/accent-theme';
import '../studio-commerce.css';
import '../starter-gallery.css';

// Starter prices are shown and saved in the studio's own billing currency.
const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);
const units={each:'',hour:'per hour',day:'per day',person:'per person',item:'per item',set:'per set'};
// Matched by name, ignoring case and spacing, so an item the owner already
// has (from here or typed in by hand) is not offered twice.
const key=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const same=(a,b)=>key(a)===key(b);

// Owner-only. Adds starters through the same endpoints as the Templates,
// Pricing and Forms screens, so every starter is checked and stored exactly
// as if the owner had typed it in.
export function StarterGallery({studio,request,navigate,onAdded}){
 const [kind,setKind]=useState(()=>starterKindFor(studio.branding?.profession));
 const [saved,setSaved]=useState({templates:null,items:null,forms:null,currency:'GBP'}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;
  Promise.all([request(`/api/message-templates?studio=${studio.id}`),request(`/api/catalogue?studio=${studio.id}`),request(`/api/forms?studio=${studio.id}`),request(`/api/billing-defaults?studio=${studio.id}`)])
   .then(([t,c,f,b])=>{if(active)setSaved({templates:t.templates||[],items:c.items||[],forms:f.forms||[],currency:b.defaults?.currency||'GBP'});})
   .catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[studio.id,request]);
 const kit=starterKit(kind),contract=starterContract(kind),ready=!!saved.templates;
 const hasTemplate=item=>saved.templates?.some(t=>same(t.name,item.name));
 const hasItem=item=>saved.items?.some(i=>!i.archived&&same(i.name,item.name));
 const form=saved.forms?.find(f=>f.slug===starterFormSlug(kind));
 async function run(key,work){setBusy(key);setError('');setNotice('');try{await work();}catch(e){setError(e.message);}finally{setBusy('');}}
 const addTemplates=list=>run('messages',async()=>{let templates=saved.templates;for(const template of list){templates=(await request(`/api/message-templates?studio=${studio.id}`,'POST',{action:'create',template})).templates;}setSaved(s=>({...s,templates}));setNotice(list.length===1?`Added “${list[0].name}” to your message templates.`:`Added ${list.length} message templates.`);onAdded?.();});
 const addItems=list=>run('prices',async()=>{let items=saved.items;for(const item of list){items=(await request(`/api/catalogue?studio=${studio.id}`,'POST',{action:'create',item:{...item,currency:saved.currency}})).items;}setSaved(s=>({...s,items}));setNotice(list.length===1?`Added “${list[0].name}” to your price list.`:`Added ${list.length} items to your price list.`);});
 const createForm=()=>run('form',async()=>{const definition=starterFormDefinition(kind,{accent:accentContrast(studio.accent)>=4.5?studio.accent:'#202326',logoUrl:studio.branding?.logoUrl||''});const result=await request(`/api/forms?studio=${studio.id}`,'POST',{slug:starterFormSlug(kind),definition});setSaved(s=>({...s,forms:[...(s.forms||[]),result.form]}));setNotice(`Created “${definition.name}” as a draft in Forms.`);});
 const missingTemplates=kit.messages.filter(item=>!hasTemplate(item)),missingItems=kit.prices.filter(item=>!hasItem(item));
 const added=<WorkspaceButton variant="ghost" size="small" className="starter-added" disabled><Check size={14} aria-hidden="true"/>Added</WorkspaceButton>;

 return <section className="starter-gallery" aria-labelledby="starter-gallery-title">
  <header className="settings-pane-heading"><h2 id="starter-gallery-title">Starter gallery</h2><p>Ready-made messages, prices, a contract and an enquiry form for your kind of work. Add what fits, then make it your own.</p></header>
  <fieldset className="commerce-choice-group starter-kinds"><legend className="sr-only">Kind of work</legend><div className="commerce-pill-options">{starterKinds.map(option=><label key={option.id} className={kind===option.id?'is-selected':''}><input type="radio" name="starter-kind" value={option.id} checked={kind===option.id} onChange={()=>{setKind(option.id);setNotice('');setError('');}}/><span>{option.label}</span></label>)}</div></fieldset>
  <p className="starter-summary">{kit.summary}</p>
  {error&&<p className="commerce-error" role="alert">{error}</p>}
  <p className="starter-notice" role="status">{notice}</p>
  <div className="starter-grid">
   <article className="starter-card" aria-labelledby="starter-messages">
    <header><MessageSquare size={18}/><div><h3 id="starter-messages">Messages</h3><small>Saved replies with the client’s details filled in when you use them.</small></div></header>
    <ul>{kit.messages.map(item=><li key={item.name}><details><summary><strong>{item.name}</strong><small>{item.category}</small></summary><p>{item.body}</p></details>{hasTemplate(item)?added:<WorkspaceButton variant="ghost" size="small" disabled={!ready||!!busy} onClick={()=>addTemplates([item])}>Add</WorkspaceButton>}</li>)}</ul>
    <footer><WorkspaceButton variant="secondary" size="small" disabled={!ready||!!busy||!missingTemplates.length} onClick={()=>addTemplates(missingTemplates)}>{busy==='messages'?'Adding…':missingTemplates.length?`Add all ${missingTemplates.length}`:'All added'}</WorkspaceButton></footer>
   </article>
   <article className="starter-card" aria-labelledby="starter-prices">
    <header><ReceiptText size={18}/><div><h3 id="starter-prices">Price list</h3><small>Suggested starting prices in {({GBP:'pounds',EUR:'euros',USD:'dollars'})[saved.currency]||saved.currency}, your billing currency. Change them to suit your studio once added.</small></div></header>
    <ul>{kit.prices.map(item=><li key={item.name}><details><summary><strong>{item.name}</strong><small>{money(item.unitAmount,saved.currency)} {units[item.unit]}</small></summary><p>{item.description}</p></details>{hasItem(item)?added:<WorkspaceButton variant="ghost" size="small" disabled={!ready||!!busy} onClick={()=>addItems([item])}>Add</WorkspaceButton>}</li>)}</ul>
    <footer><WorkspaceButton variant="secondary" size="small" disabled={!ready||!!busy||!missingItems.length} onClick={()=>addItems(missingItems)}>{busy==='prices'?'Adding…':missingItems.length?`Add all ${missingItems.length}`:'All added'}</WorkspaceButton></footer>
   </article>
   <article className="starter-card" aria-labelledby="starter-contract">
    <header><ScrollText size={18}/><div><h3 id="starter-contract">{contract.title}</h3><small>Plain-English terms with the clauses this kind of work usually needs.</small></div></header>
    <details className="starter-contract-preview"><summary>Read the terms</summary><div dangerouslySetInnerHTML={{__html:fillMergeFields(contract.termsHtml,{studio_name:studio.name})}}/></details>
    <p className="starter-hint">To use it, open a project, go to Contracts and choose <strong>Use starter</strong>. Fill in the parts in square brackets and have a solicitor check it before you rely on it.</p>
   </article>
   <article className="starter-card" aria-labelledby="starter-form">
    <header><FileText size={18}/><div><h3 id="starter-form">{kit.form.name} form</h3><small>{kit.form.title} {kit.form.description}</small></div></header>
    <ul className="starter-questions">{kit.form.questions.map(item=><li key={item.id}>{item.label}{item.required&&<small>Required</small>}</li>)}</ul>
    <p className="starter-hint">Added to Forms as a draft with your accent and logo. Review it there and publish when you are ready.</p>
    <footer>{form?<>{added}<WorkspaceButton variant="secondary" size="small" onClick={()=>navigate?.('forms')}>Open in Forms</WorkspaceButton></>:<WorkspaceButton variant="secondary" size="small" disabled={!ready||!!busy} onClick={createForm}>{busy==='form'?'Creating…':'Create draft form'}</WorkspaceButton>}</footer>
   </article>
  </div>
 </section>;
}
