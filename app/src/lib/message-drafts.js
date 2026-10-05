// Unsent messages survive switching conversations or project tabs, and a reload
// in the same browser tab. They never leave this browser.
const drafts=new Map(),key=id=>'caleane-draft:'+id;
export function loadDraft(id){if(drafts.has(id))return drafts.get(id);try{return sessionStorage.getItem(key(id))||'';}catch{return '';}}
export function saveDraft(id,text){if(text)drafts.set(id,text);else drafts.delete(id);try{if(text)sessionStorage.setItem(key(id),text);else sessionStorage.removeItem(key(id));}catch{}}
