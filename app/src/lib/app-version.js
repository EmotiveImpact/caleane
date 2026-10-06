// A tab opened before a deploy keeps running the old bundle. Watch the served
// page for a new entry script and reload at the next in-app navigation, so
// visitors see new releases without losing unsaved work.
export const entryScript=html=>html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/)?.[1]||'';

export function watchForNewVersion({current=document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')||'',every=5*60_000}={}){
 if(!current)return;
 let stale=false;
 const check=async()=>{
  if(stale||document.visibilityState!=='visible')return;
  try{const served=entryScript(await (await fetch('/',{cache:'no-store',headers:{Accept:'text/html'}})).text());if(served&&served!==current)stale=true;}catch{}
 };
 setInterval(check,every);
 document.addEventListener('visibilitychange',check);
 window.addEventListener('caleane:before-navigate',event=>{if(stale)setTimeout(()=>{if(!event.defaultPrevented)location.reload();});});
 // A lazy screen from the old deploy is gone: load the new release instead.
 window.addEventListener('vite:preloadError',event=>{try{if(sessionStorage.getItem('caleane-reloaded')===current)return;sessionStorage.setItem('caleane-reloaded',current);}catch{}event.preventDefault();location.reload();});
}
