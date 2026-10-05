// Shared jsdom set-up for screen tests that exercise components with a fake request function.
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

export function setupDom(url='http://localhost/'){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url,pretendToBeVisual:true});
 for(const name of ['window','document','navigator','location','history','sessionStorage','localStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','HTMLAnchorElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData','Blob','URL'])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?dom.window:dom.window[name]});
 globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
 globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
 globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.matchMedia=dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType=props.pointerType||'mouse';this.isPrimary=true;}}
 globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
 globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
 return dom;
}

// Bundle app components (CSS omitted, packages external) and import the result.
export async function bundle(contents,tag){
 const compiled=fileURLToPath(new URL(`.${tag}-${process.pid}.mjs`,import.meta.url));
 const output=await build({stdin:{contents,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
 await writeFile(compiled,output.outputFiles[0].text);
 return {module:await import(pathToFileURL(compiled)),remove:()=>unlink(compiled)};
}
