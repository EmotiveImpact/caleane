import React,{useEffect,useState} from 'react';
const NAMES={database:'Workspace',email:'Email',outbox:'Notifications',backup:'Encrypted backup',offsite:'Offsite backup',ai:'Quiet helper',calendar:'Calendar sync',zoom:'Zoom',xero:'Xero',stripe:'Card payments (Stripe)'};
const LATER=['ai','calendar','zoom','xero','stripe'];
// Each check reads as one of four plain states, so a studio sees at a glance what needs them.
function stateOf(c){
 if(c.status==='ready')return ['ready','Ready'];
 if(c.status==='attention')return ['attention','Needs attention'];
 if(c.status==='waiting'&&LATER.includes(c.id))return ['later','Coming soon'];
 if(c.status==='configured'&&['calendar','xero','stripe'].includes(c.id))return ['setup','Not connected'];
 if(c.status==='configured')return ['ready','Configured'];
 return ['setup','Setup required'];
}
export function OperationsReadiness({studio,request}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;request('/api/operations?studio='+studio.id).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[studio.id,request]);
 const rows=data?.checks.map(c=>({...c,state:stateOf(c)}))||[],count=tone=>rows.filter(r=>r.state[0]===tone).length;
 const summary=[[count('ready'),'ready'],[count('attention'),'need attention'],[count('setup'),'to set up'],[count('later'),'coming soon']].filter(([n])=>n).map(([n,label])=>`${n} ${n===1&&label==='need attention'?'needs attention':label}`).join(' · ');
 return <section className="calendar-sync-settings service-readiness"><h2>Service readiness</h2><p>Connection and backup checks for this workspace.</p>
  {error?<p role="alert">{error}</p>:!data?<p>Checking services…</p>:<><p className="service-summary">{summary}</p><ul>{rows.map(c=><li key={c.id} className={'is-'+c.state[0]}><div><strong>{NAMES[c.id]}</strong><p>{c.detail}</p></div><span className="service-state">{c.state[1]}</span></li>)}</ul></>}
 </section>;
}
