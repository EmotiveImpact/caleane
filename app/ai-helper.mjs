// The quiet helper: drafts a reply, a project recap or a follow-up for the studio owner.
// It only ever returns text. Nothing is sent, posted or saved until the owner does it themselves.
// Off unless ANTHROPIC_API_KEY is set; CALEANE_AI_MODEL overrides the model.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const AI_MODEL='claude-opus-5-5';
const KINDS=['reply','recap','follow-up'];
const plain=text=>String(text||'').replace(/<br\s*\/?>|<\/p>|<\/li>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
const clip=(text,max)=>text.length>max?text.slice(0,max)+'…':text;
const day=at=>at?new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'';
const money=(minor,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((minor||0)/100);

const VOICE=`You write for a small creative studio using Caleane, a workspace for creatives and their clients.
Write in British English. Never use em dashes. Keep it warm, plain and specific, the way a considered studio owner writes, not a marketing team.
Match the studio's own voice from any of their earlier messages you are shown.
Only use facts that appear in the material provided. Never invent dates, prices, names or promises; if something is unknown, leave it out or ask the client.
Reply with the finished text only: no preamble, no notes to the studio, no subject line, no placeholders in square brackets.`;
const TASKS={
 reply:'Draft the studio\'s next reply in this conversation, answering what the client most recently said or asked. Keep it short enough to read on a phone. Sign off with the studio name only if the studio usually does.',
 recap:'Write a one-paragraph recap of where this project stands, for the studio owner to read just before a call with the client. Cover what has been agreed, what is waiting and on whom, and anything the client recently raised. Plain prose, no lists, no headings, under 150 words.',
 'follow-up':'Draft a short, friendly follow-up message to a lead who has gone quiet. Gently pick up where things left off, make it easy to reply, and do not pressure them. Under 90 words.'
};

// Messages are read from the database, never from the browser, so a draft can only draw on what the owner can already see.
function conversationLines(db,conversationId,limit=30){
 return db.prepare('SELECT author_name,role,text,created_at FROM conversation_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT ?').all(conversationId,limit).reverse()
  .map(m=>`[${day(m.created_at)}] ${m.author_name} (${m.role==='client'?'client':'studio'}): ${clip(plain(m.text),1200)}`).filter(line=>!line.endsWith(': '));
}
function projectFacts(db,studioId,projectId){
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);if(!row)return null;
 const p=JSON.parse(row.data),b=p.brief||{},lines=[`Project: ${p.title}`,`Status: ${p.status}`];
 if(b.name)lines.push('Client: '+b.name);if(b.occasion)lines.push('Kind of work: '+b.occasion);if(b.date)lines.push('Date: '+day(b.date));if(b.venue)lines.push('Place: '+b.venue);if(b.vision)lines.push('Brief: '+clip(plain(b.vision),800));
 const design=(p.designs||[]).at(-1);if(design)lines.push(`Latest design: version ${design.version}, "${design.title}", ${design.status}`);
 for(const d of (p.decisions||[]).slice(-3))lines.push(`Decision "${d.title}": ${d.status}${d.note?', client note: '+clip(plain(d.note),300):''}`);
 const tasks=p.tasks||[],open=tasks.filter(t=>!t.completed);if(tasks.length)lines.push(`Plan: ${tasks.length-open.length} of ${tasks.length} steps done.`+(open.length?' Next: '+open.slice(0,4).map(t=>t.title+(t.due?' (due '+day(t.due)+')':'')+(t.assignee==='client'?' with the client':'')).join('; '):''));
 if(!p.moneyHidden){const est=(p.estimates||[]).at(-1),prop=(p.proposals||[]).at(-1);if(est)lines.push(`Estimate: "${est.title}", ${est.status}`);if(prop)lines.push(`Proposal: "${prop.title}", ${prop.status}`);}
 const activity=(p.activity||[]).slice(-6).map(a=>`${day(a.at)}: ${a.text||a.title||''}`).filter(a=>!a.endsWith(': '));if(activity.length)lines.push('Recent activity:\n'+activity.join('\n'));
 return {p,text:lines.join('\n')};
}
function gatherReply(db,studio,body){
 const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(String(body.conversationId||''),studio.id);if(!c)fail(404,'Conversation not found.');
 const lines=conversationLines(db,c.id);if(!lines.length)fail(400,'There is nothing in this conversation to reply to yet.');
 const project=c.project_id?projectFacts(db,studio.id,c.project_id):null;
 return {basedOn:`the last ${lines.length} message${lines.length===1?'':'s'}`,material:[`Studio: ${studio.name}`,`Conversation: ${c.subject}`,project?.text,'Conversation so far, oldest first:\n'+lines.join('\n')].filter(Boolean).join('\n\n')};
}
function gatherRecap(db,studio,body){
 const project=projectFacts(db,studio.id,String(body.projectId||''));if(!project)fail(404,'Project not found.');
 const c=db.prepare('SELECT id FROM conversations WHERE project_id=? AND studio_id=?').get(project.p.id,studio.id),lines=c?conversationLines(db,c.id,20):[];
 return {basedOn:'the brief, plan, decisions'+(lines.length?' and recent messages':''),material:[`Studio: ${studio.name}`,project.text,lines.length?'Recent messages, oldest first:\n'+lines.join('\n'):''].filter(Boolean).join('\n\n')};
}
function gatherFollowUp(db,studio,body){
 const o=db.prepare('SELECT o.*,c.name AS client_name FROM crm_opportunities o JOIN clients c ON c.id=o.client_id AND c.studio_id=o.studio_id WHERE o.id=? AND o.studio_id=?').get(String(body.opportunityId||''),studio.id);if(!o)fail(404,'Enquiry not found.');
 if(o.stage==='Won'||o.stage==='Lost')fail(400,'This enquiry is closed, so there is nothing to follow up.');
 const lines=[`Studio: ${studio.name}`,`Lead: ${o.client_name}`,`Enquiry: ${o.title}`,`Stage: ${o.stage}`];if(o.description)lines.push('Notes: '+clip(plain(o.description),800));if(o.amount_minor)lines.push('Value discussed: '+money(o.amount_minor,o.currency));
 const activity=db.prepare('SELECT title,detail,created_at FROM crm_activities WHERE studio_id=? AND opportunity_id=? ORDER BY created_at DESC LIMIT 6').all(studio.id,o.id).reverse().map(a=>`${day(a.created_at)}: ${a.title}${a.detail?', '+clip(plain(a.detail),200):''}`);if(activity.length)lines.push('Recent activity:\n'+activity.join('\n'));
 const project=o.project_id?projectFacts(db,studio.id,o.project_id):null,c=o.project_id?db.prepare('SELECT id FROM conversations WHERE project_id=? AND studio_id=?').get(o.project_id,studio.id):null,messages=c?conversationLines(db,c.id,12):[];
 if(project)lines.push(project.text);if(messages.length)lines.push('Messages so far, oldest first:\n'+messages.join('\n'));
 return {basedOn:'the enquiry'+(messages.length?' and its messages':''),material:lines.join('\n\n')};
}
const GATHER={reply:gatherReply,recap:gatherRecap,'follow-up':gatherFollowUp};

// The client is created lazily so the server starts without the SDK being loaded when the helper is off.
export function createAssistant({apiKey=process.env.ANTHROPIC_API_KEY||'',model=process.env.CALEANE_AI_MODEL||AI_MODEL,client=null}={}){
 if(!client&&!apiKey)return null;
 let sdk=client;
 return {model,async write(kind,material){
  if(!sdk){const {default:Anthropic}=await import('@anthropic-ai/sdk');sdk=new Anthropic({apiKey,maxRetries:1,timeout:60000});}
  const response=await sdk.beta.messages.create({model,max_tokens:16000,output_config:{effort:'medium'},
   // Server-side fallback lets another model finish the draft if this one declines.
   betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
   system:VOICE,messages:[{role:'user',content:`${TASKS[kind]}\n\n<material>\n${material}\n</material>`}]});
  if(response.stop_reason==='refusal')fail(422,'The helper could not draft this one. Try writing it yourself.');
  const text=response.content.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  if(!text)fail(502,'The helper came back empty. Try again in a moment.');
  return text;
 }};
}
export const tidyDraft=text=>text.replace(/\s*—\s*/g,', ').replace(/–/g,'-').trim();

export async function handleAssistant({db,req,route,body,studio,owner,reply,assistant,rate}){
 if(route!=='/api/assistant')return false;
 if(req.method==='GET')return reply(200,{enabled:!!assistant&&owner}),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(!owner)fail(403,'Only the studio can use the helper.');
 if(!assistant)fail(503,'The helper is off. Add an Anthropic API key to turn it on.');
 const kind=body.kind;if(!KINDS.includes(kind))fail(400,'Choose a reply, a recap or a follow-up.');
 rate?.(req,'assistant',20);
 const {material,basedOn}=GATHER[kind](db,studio,body);
 let text;try{text=await assistant.write(kind,material);}catch(e){if(e.status&&e.status<500&&e.message&&!e.headers)throw e;console.error('Quiet helper request failed',e.status||'',e.message);fail(502,'The helper could not be reached. Try again in a moment.');}
 reply(200,{draft:{kind,text:tidyDraft(text),basedOn}});return true;
}
