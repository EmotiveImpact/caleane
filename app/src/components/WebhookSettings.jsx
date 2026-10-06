import React,{useEffect,useState} from 'react';
import {Copy,Eye,EyeOff,Send,RotateCcw,Trash2} from 'lucide-react';
import {WorkspaceButton,WorkspaceCheckbox,WorkspaceField,WorkspaceStatus,WorkspaceSwitch} from './workspace/WorkspaceUI';
import {useConfirm} from './ConfirmDialog';
import './webhooks.css';

const when=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const deliveryTone={delivered:'success',pending:'warning',failed:'danger'};
const deliveryLabel={delivered:'Delivered',pending:'Retrying',failed:'Failed'};

function EventChoices({events,value,onChange}){
 return <fieldset className="webhook-events"><legend>Send these events</legend>{events.map(event=><WorkspaceCheckbox key={event.type} label={<><strong>{event.label}</strong><small>{event.description}</small></>} checked={value.includes(event.type)} onCheckedChange={checked=>onChange(checked?[...value,event.type]:value.filter(type=>type!==event.type))}/>)}</fieldset>;
}

function Endpoint({endpoint,events,busy,send,deliveries}){
 const [editing,setEditing]=useState(false),[chosen,setChosen]=useState(endpoint.events),[reveal,setReveal]=useState(false),[copied,setCopied]=useState(false),[confirm,confirmation]=useConfirm();
 useEffect(()=>{setChosen(endpoint.events);},[endpoint.events.join()]);
 const recent=deliveries.filter(item=>item.endpointId===endpoint.id).slice(0,5);
 const labels=endpoint.events.map(type=>events.find(event=>event.type===type)?.label||type);
 async function remove(){if(await confirm({title:'Remove this endpoint?',description:'Caleane will stop sending events to it straight away. Anything that relies on it, such as a Zap, will stop receiving new records.',confirmLabel:'Remove endpoint'}))send({action:'delete',id:endpoint.id});}
 async function rotate(){if(await confirm({title:'Create a new signing secret?',description:'The current secret stops working immediately. Update it wherever you check signatures.',confirmLabel:'Create new secret'}))send({action:'rotate',id:endpoint.id});}
 return <article className="webhook-endpoint">
  <header><div><h4>{endpoint.description||new URL(endpoint.url).hostname}</h4><code>{endpoint.url}</code></div><WorkspaceStatus value={endpoint.active?'On':'Off'} tone={endpoint.active?'success':'neutral'}/></header>
  {endpoint.disabledReason&&<p className="webhook-warning" role="status">{endpoint.disabledReason}</p>}
  <WorkspaceSwitch label="Send events" description={endpoint.active?'New events are sent as they happen.':'Turning this on sends events from now on, not anything missed.'} checked={endpoint.active} disabled={busy} onCheckedChange={active=>send({action:'update',id:endpoint.id,active})}/>
  {editing?<form onSubmit={async e=>{e.preventDefault();if(await send({action:'update',id:endpoint.id,events:chosen}))setEditing(false);}}><EventChoices events={events} value={chosen} onChange={setChosen}/><div className="webhook-actions"><WorkspaceButton type="submit" size="small" disabled={busy||!chosen.length}>Save events</WorkspaceButton><WorkspaceButton variant="ghost" size="small" onClick={()=>{setChosen(endpoint.events);setEditing(false);}}>Cancel</WorkspaceButton></div></form>
   :<p className="webhook-subscribed"><span>Sends</span> {labels.join(', ')} <button type="button" className="text-button" onClick={()=>setEditing(true)}>Change</button></p>}
  <div className="webhook-secret"><span>Signing secret</span><code>{reveal?endpoint.secret:'whsec_••••••••••••'}</code><WorkspaceButton variant="ghost" size="small" iconOnly aria-label={reveal?'Hide secret':'Show secret'} onClick={()=>setReveal(!reveal)}>{reveal?<EyeOff size={14}/>:<Eye size={14}/>}</WorkspaceButton><WorkspaceButton variant="ghost" size="small" iconOnly aria-label="Copy secret" onClick={async()=>{try{await navigator.clipboard.writeText(endpoint.secret);setCopied(true);}catch{setReveal(true);}}}><Copy size={14}/></WorkspaceButton>{copied&&<small role="status">Copied</small>}</div>
  {recent.length>0&&<ul className="webhook-deliveries" aria-label="Recent deliveries">{recent.map(item=><li key={item.id}><div><strong>{events.find(event=>event.type===item.type)?.label||(item.type==='webhook.test'?'Test event':item.type)}</strong><small>{when(item.deliveredAt||item.createdAt)}{item.status==='pending'&&item.nextAttemptAt?` · next try ${when(item.nextAttemptAt)}`:''}{item.error?` · ${item.error}`:''}</small></div><WorkspaceStatus value={deliveryLabel[item.status]} tone={deliveryTone[item.status]}/>{item.status==='failed'&&endpoint.active&&<WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>send({action:'redeliver',deliveryId:item.id})}>Send again</WorkspaceButton>}</li>)}</ul>}
  <footer className="webhook-actions"><WorkspaceButton variant="secondary" size="small" disabled={busy||!endpoint.active} onClick={()=>send({action:'test',id:endpoint.id})}><Send size={14}/> Send a test</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={rotate}><RotateCcw size={14}/> New secret</WorkspaceButton><WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={remove}><Trash2 size={14}/> Remove</WorkspaceButton></footer>
  {confirmation}
 </article>;
}

const isZapier=url=>{try{return /(^|\.)zapier\.com$/i.test(new URL(url).hostname);}catch{return false;}};

