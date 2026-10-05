import React,{useEffect,useRef,useState} from 'react';

const PAGE_WIDTH=794,PAGE_HEIGHT=1123;

// Shows a styled invoice page, scaled down to fit its container. The page is
// rendered in a sandboxed frame so its print styles never leak into the app.
export function InvoicePreview({html,title='Invoice preview',maxScale=1}){
 const box=useRef(null),[scale,setScale]=useState(.6);
 useEffect(()=>{const el=box.current;if(!el)return;const fit=()=>setScale(Math.min(maxScale,el.clientWidth/PAGE_WIDTH));fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[maxScale]);
 return <div className="invoice-preview" ref={box} style={{height:PAGE_HEIGHT*scale}}>
  <iframe title={title} srcDoc={html} sandbox="allow-same-origin" tabIndex={-1} style={{width:PAGE_WIDTH,height:PAGE_HEIGHT,transform:`scale(${scale})`}}/>
 </div>;
}

// Opens the browser print dialog for the styled page; "Save as PDF" gives the
// client and studio the same design they see on screen.
export function printInvoice(html){
 const frame=document.createElement('iframe');frame.title='Invoice print preview';frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.appendChild(frame);
 const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();
 const go=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
 const images=[...doc.images].filter(image=>!image.complete);
 if(!images.length)return go();
 let left=images.length;const done=()=>{if(--left===0)go();};images.forEach(image=>{image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});});
}
