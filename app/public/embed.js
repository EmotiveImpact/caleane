(()=>{
 const script=document.currentScript;if(!script||script.dataset.caleaneMounted)return;script.dataset.caleaneMounted='true';
 const base=new URL(script.src).origin,slug=script.dataset.studio,form=script.dataset.form;
 if(!slug||!/^[a-z0-9-]+$/.test(slug)||form&&!/^[a-z0-9-]+$/.test(form))return;
 const path='/intake/'+encodeURIComponent(slug)+(form?'/'+encodeURIComponent(form):''),mode=script.dataset.mode||'popup',label=script.dataset.label||'Plan your project',color=/^#[0-9a-f]{6}$/i.test(script.dataset.color||'')?script.dataset.color:'#202326';
 const container=document.createElement('div');container.dataset.caleaneWidget=slug;if(script.parentElement===document.head)document.body.append(container);else script.after(container);
 const frames=new Set();let inlineFrame,dialog,previousOverflow,previousFocus;
 function makeFrame(){const iframe=document.createElement('iframe');iframe.src=base+path+(mode==='inline'?'?embed=inline':'');iframe.title=script.dataset.title||label;iframe.style.cssText='width:100%;height:100%;border:0;display:block;background:white';iframe.referrerPolicy='strict-origin-when-cross-origin';frames.add(iframe);return iframe;}
 function message(event){if(event.origin!==base)return;const frame=[...frames].find(f=>f.contentWindow===event.source);if(!frame)return;if(event.data?.type==='caleane:resize'&&frame===inlineFrame&&Number.isFinite(event.data.height)){inlineFrame.style.height=Math.min(12000,Math.max(300,event.data.height))+'px';}if(event.data?.type==='caleane:submitted'&&typeof event.data.reference==='string'){container.dispatchEvent(new CustomEvent('caleane:submitted',{bubbles:true,detail:{studio:slug,form:form||'enquiry',reference:event.data.reference}}));}}
 window.addEventListener('message',message);
 const observer=new MutationObserver(()=>{if(!container.isConnected){window.removeEventListener('message',message);dialog?.close();dialog?.remove();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 if(mode==='inline'){container.style.cssText='width:100%;min-width:0';inlineFrame=makeFrame();inlineFrame.style.height='800px';container.append(inlineFrame);return;}
 const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText=`font:500 14px system-ui;padding:15px 24px;background:${color};color:white;border:1px solid ${color};border-radius:5px;cursor:pointer;max-width:100%;white-space:normal`;button.setAttribute('aria-haspopup','dialog');
 if(mode==='floating'){container.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483000;max-width:calc(100vw - 48px)';}
 container.append(button);
 button.addEventListener('click',()=>{if(dialog?.open)return;dialog=document.createElement('dialog');dialog.setAttribute('aria-label',label);dialog.style.cssText='padding:0;border:1px solid #dce1dc;width:min(1200px,96vw);height:92vh;max-width:none;max-height:none;background:white;border-radius:8px;overflow:hidden';
 const close=document.createElement('button');close.type='button';close.textContent='Close ×';close.setAttribute('aria-label','Close enquiry form');close.style.cssText='position:absolute;right:12px;top:10px;z-index:2;border:1px solid #dce1dc;background:white;color:#202326;padding:8px 12px;border-radius:5px;cursor:pointer;font:12px system-ui';
 close.addEventListener('click',()=>dialog.close());const frame=makeFrame();dialog.append(close,frame);document.body.append(dialog);previousOverflow=document.body.style.overflow;previousFocus=document.activeElement;document.body.style.overflow='hidden';
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;frames.delete(frame);dialog.remove();dialog=null;if(previousFocus?.isConnected)previousFocus.focus();else button.focus();},{once:true});dialog.showModal();close.focus();
 });
})();
