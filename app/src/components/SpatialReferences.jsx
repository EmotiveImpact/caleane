import React,{useEffect,useLayoutEffect,useRef,useState,lazy,Suspense} from 'react';
import {ArrowUpLeft,Hand,LayoutGrid,Maximize2,Minus,MousePointer2,Plus,Redo2,Undo2,X} from 'lucide-react';
import {constrainPosition,fitCamera,mergePositions,samePositions,startingPositions,tidyPositions,zoomCamera} from '../lib/reference-board';
import '../spatial-references.css';
const ReferenceCanvas=lazy(()=>import('./ReferenceCanvas').then(module=>({default:module.ReferenceCanvas})));
const blankHistory=()=>({past:[],present:null,future:[],baseline:null,revision:null});

function PlacementInput({label,value,min,max,onCommit,disabled}){
 const [text,setText]=useState(String(value));
 useEffect(()=>setText(String(value)),[value]);
 function commit(){const n=Number(text);if(text.trim()&&Number.isFinite(n)){const next=Math.max(min,Math.min(max,Math.round(n)));onCommit(next);setText(String(next));}else setText(String(value));}
 return <label>{label}<input aria-label={`Reference ${label.toLowerCase()}`} type="number" min={min} max={max} step="1" disabled={disabled} value={text} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.stopPropagation();setText(String(value));}}}/></label>;
}
export function SpatialReferences({p,studio,items,owner,busy,mutate,onOpen,onDirtyChange,onAdd,canAdd,onClearFilters,active=true}){
 const [editor,setEditor]=useState(blankHistory),[selected,setSelected]=useState(null),[size,setSize]=useState({width:800,height:520}),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const [tool,setTool]=useState('select'),[camera,setCameraState]=useState({x:0,y:0,scale:1}),[autoFit,setAutoFit]=useState(true);
 const viewport=useRef(null),root=useRef(null),saveButton=useRef(null);
 const revision=p.referenceLayout?.revision||0,positions=mergePositions(p,editor.present);
 const dirty=!!editor.present&&!samePositions(positions,mergePositions(p,editor.baseline));
 const stale=dirty&&editor.revision!==revision,disabled=saving||busy||stale;
 const item=items.find(ref=>ref.id===selected),effectiveCamera=autoFit?fitCamera(items,positions,size):camera;
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setSize({width:Math.floor(entry.contentRect.width),height:Math.floor(entry.contentRect.height)});});if(viewport.current)observer.observe(viewport.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange(false),[onDirtyChange]);
 useEffect(()=>{if(!dirty&&editor.revision!==null&&editor.revision!==revision)setEditor(blankHistory());},[revision,dirty,editor.revision]);
 useEffect(()=>{if(selected&&!items.some(ref=>ref.id===selected))setSelected(null);},[items,selected]);
 useEffect(()=>{if(!dirty)return;const savedURL=window.location.href;
  const warn=e=>{e.preventDefault();e.returnValue='';};
  const navigate=e=>{e.preventDefault();window.history.replaceState(null,'',savedURL);setNotice('Save your arrangement or discard changes before leaving this project.');root.current?.scrollIntoView({block:'center',behavior:'smooth'});saveButton.current?.focus({preventScroll:true});};
  window.addEventListener('beforeunload',warn);window.addEventListener('caleane:before-navigate',navigate);
  return()=>{window.removeEventListener('beforeunload',warn);window.removeEventListener('caleane:before-navigate',navigate);};
 },[dirty]);
 function setCamera(next){setAutoFit(false);setCameraState(next);}
 function commit(next){
  if(!owner||disabled||samePositions(positions,next))return;
  // Freeze the view before editing so moving a card never moves the camera.
  setCamera(effectiveCamera);setNotice('');
  setEditor(current=>({past:[...current.past.slice(-39),positions],present:next,future:[],baseline:current.baseline||startingPositions(p),revision:current.revision??revision}));
 }
 function change(id,next){commit({...positions,[id]:constrainPosition(next)});}
 function undo(){if(!editor.past.length||disabled)return;setEditor(current=>({...current,past:current.past.slice(0,-1),present:current.past.at(-1),future:[positions,...current.future]}));setNotice('');}
 function redo(){if(!editor.future.length||disabled)return;setEditor(current=>({...current,past:[...current.past,positions],present:current.future[0],future:current.future.slice(1)}));setNotice('');}
 function discard(){setEditor(blankHistory());setNotice('Changes discarded. Saved arrangement restored.');}
 async function save(){
  if(!dirty||disabled)return;setSaving(true);setNotice('');
  try{const result=await mutate('reference-layout',{revision:editor.revision,positions:Object.entries(positions).map(([id,pos])=>({id,...pos}))});
   if(result){setEditor(blankHistory());setNotice('Arrangement saved for everyone on this project.');}
   else setNotice('Could not save. Your changes are still here. Refresh project data if someone else has changed the board.');
  }catch{setNotice('Could not save. Your changes are still here; try again.');}finally{setSaving(false);}
 }
 function keyboard(e){
  if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}
  if(e.key==='Escape')setSelected(null);
 }
 function focusReference(id){setSelected(id);const fit=fitCamera([{id}],positions,size);setCamera({...fit,scale:Math.min(1,fit.scale)});}
 function zoom(scale){setCamera(zoomCamera(effectiveCamera,scale,{x:size.width/2,y:size.height/2}));}
 return <div ref={root} className="spatial-board" onKeyDown={keyboard}>
  <div className="spatial-controls">
   <div className="spatial-tools" role="group" aria-label="Canvas tools">
    <button aria-label="Select and arrange" title="Select and arrange" aria-pressed={tool==='select'} onClick={()=>setTool('select')}><MousePointer2 size={17}/></button>
    <button aria-label="Pan board" title="Pan board" aria-pressed={tool==='pan'} onClick={()=>setTool('pan')}><Hand size={17}/></button>
    <span className="spatial-tool-divider"/>
    {owner&&<><button aria-label="Undo" title="Undo · ⌘/Ctrl Z" disabled={!editor.past.length||disabled} onClick={undo}><Undo2 size={17}/></button><button aria-label="Redo" title="Redo · ⌘/Ctrl Shift Z" disabled={!editor.future.length||disabled} onClick={redo}><Redo2 size={17}/></button><button className="spatial-tool-label" disabled={!items.length||disabled} onClick={()=>{commit(tidyPositions(items,positions));setAutoFit(true);setNotice('Visible references tidied. Undo to restore your arrangement.');}}><LayoutGrid size={16}/>Tidy up</button></>}
   </div>
   <div className="spatial-save-controls">{owner&&<><span className={'spatial-save-state'+(dirty?' is-dirty':'')}>{saving?'Saving…':dirty?'Unsaved changes':'All changes saved'}</span>{dirty&&<button className="text-button" disabled={saving||busy} onClick={discard}>Discard changes</button>}<button ref={saveButton} className="button" disabled={!dirty||disabled} onClick={save}>{saving?'Saving…':'Save arrangement'}</button></>}</div>
  </div>
  {(notice||stale)&&<p className="spatial-notice" role="status">{stale?'The saved arrangement changed elsewhere. Discard your changes to use the latest layout.':notice}</p>}
  <div className="spatial-workspace">
   <div className="spatial-canvas-column">
    <div ref={viewport} className={'spatial-viewport '+(tool==='pan'?'is-panning':'')} tabIndex={0} aria-label="Reference canvas" aria-describedby="board-instructions" style={{backgroundSize:`${24*effectiveCamera.scale}px ${24*effectiveCamera.scale}px`,backgroundPosition:`${effectiveCamera.x}px ${effectiveCamera.y}px`}}>
     {!items.length?<div className="studio-empty"><LayoutGrid size={30}/><h2>{p.inspiration.length?'No matching references':'The start of something good'}</h2><p>{p.inspiration.length?'Try another category or show all your references.':'Bring together images, materials, links and notes. Arrange the direction as it takes shape.'}</p><button className="button secondary" onClick={p.inspiration.length?onClearFilters:onAdd} disabled={!p.inspiration.length&&!canAdd}>{p.inspiration.length?'Clear filters':'Add your first reference'}</button></div>:active&&<Suspense fallback={<p className="spatial-notice">Opening canvas…</p>}><ReferenceCanvas p={p} studio={studio} items={items} positions={positions} selected={selected} setSelected={setSelected} change={change} editable={owner&&!disabled} size={size} camera={effectiveCamera} setCamera={setCamera} tool={tool} onOpen={id=>onOpen(id,viewport.current)}/></Suspense>}
     <div className="spatial-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" disabled={effectiveCamera.scale<=.05} onClick={()=>zoom(effectiveCamera.scale/1.25)}><Minus size={15}/></button><button aria-label="Zoom to 100 percent" onClick={()=>zoom(1)}>{Math.round(effectiveCamera.scale*100)}%</button><button aria-label="Zoom in" disabled={effectiveCamera.scale>=2} onClick={()=>zoom(effectiveCamera.scale*1.25)}><Plus size={15}/></button><span/><button onClick={()=>setAutoFit(true)}><Maximize2 size={14}/>Fit board</button></div>
    </div>
    <div className="canvas-accessible-list" aria-label="Canvas references">{items.length>0&&<span>{items.length} reference{items.length===1?'':'s'}</span>}{items.map(ref=><button key={ref.id} aria-pressed={selected===ref.id} onClick={()=>focusReference(ref.id)} onKeyDown={e=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(owner&&!disabled&&directions[e.key]){e.preventDefault();const pos=positions[ref.id],step=e.shiftKey?40:10;setSelected(ref.id);change(ref.id,{...pos,x:pos.x+directions[e.key][0]*step,y:pos.y+directions[e.key][1]*step});}}}>{ref.title}</button>)}</div>
   </div>
   <aside className={'spatial-inspector'+(!item?' is-empty':'')} aria-label={item?'Selected reference':'Board guide'}>
    {item?<><header><span>{item.category||'Reference'}</span><button className="text-button" aria-label="Close reference inspector" onClick={()=>setSelected(null)}><X size={17}/></button></header><h3>{item.title}</h3>{item.note&&<p className="spatial-reference-note">{item.note}</p>}<dl>{item.source&&<div><dt>Source / credit</dt><dd>{item.source}</dd></div>}<div><dt>Shared by</dt><dd>{item.by}</dd></div></dl><button className="button secondary" onClick={e=>onOpen(item.id,e.currentTarget)}>Details & discussion{item.comments?.length?` (${item.comments.length})`:''}</button>{owner&&<details className="spatial-placement-details"><summary>Size & position</summary><fieldset disabled={disabled} className="spatial-placement"><legend className="sr-only">Reference placement</legend>{[['width','Width',180,600],['height','Height',200,700],['x','Left',0,6000-positions[item.id].width],['y','Top',0,12000-positions[item.id].height],['rotation','Rotation',-180,180]].map(([key,label,min,max])=><PlacementInput key={`${item.id}-${key}`} label={label} value={positions[item.id][key]||0} min={min} max={max} disabled={disabled} onCommit={value=>change(item.id,{...positions[item.id],[key]:value})}/>)}</fieldset></details>}<p className="spatial-help">Double-click a reference to open its source and discussion.</p></>:<><ArrowUpLeft size={25} strokeWidth={1.3}/><h3>A little room<br/>to explore.</h3><p>Select a reference to see its notes, source and discussion here.</p><div className="spatial-guide"><span><MousePointer2 size={16}/>{owner?'Drag to arrange. Use the handles to resize and rotate.':'Select a reference to explore the details.'}</span><span><Hand size={16}/>Use the hand tool to move around the board.</span><span><Maximize2 size={16}/>Fit board brings everything back into view.</span></div></>}
   </aside>
  </div>
  <footer className="spatial-footer"><p id="board-instructions">{owner?'Select a reference below, then use arrow keys to move it. Shift moves further.':'Select a reference below to explore it.'}</p><span>References guide the work. Approval stays with a design.</span></footer>
 </div>;
}
