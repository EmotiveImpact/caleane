import React,{useLayoutEffect,useRef,useState} from 'react';

// Preview the chosen device independently of the editor panel's available width.
export function FormPreview({device='desktop',children}){
 const host=useRef(null),[available,setAvailable]=useState({width:0,height:0});
 useLayoutEffect(()=>{
  const element=host.current;
  const measure=()=>setAvailable({width:element.clientWidth,height:element.clientHeight});
  measure();
  const observer=new ResizeObserver(measure);observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 const width=device==='phone'?390:Math.max(800,available.width),scale=available.width?Math.min(1,available.width/width,available.height?available.height/600:1):1;
 return <div className="forms-preview-viewport" ref={host}><div className="form-preview-scale" style={{width,height:600,overflow:'auto',zoom:scale}}>{children}</div></div>;
}
