import React,{useEffect,useRef,useState} from 'react';
import {Stage,Layer,Group,Rect,Image as CanvasImage,Text,Transformer} from 'react-konva';
import {mediaFor} from '../lib/studio-view';
import {constrainPosition,zoomCamera} from '../lib/reference-board';

function Tile({reference,p,studio,pos,selected,editable,onSelect,onChange,onOpen}){
 const node=useRef(null),transformer=useRef(null),[image,setImage]=useState(null),[failed,setFailed]=useState(false);
 const src=mediaFor(p,studio,reference),font='Instrument Sans, sans-serif';
 useEffect(()=>{setImage(null);setFailed(false);if(!src)return;let active=true;const img=new window.Image();img.onload=()=>{if(active)setImage(img);};img.onerror=()=>{if(active)setFailed(true);};img.src=src;return()=>{active=false;};},[src]);
 useEffect(()=>{if(selected&&editable&&transformer.current){transformer.current.nodes([node.current]);transformer.current.getLayer().batchDraw();}},[selected,editable]);
 function commit(next){const safe=constrainPosition(next);node.current.setAttrs({...safe,scaleX:1,scaleY:1});onChange(safe);}
 const photoHeight=pos.height-64;
 let crop;if(image){const target=pos.width/photoHeight,actual=image.width/image.height;crop=actual>target?{x:(image.width-image.height*target)/2,y:0,width:image.height*target,height:image.height}:{x:0,y:(image.height-image.width/target)/2,width:image.width,height:image.width/target};}
 return <><Group ref={node} x={pos.x} y={pos.y} width={pos.width} height={pos.height} rotation={pos.rotation||0} draggable={editable} onClick={onSelect} onTap={onSelect} onDblClick={onOpen} onDblTap={onOpen} onDragStart={onSelect} onDragEnd={e=>commit({...pos,x:e.target.x(),y:e.target.y()})} onTransformEnd={()=>{const n=node.current;commit({x:n.x(),y:n.y(),width:pos.width*n.scaleX(),height:pos.height*n.scaleY(),rotation:n.rotation()});}}>
  <Rect width={pos.width} height={pos.height} fill="#fff" cornerRadius={3} shadowColor="#15232d" shadowBlur={selected?18:10} shadowOpacity={.1} shadowOffsetY={4}/>
  <Rect width={pos.width} height={photoHeight} fill={src?'#e5e8e8':'#e6e8dc'}/>
  {image?<CanvasImage image={image} crop={crop} width={pos.width} height={photoHeight}/>:<Text x={22} y={30} width={pos.width-44} height={photoHeight-44} text={src?(failed?'Image unavailable\nOpen details to view the original.':'Loading image…'):(reference.note||reference.title)} fontFamily={font} fontSize={src?14:22} fill="#34483f" lineHeight={1.4} ellipsis/>}
  <Text x={15} y={photoHeight+12} width={pos.width-30} text={(reference.category||(reference.mime==='application/pdf'?'Document':reference.url?'Link':src?'Image':'Note')).toUpperCase()} fontFamily={font} fontSize={9} letterSpacing={1} fill="#657177"/>
  <Text x={15} y={photoHeight+30} width={pos.width-30} text={reference.title} fontSize={14} fontFamily={font} fill="#202326" ellipsis wrap="none"/>
 </Group>{selected&&editable&&<Transformer ref={transformer} rotateEnabled flipEnabled={false} ignoreStroke padding={2} borderStroke="#344e5b" anchorStroke="#344e5b" anchorFill="#fff" anchorSize={9} anchorCornerRadius={2} rotationSnaps={[0,90,180,270]} rotationSnapTolerance={4} boundBoxFunc={(old,next)=>Math.abs(next.width)<20||Math.abs(next.height)<20?old:next}/>}</>;
}
export function ReferenceCanvas({p,studio,items,positions,selected,setSelected,change,editable,size,camera,setCamera,tool,onOpen}){
 const stage=useRef(null),pan=tool==='pan';
 return <Stage ref={stage} width={size.width} height={size.height} x={camera.x} y={camera.y} scaleX={camera.scale} scaleY={camera.scale} draggable={pan}
  onDragEnd={e=>{if(e.target===stage.current)setCamera({...camera,x:e.target.x(),y:e.target.y()});}}
  onWheel={e=>{if(e.evt.ctrlKey||e.evt.metaKey){e.evt.preventDefault();const pointer=stage.current.getPointerPosition();setCamera(zoomCamera(camera,camera.scale*Math.exp(-e.evt.deltaY*.01),pointer));}else if(pan){e.evt.preventDefault();setCamera({...camera,x:camera.x-e.evt.deltaX,y:camera.y-e.evt.deltaY});}}}
  onMouseDown={e=>{if(!pan&&e.target===e.target.getStage())setSelected(null);}}
  onTouchStart={e=>{if(!pan&&e.target===e.target.getStage())setSelected(null);}}>
  <Layer>{items.map(ref=><Tile key={ref.id} reference={ref} p={p} studio={studio} pos={positions[ref.id]} editable={editable&&!pan} selected={selected===ref.id} onSelect={()=>{if(!pan)setSelected(ref.id);}} onOpen={()=>{if(!pan)onOpen(ref.id);}} onChange={next=>change(ref.id,next)}/>)}</Layer>
 </Stage>;
}
