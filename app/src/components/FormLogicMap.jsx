import React,{useState} from 'react';
import {AlertTriangle,CheckCircle2,CornerDownRight,GitBranch,Monitor,Pencil,Play,Split} from 'lucide-react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import {FormLogicEditor} from './FormLogicEditor';
import {formFields,describeCondition} from '../lib/form-flow.js';
import {logicGraph,routeSentences} from '../lib/brief-steps.js';

// The whole route through a form on one map. Screens only some people see sit to the right of the main path.
const ROW=92,NODE_H=60,W=260,X0=28,X1=X0+W+64,TOP=24;
export function FormLogicMap({definition:d,onChange,selectedId,onSelect,onEdit,onTest}){
 const [showIssues,setShowIssues]=useState(false);
 const {screens,edges:base,issues}=logicGraph(d),fields=formFields(d);
 const selected=screens.find(s=>s.id===selectedId)||screens[0],index=screens.indexOf(selected);
 const prior=fields.filter(f=>screens.slice(0,index).some(s=>s.fields.includes(f.id)));
 const patch=value=>onChange({...d,screens:screens.map(s=>s.id===selected.id?{...s,...value}:s)});
 const warn=new Set(issues.map(i=>i.screen).filter(Boolean));
 const pos=new Map(screens.map((s,i)=>[s.id,{x:s.showWhen?X1:X0,y:TOP+i*ROW}]));pos.set('end',{x:X0,y:TOP+screens.length*ROW});
 // A screen with a show condition can be skipped, so the screen before it also leads past it.
 const edges=[];
 for(const e of base){
  const target=screens.find(s=>s.id===e.to);
  if(e.kind==='next'&&target?.showWhen){
   edges.push({...e,label:'If '+describeCondition(target.showWhen,fields)});
   let n=screens.indexOf(target)+1;while(screens[n]?.showWhen)n++;
   edges.push({from:e.from,to:screens[n]?.id||'end',kind:'skip',label:e.label||'Everyone else'});
  }else edges.push(e);
 }
 let lane=0;const laneX=X1+W+36,paths=[],pills=[];
 for(const e of edges){
  const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)continue;
  const hot=e.from===selected.id,cls=e.kind+(hot?' hot':'');let p,lx,ly;
  if(e.kind==='jump'){const x=laneX+lane++*26,y1=a.y+NODE_H/2,y2=b.y+NODE_H/2;p=`M${a.x+W} ${y1} H${x-10} Q${x} ${y1} ${x} ${y1+10} V${y2-10} Q${x} ${y2} ${x-10} ${y2} H${b.x+W+6}`;lx=x;ly=(y1+y2)/2;}
  else if(a.x===b.x){const x=a.x+22;p=`M${x} ${a.y+NODE_H} V${b.y}`;lx=x+70;ly=(a.y+NODE_H+b.y)/2;}
  else if(b.x>a.x){const y=a.y+NODE_H/2,yb=b.y+NODE_H/2;p=`M${a.x+W} ${y} H${b.x-32} Q${b.x-20} ${y} ${b.x-20} ${y+12} V${yb-12} Q${b.x-20} ${yb} ${b.x-8} ${yb} H${b.x}`;lx=b.x-20;ly=(y+yb)/2;}
  else{const x=a.x+W/2,y=b.y+NODE_H/2;p=`M${x} ${a.y+NODE_H} V${y-12} Q${x} ${y} ${x-12} ${y} H${b.x+W+6}`;}
  paths.push(<path key={paths.length} className={cls} d={p} markerEnd="url(#form-logic-arrow)"/>);
  if(e.label&&lx)pills.push(<span key={pills.length} className={'form-logic-pill '+cls} style={{left:lx,top:ly}}>{e.label}</span>);
 }
 const height=TOP+(screens.length+1)*ROW,width=laneX+lane*26+40;
 const sentences=routeSentences(d);
 const status=issues.length?<button type="button" className="form-logic-state warn" aria-expanded={showIssues} onClick={()=>setShowIssues(!showIssues)}><AlertTriangle size={14} aria-hidden="true"/>{issues.length} to check</button>:<span className="form-logic-state ok"><CheckCircle2 size={14} aria-hidden="true"/>Every path reaches the end</span>;
 return <div className="form-logic-workspace">
  <div className="form-logic-map">
   <div className="form-logic-head"><div><h2>How clients move through this form</h2><p>Select a screen to choose who sees it and where it leads.</p></div><div className="forms-toolbar">{status}<WorkspaceButton variant="secondary" onClick={onTest}><Play size={14} aria-hidden="true"/>Try it as a client</WorkspaceButton></div></div>
   {showIssues&&issues.length>0&&<ul className="form-logic-issues">{issues.map((issue,i)=><li key={i}><button type="button" disabled={!issue.screen} onClick={()=>issue.screen&&onSelect(issue.screen)}><AlertTriangle size={14} aria-hidden="true"/>{issue.text}</button></li>)}</ul>}
   <div className="form-logic-canvas" style={{height,minWidth:width}}>
    <svg aria-hidden="true" width={width} height={height}><defs><marker id="form-logic-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z"/></marker></defs>{paths}</svg>
    {screens.map((s,i)=>{const {x,y}=pos.get(s.id);return <button type="button" key={s.id} className={'form-logic-node'+(s.id===selected.id?' selected':'')+(s.showWhen?' conditional':'')+(warn.has(s.id)?' warn':'')} aria-pressed={s.id===selected.id} style={{left:x,top:y,width:W,height:NODE_H}} onClick={()=>onSelect(s.id)} onDoubleClick={()=>onEdit(s.id)}><span className="screen-number">{String(i+1).padStart(2,'0')}</span><span><strong>{s.title||'Untitled screen'}</strong><small>{s.showWhen?<><Split size={12} aria-hidden="true"/>Only some people</>:s.jumps.length?<><GitBranch size={12} aria-hidden="true"/>{s.jumps.length} {s.jumps.length===1?'rule':'rules'}</>:s.kind==='welcome'?'Welcome':s.fields.length===1?'1 question':s.fields.length+' questions'}</small></span></button>;})}
    <div className="form-logic-node end" style={{left:X0,top:pos.get('end').y,width:W,height:NODE_H}}><span className="screen-number">✓</span><span><strong>Brief sent</strong><small>{d.successTitle||'Thank you'}</small></span></div>
    {pills}
   </div>
  </div>
  <aside className="form-logic-side" aria-label="Logic for the selected screen"><div className="screen-inspector-heading"><div><small>SCREEN {index+1}</small><h2>{selected.title||'Untitled screen'}</h2></div></div><FormLogicEditor key={selected.id} definition={d} selected={selected} fields={fields} prior={prior} patch={patch} onTest={onTest}/><WorkspaceButton variant="ghost" onClick={()=>onEdit(selected.id)}><Pencil size={14} aria-hidden="true"/>Edit this screen</WorkspaceButton></aside>
  <section className="form-logic-gate" aria-label="Logic on a small screen">
   <div className="form-logic-gate-card"><Monitor size={22} aria-hidden="true"/><h2>Change logic on a computer</h2><p>Rules affect every path through the form, so Caleane keeps editing them to a larger screen where the whole map fits. Here you can check what is set up and try it.</p><WorkspaceButton variant="secondary" onClick={onTest}><Play size={14} aria-hidden="true"/>Try it as a client</WorkspaceButton></div>
   <h3>{issues.length?<><AlertTriangle size={15} aria-hidden="true"/>{issues.length} {issues.length===1?'thing':'things'} to check</>:<><CheckCircle2 size={15} aria-hidden="true"/>Every path reaches the end</>}</h3>
   {issues.map((issue,i)=><p key={i} className="form-logic-warning">{issue.text}</p>)}
   <h3>What is set up now</h3>
   {sentences.length?<ol className="form-logic-sentences">{sentences.map((line,i)=><li key={i}><strong>{line.screen.title||'Untitled screen'}</strong><small>{line.kind==='only'?<Split size={12} aria-hidden="true"/>:<CornerDownRight size={12} aria-hidden="true"/>}{line.text}</small></li>)}</ol>:<p className="form-help">No rules yet. Everyone sees every screen in order.</p>}
  </section>
 </div>;
}