function NewEndpoint({kind,events,busy,send,onDone}){
 const [draft,setDraft]=useState({url:'',description:'',events:['enquiry.received','booking.created']});
 return <form className="webhook-endpoint webhook-new" onSubmit={async e=>{e.preventDefault();if(await send({action:'create',...draft,description:draft.description.trim()}))onDone();}}>
  <h4>{kind==='zapier'?'Add a Zapier catch hook':'Add an endpoint'}</h4>
  <WorkspaceField label={kind==='zapier'?'Catch hook address':'Endpoint address'} type="url" required placeholder={kind==='zapier'?'https://hooks.zapier.com/hooks/catch/…':'https://example.com/caleane-events'} value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})} hint={kind==='zapier'?'Copy it from the Catch Hook step in your Zap.':'Must start with https://.'}/>
  <WorkspaceField label="Name (optional)" maxLength={80} placeholder={kind==='zapier'?'Zapier: new leads to Google Sheets':'Studio CRM'} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/>
  <EventChoices events={events} value={draft.events} onChange={chosen=>setDraft({...draft,events:chosen})}/>
  <div className="webhook-actions"><WorkspaceButton type="submit" disabled={busy||!draft.events.length}>{busy?'Adding…':kind==='zapier'?'Add catch hook':'Add endpoint'}</WorkspaceButton><WorkspaceButton variant="ghost" onClick={onDone}>Cancel</WorkspaceButton></div>
 </form>;
}

// Webhooks and Zapier are two cards that share one list of endpoints. A Zapier
// catch hook is an ordinary webhook, shown on the Zapier card so each service
// reads on its own.
export function WebhookSettings({studio,request}){
 const endpoint='/api/webhooks?studio='+studio.id;
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[adding,setAdding]=useState(null);
 useEffect(()=>{let active=true;request(endpoint).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[endpoint,request]);
 async function send(body){setBusy(true);setError('');try{const result=await request(endpoint,'POST',body);setData(result);return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
 if(!data)return <section className="integration-card" aria-labelledby="webhooks-title"><header className="integration-card-head"><div><h3 id="webhooks-title">Webhooks</h3></div></header><p className="commerce-muted" role={error?'alert':'status'}>{error||'Loading webhooks…'}</p></section>;
 const zaps=data.endpoints.filter(item=>isZapier(item.url)),hooks=data.endpoints.filter(item=>!isZapier(item.url)),full=data.endpoints.length>=10;
 const on=list=>list.filter(item=>item.active).length;
 const card=(kind,list)=>{
  const zapier=kind==='zapier',active=on(list);
  return <section className="integration-card" aria-labelledby={`${kind}-title`}>
   <header className="integration-card-head">
    <div><h3 id={`${kind}-title`}>{zapier?'Zapier':'Webhooks'}</h3><p>{zapier?'Start a Zap when an enquiry, booking, invoice or payment arrives, and pass it on to the apps you already use.':'Send new enquiries, bookings, invoices and payments to your own server, Make or n8n as they happen. Each event is signed so the receiver can check it came from Caleane.'}</p></div>
    <WorkspaceStatus value={active?(zapier?`${active} ${active===1?'Zap':'Zaps'} on`:`${active} ${active===1?'endpoint':'endpoints'} on`):list.length?'Paused':'Not connected'} tone={active?'success':'neutral'}/>
   </header>
   {list.map(item=><Endpoint key={item.id} endpoint={item} events={data.events} busy={busy} send={send} deliveries={data.deliveries}/>)}
   {adding===kind?<NewEndpoint kind={kind} events={data.events} busy={busy} send={send} onDone={()=>setAdding(null)}/>
    :!full&&<div className="integration-card-actions"><WorkspaceButton variant={list.length?'secondary':'primary'} onClick={()=>setAdding(kind)}>{zapier?(list.length?'Add another Zap':'Connect a Zap'):(list.length?'Add another endpoint':'Add an endpoint')}</WorkspaceButton></div>}
   {zapier?<details className="integration-more"><summary>How to connect Zapier</summary>
     <ol className="webhook-steps"><li>In Zapier, create a Zap and choose <strong>Webhooks by Zapier</strong>, then <strong>Catch Hook</strong>.</li><li>Copy the webhook URL Zapier gives you, press <strong>Connect a Zap</strong> here and paste it in.</li><li>Press <strong>Send a test</strong> so Zapier can see the fields, then build the rest of your Zap.</li></ol>
     <p>Webhooks by Zapier needs a paid Zapier plan. Make, n8n and Pabbly accept the same address under Webhooks.</p>
    </details>
   :<details className="integration-more"><summary>What each event contains</summary>
     <p>A JSON body with <code>id</code>, <code>type</code>, <code>createdAt</code>, your studio and a <code>data</code> object with the record, such as the client’s name and email or the invoice total and balance.</p>
     <h4>Checking the signature</h4>
     <p>Each request has a <code>Caleane-Signature</code> header of the form <code>t=timestamp,v1=signature</code>. The signature is an HMAC-SHA256 of <code>timestamp.body</code> using the endpoint’s secret. <code>Caleane-Delivery</code> stays the same on retries, so you can ignore repeats.</p>
     <h4>If your endpoint is down</h4>
     <p>Caleane tries again after 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours. After 25 failures in a row, or if the endpoint replies 410, it is switched off.</p>
    </details>}
  </section>;
 };
 return <>
  {data.delivery==='off'&&<p className="webhook-warning" role="status">Webhook delivery is switched off in this sample workspace. You can try the Webhooks and Zapier screens, but nothing is sent.</p>}
  {error&&<p className="commerce-error" role="alert">{error}</p>}
  {card('webhooks',hooks)}
  {card('zapier',zaps)}
  {full&&<p className="xero-small">You have 10 endpoints, the most a studio can have. Remove one to add another.</p>}
 </>;
}
