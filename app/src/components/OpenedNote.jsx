import React,{useEffect} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import './opened-note.css';

// Each document is recorded once per page load; the server folds quick returns into one visit.
const sent=new Set();
export function useRecordOpen(p,owner,kind,itemId){
 useEffect(()=>{
  if(owner||!p?.id||!p.studioId||!itemId||p.accessRole==='Studio viewer')return;
  const key=`${p.id}:${kind}:${itemId}`;if(sent.has(key))return;sent.add(key);
  fetch(`/api/projects/${p.id}/opened?studio=${p.studioId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,itemId})}).catch(()=>sent.delete(key));
 },[p?.id,p?.studioId,owner,kind,itemId]);
}

const when=value=>{
 const at=new Date(value),days=Math.floor((Date.now()-at.getTime())/86400000);
 const time=at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
 if(days<1&&at.toDateString()===new Date().toDateString())return 'today at '+time;
 if(days<2&&at.toDateString()===new Date(Date.now()-86400000).toDateString())return 'yesterday at '+time;
 return 'on '+at.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:at.getFullYear()===new Date().getFullYear()?undefined:'numeric'});
};
const names=list=>list.length<=2?list.join(' and '):`${list.slice(0,-1).join(', ')} and ${list.at(-1)}`;

// Owner only: whether the client has opened this document, and when they last came back.
export function OpenedNote({p,owner,kind,itemId,shared=true}){
 if(!owner||!itemId||!shared||!p?.documentOpens)return null;
 const seen=p.documentOpens[`${kind}:${itemId}`];
 if(!seen)return <p className="opened-note is-unopened"><EyeOff size={14} aria-hidden="true"/><span>Not opened by the client yet</span></p>;
 const again=seen.opens>1||seen.lastOpenedAt.slice(0,16)!==seen.firstOpenedAt.slice(0,16);
 return <p className="opened-note is-opened"><Eye size={14} aria-hidden="true"/><span>Opened by {names(seen.people)} {when(seen.firstOpenedAt)}{again?<> · last looked {when(seen.lastOpenedAt)}{seen.opens>1?`, ${seen.opens} visits`:''}</>:null}</span></p>;
}
