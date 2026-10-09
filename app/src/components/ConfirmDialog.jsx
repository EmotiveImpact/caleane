import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {WorkspaceButton} from './workspace/WorkspaceUI';

// One confirmation pattern for actions that cannot be undone or that lose work.
// Same look as WorkspaceConfirm, with a chosen tone and wording for both buttons.
export function ConfirmDialog({open,title,description,confirmLabel='Continue',cancelLabel='Cancel',tone='danger',onConfirm,onCancel}){
 const previous=useRef(null);
 return <AlertDialog.Root open={open} onOpenChange={next=>{if(!next)onCancel?.();}}><AlertDialog.Portal><AlertDialog.Overlay className="ws-dialog-scrim ws-confirm-scrim"/><AlertDialog.Content className="ws-dialog ws-confirm" onOpenAutoFocus={()=>{previous.current=document.activeElement;}} onCloseAutoFocus={event=>{event.preventDefault();if(previous.current?.isConnected)previous.current.focus();}}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description><div className="ws-confirm-actions"><AlertDialog.Cancel asChild><WorkspaceButton variant="secondary">{cancelLabel}</WorkspaceButton></AlertDialog.Cancel><AlertDialog.Action asChild><WorkspaceButton variant={tone==='danger'?'danger':'primary'} onClick={onConfirm}>{confirmLabel}</WorkspaceButton></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}

// const [confirm,confirmation]=useConfirm(); render {confirmation}; then
// if(!await confirm({title,description,confirmLabel}))return;
export function useConfirm(){
 const [request,setRequest]=useState(null),[open,setOpen]=useState(false),resolver=useRef(null);
 const settle=useCallback(value=>{const resolve=resolver.current;resolver.current=null;setOpen(false);resolve?.(value);},[]);
 const confirm=useCallback(options=>new Promise(resolve=>{resolver.current?.(false);resolver.current=resolve;setRequest(options);setOpen(true);}),[]);
 useEffect(()=>()=>{resolver.current?.(false);resolver.current=null;},[]);
 return [confirm,<ConfirmDialog key="confirm" open={open} {...(request||{})} onConfirm={()=>settle(true)} onCancel={()=>settle(false)}/>];
}
