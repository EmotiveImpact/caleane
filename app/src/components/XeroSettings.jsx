import React,{useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {WorkspaceButton,WorkspaceField,WorkspaceSelect,WorkspaceStatus} from './workspace/WorkspaceUI';
import {useConfirm} from './ConfirmDialog';
import './xero.css';

const when=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const money=(minor,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);

// Xero connection: issued invoices and recorded payments are copied into the studio's Xero organisation.
export function XeroSettings({studio,request}){
 const endpoint='/api/xero?studio='+studio.id;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[justConnected,setJustConnected]=useState(false),[confirm,confirmation]=useConfirm(),callback=useRef(false);
 const loaded=result=>{setData(result);setForm(result.settings);};
 async function send(body,message){setBusy(true);setError('');setNotice('');try{const result=await request(endpoint,'POST',body);if(result.url){location.assign(result.url);return result;}loaded(result);if(message)setNotice(message);return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
 useEffect(()=>{
  let active=true;const url=new URL(location.href);
  if(url.searchParams.get('xero_callback')&&!callback.current){
   callback.current=true;const code=url.searchParams.get('code'),state=url.searchParams.get('state'),denied=url.searchParams.get('error');
   for(const key of ['xero_callback','code','state','error'])url.searchParams.delete(key);history.replaceState(null,'',url.pathname+url.search);
   if(denied){setError('Xero was not connected.');}else if(code&&state){setJustConnected(true);send({action:'complete',code,state},'Xero is connected. Check the account codes below, then sync.');return ()=>{active=false;};}
  }
  request(endpoint).then(result=>{if(active)loaded(result);}).catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[endpoint,request]);
 if(!data||!form)return <section className="integration-card xero-settings" aria-labelledby="xero-title"><header className="integration-card-head"><div><h3 id="xero-title">Xero</h3></div></header><p className="commerce-muted" role={error?'alert':'status'}>{error||'Loading Xero…'}</p></section>;
 const set=patch=>setForm({...form,...patch});
 async function disconnect(){if(await confirm({title:'Disconnect Xero?',description:'Caleane will stop sending invoices and payments. Everything already in Xero stays there. Reconnecting the same organisation carries on without sending anything twice.',confirmLabel:'Disconnect'}))send({action:'disconnect'},'Xero is disconnected.');}
 return <section className="integration-card xero-settings" aria-labelledby="xero-title">
  <header className="integration-card-head">
   <div><h3 id="xero-title">Xero</h3><p>Send each invoice you issue, and each payment you record, to Xero, so your books match without typing anything twice.</p>{data.connected&&<small>{data.organisation} · connected {when(data.connectedAt)}{data.lastSyncAt?` · last sync ${when(data.lastSyncAt)}`:''}</small>}</div>
   <WorkspaceStatus value={data.connected?'Connected':data.configured?'Not connected':'Coming soon'} tone={data.connected?'success':'neutral'}/>
  </header>
  {!data.configured?<p className="xero-note">Xero needs to be switched on for this workspace before you can connect. Once it is, you sign in to Xero here and choose your organisation.</p>
  :!data.connected?<div className="integration-card-actions"><WorkspaceButton disabled={busy} onClick={()=>send({action:'connect'})}>Connect Xero</WorkspaceButton></div>
  :<>
   {data.lastError&&<p className="xero-note xero-warning" role="status">{data.lastError}</p>}
   <dl className="xero-totals"><div><dt>Invoices sent</dt><dd>{data.sent.invoices}</dd></div><div><dt>Payments sent</dt><dd>{data.sent.payments}</dd></div><div><dt>Need attention</dt><dd>{data.problems}</dd></div></dl>
   <div className="integration-card-actions"><WorkspaceButton disabled={busy} onClick={()=>send({action:'sync'},'Xero is up to date.')}><RefreshCw size={14}/> {busy?'Syncing…':'Sync now'}</WorkspaceButton>{data.problems>0&&<WorkspaceButton variant="secondary" disabled={busy} onClick={()=>send({action:'retry'},'Tried again.')}>Try failed ones again</WorkspaceButton>}<WorkspaceButton variant="ghost" disabled={busy} onClick={disconnect}>Disconnect</WorkspaceButton></div>
  </>}
  {error&&<p className="commerce-error" role="alert">{error}</p>}
  {notice&&<p className="xero-notice" role="status">{notice}</p>}
  {data.connected&&data.recent.length>0&&<details className="integration-more"><summary>Recent invoices</summary><ul className="xero-list">{data.recent.map(item=><li key={item.id}><div><strong>{item.number||'Invoice'}</strong><small>{item.amountMinor?money(item.amountMinor,item.currency):''}{item.syncedAt?` · ${when(item.syncedAt)}`:''}{item.error?` · ${item.error}`:''}</small></div><WorkspaceStatus value={item.status} tone={item.status==='Sent'?'success':item.status==='Error'?'danger':'neutral'}/></li>)}</ul></details>}
  {data.configured&&<details className="integration-more" open={justConnected||undefined}><summary>How invoices arrive in Xero</summary><form onSubmit={e=>{e.preventDefault();send({action:'save',settings:form},'Saved.');}}>
   <div className="settings-fields">
    <WorkspaceField label="Sales account code" value={form.salesAccountCode} maxLength={20} required onChange={e=>set({salesAccountCode:e.target.value})} hint="Usually 200, Sales."/>
    <WorkspaceField label="Send invoices as"><WorkspaceSelect label="Send invoices as" value={form.invoiceStatus} onValueChange={invoiceStatus=>set({invoiceStatus})} options={[{value:'AUTHORISED',label:'Approved'},{value:'DRAFT',label:'Drafts to review in Xero'}]}/></WorkspaceField>
    <WorkspaceField label="VAT rate code" value={form.taxType} maxLength={20} onChange={e=>set({taxType:e.target.value})} hint="OUTPUT2 is 20% VAT on income."/>
    <WorkspaceField label="Rate code when there is no VAT" value={form.noTaxType} maxLength={20} onChange={e=>set({noTaxType:e.target.value})} hint="NONE, or ZERORATEDOUTPUT."/>
    <WorkspaceField label="Reduced rate code" value={form.reducedTaxType??''} maxLength={20} onChange={e=>set({reducedTaxType:e.target.value})} hint="RROUTPUT is 5% VAT, for lines at the reduced rate."/>
    <WorkspaceField label="Zero rate code" value={form.zeroTaxType??''} maxLength={20} onChange={e=>set({zeroTaxType:e.target.value})} hint="ZERORATEDOUTPUT, for zero-rated lines."/>
    <WorkspaceField label="Exempt code" value={form.exemptTaxType??''} maxLength={20} onChange={e=>set({exemptTaxType:e.target.value})} hint="EXEMPTOUTPUT, for lines exempt from VAT."/>
    <WorkspaceField label="Bank account code for payments" value={form.bankAccountCode} maxLength={20} onChange={e=>set({bankAccountCode:e.target.value})} hint="Leave empty to send invoices only. Payments need approved invoices."/>
    <WorkspaceField label="Send invoices issued from" type="date" value={form.sendFrom} onChange={e=>set({sendFrom:e.target.value})} hint="Empty means from the day you connected."/>
   </div>
   <footer className="settings-save-row"><WorkspaceButton type="submit" variant="secondary" disabled={busy}>Save Xero settings</WorkspaceButton></footer>
  </form><p className="xero-small">Caleane checks for new invoices and payments every few minutes. Contacts are matched by name in Xero. Cancelling an invoice here voids it in Xero unless it has payments there. Credit notes and refunds are not sent yet.</p></details>}
  {confirmation}
 </section>;
}
