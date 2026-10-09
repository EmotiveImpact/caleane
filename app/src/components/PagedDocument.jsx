import React,{forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Editor,DEFAULT_FEATURES} from 'pagedly';
import 'pagedly/styles.css';
const disabled=Object.fromEntries(Object.keys(DEFAULT_FEATURES).map(key=>[key,key==='footnotes'?'off':false]));
const editable={...disabled,bold:true,italic:true,underline:true,strikethrough:true,headings:true,blockquote:true,alignment:true,bulletList:true,numberedList:true,table:true,find:true,wordCount:true,print:false};
// On a phone a whole A4 page scaled to fit leaves text a few pixels high, so read-only
// documents open as reflowed text there. The A4 pages stay one tap away, and print as before.
export const NARROW_DOCUMENT='(max-width: 720px)';
const narrow=()=>typeof window!=='undefined'&&!!window.matchMedia?.(NARROW_DOCUMENT).matches;
const TAGS=new Set(['P','BR','STRONG','B','EM','I','U','S','H1','H2','H3','H4','BLOCKQUOTE','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','SPAN','DIV','HR']);
const STYLE=/^(text-align:\s*(left|right|center|justify)|font-weight:\s*(bold|normal|[1-9]00)|font-style:\s*(italic|normal)|text-decoration:\s*(underline|line-through));?$/;
// The same allow-list the server applies to saved documents, enforced again before rendering.
export function readableHtml(html){
 const doc=new DOMParser().parseFromString(`<body>${html||''}</body>`,'text/html');
 const clean=node=>{for(const child of [...node.childNodes]){if(child.nodeType===3)continue;if(child.nodeType!==1||!TAGS.has(child.tagName)){if(child.nodeType===1&&!['SCRIPT','STYLE','IFRAME','OBJECT','TEMPLATE'].includes(child.tagName)){clean(child);child.replaceWith(...child.childNodes);}else child.remove();continue;}
  for(const attr of [...child.attributes]){const keep=attr.name==='style'?attr.value.split(';').map(x=>x.trim()).filter(x=>x&&STYLE.test(x)).join(';'):['colspan','rowspan'].includes(attr.name)&&/^\d{1,2}$/.test(attr.value)?attr.value:null;if(keep)child.setAttribute(attr.name,keep);else child.removeAttribute(attr.name);}
  clean(child);}};
 clean(doc.body);return doc.body.innerHTML;
}
const PagedDocument=forwardRef(function PagedDocument({html,onChange,readOnly=false},ref){const editor=useRef(null),host=useRef(null),[width,setWidth]=useState(794),[fit,setFit]=useState(true),[reflow,setReflow]=useState(()=>readOnly&&narrow()),readable=useMemo(()=>reflow?readableHtml(html):'',[reflow,html]);useImperativeHandle(ref,()=>({flush:async()=>{if(!editor.current)throw new Error('The document editor is still loading. Please try again.');const latest=await editor.current.flush();onChange?.(latest);return latest;}}),[onChange]);useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(host.current);return()=>observer.disconnect();},[]);return <div ref={host} className={`caleane-paged-document${reflow?' is-reflowed':''}`} style={{'--doc-scale':fit?Math.min(1,Math.max(0.2,(width-32)/794)):1}}><div className="doc-zoom" role="group" aria-label="Document view"><span>{reflow?'Readable text':'A4 document'}</span>{readOnly&&<><button type="button" aria-pressed={reflow} onClick={()=>setReflow(true)}>Text</button><button type="button" aria-pressed={!reflow} onClick={()=>setReflow(false)}>A4 pages</button></>}{!reflow&&<><button type="button" aria-pressed={fit} onClick={()=>setFit(true)}>Fit page</button><button type="button" aria-pressed={!fit} onClick={()=>setFit(false)}>100%</button></>}</div>{reflow?<article className="doc-reflow" dangerouslySetInnerHTML={{__html:readable}}/>:<Editor ref={editor} html={html} onChange={onChange} readOnly={readOnly} toolbar={!readOnly} features={readOnly?{...disabled,print:true,find:true}:editable} pageSize="A4" pageMargin="20mm" showPageNumbers pasteFormatting="clean"/>}</div>;});
export default PagedDocument;
