// One shared check for new messages per studio. Every open view subscribes to it instead of
// fetching the whole conversation list on its own timer, and an unchanged list is not downloaded.
export const CONVERSATION_CHECK_MS=12000;
const feeds=new Map();

function check(studioId,feed){
 if(feed.pending)return feed.pending;
 const tokens=new Map([...feed.subscribers].map(sub=>[sub,sub.start?.()]));
 const since=feed.list&&feed.tag?'&since='+encodeURIComponent(feed.tag):'';
 feed.pending=feed.request('/api/conversations?studio='+studioId+since).then(data=>{
  if(!data.unchanged)feed.list=data.conversations;
  feed.tag=data.tag||'';
  for(const sub of feed.subscribers)if(!data.unchanged||!tokens.has(sub))sub.data(feed.list,tokens.has(sub)?tokens.get(sub):sub.start?.());
 }).catch(error=>{for(const sub of feed.subscribers)sub.error?.(error);}).finally(()=>{feed.pending=null;for(const sub of feed.subscribers)sub.done?.();});
 return feed.pending;
}

function onFocus(){for(const [studioId,feed] of feeds)check(studioId,feed);}

// subscriber: {data(list,token), start?() -> token, error?(e), done?()}. The token lets a view ignore
// a list that was requested before its own latest save. Returns an unsubscribe function.
export function watchConversations(studioId,request,subscriber){
 let feed=feeds.get(studioId);
 if(!feed){
  feed={subscribers:new Set(),list:null,tag:'',pending:null,request};feeds.set(studioId,feed);
  feed.timer=setInterval(()=>{if(document.visibilityState==='visible')check(studioId,feed);},CONVERSATION_CHECK_MS);
  if(feeds.size===1)window.addEventListener('focus',onFocus);
 }
 feed.request=request;feed.subscribers.add(subscriber);
 if(feed.list&&!feed.pending){subscriber.data(feed.list,subscriber.start?.());subscriber.done?.();}
 check(studioId,feed);
 return()=>{feed.subscribers.delete(subscriber);if(!feed.subscribers.size){clearInterval(feed.timer);feeds.delete(studioId);if(!feeds.size)window.removeEventListener('focus',onFocus);}};
}

// Ask now, for example right after this view changed something.
export function checkConversations(studioId){const feed=feeds.get(studioId);return feed?check(studioId,feed):Promise.resolve();}
