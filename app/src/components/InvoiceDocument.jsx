import React,{useEffect,useRef,useState} from 'react';

const PAGE_WIDTH=794,PAGE_HEIGHT=1123;

// Shows a styled invoice page, scaled down to fit its container. The page is
// rendered in a sandboxed frame (no scripts) so its styles never leak into the
// app. Long invoices grow past one A4 page. On a phone a whole A4 page would
// shrink to unreadable text, so there it opens reflowed to the screen's width,
// with the A4 page one tap away.
export const NARROW_INVOICE='(max-width: 720px)';
const narrow=()=>typeof window!=='undefined'&&!!window.matchMedia?.(NARROW_INVOICE).matches;
export function InvoicePreview({html,title='Invoice preview',maxScale=1}){
 const box=useRef(null),frame=useRef(null),[phone]=useState(narrow),[readable,setReadable]=useState(phone),[width,setWidth]=useState(PAGE_WIDTH),[height,setHeight]=useState(PAGE_HEIGHT);
 const scale=readable?1:Math.min(maxScale,width/PAGE_WIDTH),frameWidth=readable?width:PAGE_WIDTH;
 useEffect(()=>{const el=box.current;if(!el)return;const fit=()=>setWidth(el.clientWidth||PAGE_WIDTH);fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[]);
 // A reflowed page is as tall as its content; an A4 page is at least one sheet.
 function measure(){const doc=frame.current?.contentDocument;if(!doc?.body)return;const update=()=>{const page=doc.querySelector('.page');setHeight(readable&&page?Math.ceil(page.getBoundingClientRect().height):Math.max(PAGE_HEIGHT,doc.documentElement.scrollHeight));};update();doc.fonts?.ready.then(update).catch(()=>{});[...doc.images].forEach(image=>image.addEventListener('load',update,{once:true}));}
 // The frame's load event waits for web fonts, so measure as soon as the
 // content is parsed as well, and again whenever the width or view changes.
 useEffect(()=>{let tries=0;const timer=setInterval(()=>{const doc=frame.current?.contentDocument;if(doc?.body&&doc.readyState!=='loading'&&doc.URL==='about:srcdoc'){measure();}if(++tries>12)clearInterval(timer);},250);return()=>clearInterval(timer);},[html,readable,frameWidth]);
 return <>
  {phone&&<div className="invoice-preview-view" role="group" aria-label="Invoice view"><span>{readable?'Fitted to your screen':'A4 page'}</span><button type="button" aria-pressed={readable} onClick={()=>setReadable(true)}>Readable</button><button type="button" aria-pressed={!readable} onClick={()=>setReadable(false)}>A4 page</button></div>}
  <div className={`invoice-preview${readable?' is-readable':''}`} ref={box} style={{height:height*scale}}>
   <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin" tabIndex={-1} onLoad={measure} style={{width:frameWidth,height,transform:scale===1?undefined:`scale(${scale})`}}/>
  </div>
 </>;
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
