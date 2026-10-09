import {WorkspaceSelect} from './workspace/WorkspaceUI';
import {AgreementPages} from './AgreementDocument';
import React,{lazy,Suspense,useRef,useState} from 'react';
const PagedDocument=lazy(()=>import('./PagedDocument')); 
import * as Dialog from '@radix-ui/react-dialog';
import {useConfirm} from './ConfirmDialog';
import {OpenedNote,useRecordOpen} from './OpenedNote';
import {formatDay} from '../lib/dates';
import {findPlaceholders,placeholderMessage} from '../lib/merge-fields';
const tidyHtml=value=>String(value||'').replace(/\s+/g,' ').replace(/<p>( |<br\s*\/?>)*<\/p>/g,'').trim();

const escapeDoc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=q=>new Intl.NumberFormat('en-GB',{style:'currency',currency:q.currency}).format(q.total/100);
export function Proposals({p,owner,mutate,busy,onNavigate}){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(p.briefRevision),[selected,setSelected]=useState(''),[documentView,setDocumentView]=useState(false),[documentHtml,setDocumentHtml]=useState('');
 const editor=useRef(null),[flushing,setFlushing]=useState(false),openedHtml=useRef(''),edited=useRef(false),[confirm,confirmation]=useConfirm();
 async function requestClose(){if(busy||flushing)return;const changed=edited.current||tidyHtml(documentHtml)!==tidyHtml(openedHtml.current);if(changed&&!await confirm({title:'Discard this proposal?',description:'Nothing has been shared yet. Closing now loses the scope, delivery plan and document you have written in this dialog.',confirmLabel:'Discard proposal',cancelLabel:'Keep editing'}))return;setOpen(false);}
 const trigger=useRef(null),list=p.proposals||[],q=list.find(x=>x.id===selected)||list.at(-1),estimate=p.estimates?.at(-1);
 const expired=q?.expiresOn&&q.expiresOn<new Date().toISOString().slice(0,10),stale=q&&q.briefRevision!==p.briefRevision;
 useRecordOpen(p,owner,'proposal',q?.id);
 const actionable=!!q&&q.id===list.at(-1)?.id&&q.status==='Awaiting response'&&!expired&&!stale;
 return <section className="folio-estimates proposal-workspace"><div className="section-title"><div><h2>Proposals</h2></div>{owner&&<button ref={trigger} className="doc-primary" onClick={()=>{const html=q?.documentHtml||'<h2>Our approach</h2><p>[Describe the creative direction, milestones and working relationship]</p>';setRevision(p.briefRevision);setError('');openedHtml.current=html;edited.current=false;setDocumentHtml(html);setOpen(true);}}>{q?'Create a revision':'Create proposal'}</button>}</div>
 <p className="muted">Scope, delivery and the agreed investment, with every version retained.</p>
 <Dialog.Root open={open} onOpenChange={value=>{if(value){if(!busy&&!flushing)setOpen(true);}else requestClose();}}><Dialog.Portal><Dialog.Overlay className="modal-backdrop"/><Dialog.Content className="modal modal-dialog choice-dialog proposal-authoring-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><Dialog.Close asChild><button className="close" aria-label="Close proposal" disabled={busy||flushing}>×</button></Dialog.Close><Dialog.Title>{q?'Revise the proposal':'Create a proposal'}</Dialog.Title><Dialog.Description>Share a clear scope and retain the estimate exactly as it is today.</Dialog.Description>
 {estimate?<form onInput={()=>{edited.current=true;}} onSubmit={async e=>{e.preventDefault();if(busy||flushing)return;const values=Object.fromEntries(new FormData(e.currentTarget));setError('');setFlushing(true);try{if(!editor.current)throw new Error('The document editor is still loading.');const latest=await editor.current.flush();const gaps=findPlaceholders(values.title,values.scope,values.exclusions,values.delivery,latest);if(gaps.length)throw new Error(placeholderMessage(gaps,'this proposal'));const result=await mutate('proposals',{...values,documentHtml:latest,briefRevision:revision,estimateId:estimate.id,previousId:list.at(-1)?.id||null});if(result){edited.current=false;setOpen(false);setSelected('');}else setError('Could not share the proposal. Close this dialog and review the workspace error before retrying.');}catch(e){setError(e.message);}finally{setFlushing(false);}}}>
 <p>Estimate: {estimate.title} · {money(estimate)}</p>
 <label className="field"><span>Proposal title</span><input name="title" defaultValue={q?.title||p.title} required maxLength="200"/></label>
 <label className="field"><span>Included scope and deliverables</span><textarea name="scope" defaultValue={q?.scope||''} required rows="5" maxLength="10000"/></label>
 <label className="field"><span>Exclusions and assumptions</span><textarea name="exclusions" defaultValue={q?.exclusions||''} rows="3" maxLength="5000"/></label>
 <label className="field"><span>Delivery plan</span><textarea name="delivery" defaultValue={q?.delivery||''} required rows="3" maxLength="5000"/></label>
 <section className="proposal-rich-editor"><h3>Proposal document</h3><p className="muted">Add your approach, timeline, tables and working terms. The scope and estimate remain recorded alongside this document. Replace anything in [square brackets] before sharing.</p><Suspense fallback={<p>Loading document editor…</p>}><PagedDocument ref={editor} html={documentHtml} onChange={setDocumentHtml}/></Suspense></section>
 <label className="field"><span>Reply by (UTC)</span><input name="expiresOn" type="date" required min={new Date().toISOString().slice(0,10)}/></label>
 <p>Sharing publishes to the client portal. No email is sent.</p>{error&&<p role="alert">{error}</p>}<button className="button" disabled={busy||flushing}>{busy||flushing?'Sharing…':'Share proposal'}</button>
 </form>:<><p>Create an estimate first so your proposal has a clear price.</p><button className="button" onClick={()=>onNavigate('Estimate')}>Create estimate</button></>}
 </Dialog.Content></Dialog.Portal></Dialog.Root>{confirmation}
 {q?<><OpenedNote p={p} owner={owner} kind="proposal" itemId={q.id}/><label className="field"><span>Proposal history</span><WorkspaceSelect label="Proposal version" value={q.id} onValueChange={setSelected} options={list.map(x=>({value:x.id,label:`Version ${x.version} · ${x.status}`}))}/></label>
 <div className="doc-actions" style={{margin:'16px 0'}}><button className="doc-quiet" aria-pressed={!documentView} onClick={()=>setDocumentView(false)}>Summary</button><button className="doc-quiet" aria-pressed={documentView} onClick={()=>setDocumentView(true)}>Document / PDF</button></div>
 {documentView?<AgreementPages agreement={{id:q.id,revision:q.version,bodyHasTitle:true,title:q.title,version:q.version,status:q.status,briefRevision:q.briefRevision,termsHtml:`<h1>${escapeDoc(q.title)}</h1><p>Reply by ${escapeDoc(formatDay(q.expiresOn))}</p>${[['Included scope',q.scope],['Exclusions and assumptions',q.exclusions],['Delivery plan',q.delivery]].filter(([,v])=>v).map(([label,value])=>`<h2>${label}</h2><p>${escapeDoc(value).replace(/\n/g,'<br>')}</p>`).join('')}${q.documentHtml||''}<h2>Proposed investment</h2><table><thead><tr><th>Quantity</th><th>Item</th></tr></thead><tbody>${q.estimate.items.map(item=>`<tr><td>${escapeDoc(item.quantity)}</td><td>${escapeDoc(item.title)}</td></tr>`).join('')}</tbody></table><p><strong>${escapeDoc(money(q.estimate))}</strong></p><p>Includes ${escapeDoc(q.estimate.taxRate)}% tax. Estimate version ${q.estimate.version}.</p><p>Scope acceptance does not confirm a booking or record payment.</p>`,...(q.decidedBy?{response:{name:q.decidedBy,at:q.decidedAt}}:{})}}/>:( <article className="estimate-document"><header><div><p>PROPOSAL · VERSION {q.version}</p><h2>{q.title}</h2></div><span>{q.status==='Awaiting response'&&expired?'Expired':q.status}</span></header>
 <p>Reply by {formatDay(q.expiresOn)} · Brief version {q.briefRevision}</p>
 {[['Included scope',q.scope],['Exclusions and assumptions',q.exclusions],['Delivery plan',q.delivery]].filter(([,v])=>v).map(([label,value])=><section key={label}><h3>{label}</h3><p style={{whiteSpace:'pre-wrap'}}>{value}</p></section>)}
 {q.documentHtml&&<AgreementPages agreement={{id:q.id,revision:q.version,termsHtml:q.documentHtml,title:q.title,version:q.version,status:q.status}} hideControls/>}<h3>Proposed investment</h3>{q.estimate.items.map((item,i)=><p key={i}>{item.quantity} × {item.title}</p>)}<strong>{money(q.estimate)}</strong><p>Includes {q.estimate.taxRate}% tax · Estimate version {q.estimate.version}</p>
 <footer>Scope acceptance is recorded here. No payment is taken or booking confirmed.</footer></article>)}

 {q.decidedBy&&<p className="context-note">{q.status} by {q.decidedBy} on {new Date(q.decidedAt).toLocaleDateString('en-GB')}. {q.feedback}</p>}
 {stale&&q.status==='Awaiting response'&&<p className="context-note">The brief changed. The studio must share an updated proposal.</p>}
 {q.status==='Withdrawn'&&<p className="context-note">This proposal was withdrawn by the studio.</p>}
 {!owner&&p.accessRole==='Approver'&&actionable&&<form className="inline-form" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget),decision=e.nativeEvent.submitter?.value;if(decision==='accept'&&!form.get('acknowledged')){setError('Confirm that you have reviewed the scope first.');return;}const result=await mutate('proposal-response',{proposalId:q.id,decision,feedback:form.get('feedback'),acknowledged:!!form.get('acknowledged')});if(result)setError('');}}>
 <label className="field"><span>Your feedback (required for changes)</span><textarea name="feedback" rows="3" maxLength="3000"/></label><label><input type="checkbox" name="acknowledged"/> I have reviewed this scope and the proposed investment.</label>{error&&<p role="alert">{error}</p>}<div className="journey-form-controls"><button className="button" name="decision" value="accept" disabled={busy}>Accept scope</button><button className="button secondary" name="decision" value="changes" disabled={busy}>Request changes</button></div></form>}
 {owner&&q.id===list.at(-1)?.id&&q.status==='Awaiting response'&&<button className="button secondary" disabled={busy} onClick={()=>mutate('proposal-withdraw',{proposalId:q.id})}>Withdraw proposal</button>}
 {q.status==='Scope accepted'&&<div className="journey-form-controls"><button className="button secondary" onClick={()=>onNavigate('Estimate')}>Review budget confirmation</button>{(owner||p.accessRole==='Approver')&&<button className="button secondary" onClick={()=>onNavigate('Billing')}>View billing</button>}</div>}
 </>:<div className="empty"><h3>A shared understanding before work begins.</h3><p>{owner?'Create an estimate, then bring scope, delivery and investment together here.':'Your studio will share the proposal here when it is ready.'}</p></div>}
 </section>;
}

