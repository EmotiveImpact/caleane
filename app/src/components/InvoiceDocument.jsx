import React,{useEffect,useRef,useState} from 'react';

const PAGE_WIDTH=794,PAGE_HEIGHT=1123;

// Shows a styled invoice page, scaled down to fit its container. The page is
// rendered in a sandboxed frame (no scripts) so its styles never leak into the
// app. Long invoices grow past one A4 page.
export function InvoicePreview({html,title='Invoice preview',maxScale=1}){
 const box=useRef(null),frame=useRef(null),[scale,setScale]=useState(.6),[height,setHeight]=useState(PAGE_HEIGHT);
 useEffect(()=>{const el=box.current;if(!el)return;const fit=()=>setScale(Math.min(maxScale,el.clientWidth/PAGE_WIDTH));fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[maxScale]);
 function measure(){const doc=frame.current?.contentDocument;if(!doc?.body)return;const update=()=>setHeight(Math.max(PAGE_HEIGHT,doc.documentElement.scrollHeight));update();doc.fonts?.ready.then(update).catch(()=>{});[...doc.images].forEach(image=>image.addEventListener('load',update,{once:true}));}
 // The frame's load event waits for web fonts, so measure as soon as the
 // content is parsed as well.
 useEffect(()=>{let tries=0;const timer=setInterval(()=>{const doc=frame.current?.contentDocument;if(doc?.body&&doc.readyState!=='loading'&&doc.URL==='about:srcdoc'){measure();}if(++tries>12)clearInterval(timer);},250);return()=>clearInterval(timer);},[html]);
 return <div className="invoice-preview" ref={box} style={{height:height*scale}}>
  <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin" tabIndex={-1} onLoad={measure} style={{width:PAGE_WIDTH,height,transform:`scale(${scale})`}}/>
 </div>;
}

// Opens the browser print dialog for the styled page; "Save as PDF" gives the
// client and studio the same design they see on screen.
export function printInvoice(html){
 const frame=document.createElement('iframe');frame.title='Invoice print preview';frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.appendChild(frame);
 const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();
 const go=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
 // Wait for stylesheets, images and web fonts so the PDF wears the brand.
 const loaded=doc.readyState==='complete'?Promise.resolve():new Promise(resolve=>frame.contentWindow.addEventListener('load',resolve,{once:true}));
 const ready=loaded.then(()=>doc.fonts?.ready);
 Promise.race([ready,new Promise(resolve=>setTimeout(resolve,4000))]).then(go,go);
}
