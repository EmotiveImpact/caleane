import React,{useId,useState} from 'react';
import {imagePositionPoint,imagePositionValue} from '../lib/image-position.js';
import {WorkspaceButton} from './workspace/WorkspaceUI';

export function FormImagePosition({src,value='center',fit='cover',onChange}){
 const point=imagePositionPoint(value)||{x:50,y:50},[ratio,setRatio]=useState(1.5),[failed,setFailed]=useState(false),helpId=useId();
 const change=next=>onChange(imagePositionValue(next));
 function position(event){const box=event.currentTarget.getBoundingClientRect();if(box.width&&box.height)change({x:(event.clientX-box.left)/box.width*100,y:(event.clientY-box.top)/box.height*100});}
 function keyboard(event){const step=event.shiftKey?10:1,offset={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];if(!offset)return;event.preventDefault();change({x:point.x+offset[0],y:point.y+offset[1]});}
 return <section className="form-image-position" aria-label="Image focal point">
  <div className="form-focal-heading"><h3>Image focal point</h3><WorkspaceButton variant="ghost" size="small" disabled={point.x===50&&point.y===50} onClick={()=>onChange('center')}>Reset</WorkspaceButton></div>
  <p className="form-help" id={helpId}>{fit==='contain'?'The whole image is visible. Adjust its alignment within the frame.':'Click or drag the point onto the part of the photo you want to keep in view.'}</p>
  {!failed?<button type="button" className="form-focal-canvas" aria-label="Position image focal point" aria-describedby={helpId} style={{aspectRatio:ratio,width:`min(100%, ${240*ratio}px)`}} onKeyDown={keyboard} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);position(event);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))position(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
   <img src={src} alt="" draggable="false" onLoad={event=>setRatio(event.currentTarget.naturalWidth/event.currentTarget.naturalHeight||1.5)} onError={()=>setFailed(true)}/>
   <span className="form-focal-marker" style={{left:point.x+'%',top:point.y+'%'}} aria-hidden="true"/>
  </button>:<p className="form-help" role="status">Image could not load. Check the image URL, or use the controls below.</p>}
  <div className="form-focal-sliders">{[['x','Horizontal'],['y','Vertical']].map(([axis,label])=><label key={axis}><span>{label}<output>{point[axis]}%</output></span><input type="range" aria-label={label+' image position'} min="0" max="100" step="1" value={point[axis]} onChange={event=>change({...point,[axis]:Number(event.target.value)})}/></label>)}</div>
  <p className="form-help">Check the crop in Desktop and Phone previews. Arrow keys fine-tune the point; hold Shift for larger steps.</p>
 </section>;
}
