// Merge fields for contracts: {client_name} and friends are filled from the
// project, its price and the studio when a draft is saved. A value the studio
// has not recorded yet becomes a [square-bracket gap], and nothing with a gap
// left in it can be sent to a client.
export const MERGE_FIELDS=[['client_name','Client name'],['project_name','Project name'],['event_date','Event or service date'],['venue','Venue'],['total','Total fee'],['deposit_amount','Deposit amount'],['deposit_percentage','Deposit percentage'],['studio_name','Studio name']];
// The venue is optional, so an unknown venue reads naturally instead of blocking.
const GAPS={client_name:'[client name]',project_name:'[project name]',event_date:'[event date]',venue:'the venue agreed in the project space',total:'[total fee]',deposit_amount:'[deposit amount]',deposit_percentage:'[deposit percentage]',studio_name:'[studio name]'};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function fillMergeFields(html,values={},{escape=true}={}){return String(html??'').replace(/\{([a-z_]+)\}/g,(match,key)=>key in GAPS?(escape?escapeHtml:String)(values[key]||GAPS[key]):match);}
// The proposal editor used to open with this prompt as real text, so treat it as a gap too.
const PROMPTS=[['Describe the creative direction, milestones and working relationship.','[Our approach]']];
export function findPlaceholders(...texts){
 const plain=texts.map(value=>{let text=String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ');for(const [prompt,gap] of PROMPTS)text=text.replaceAll(prompt,gap);return text;}).join('\n');
 return [...new Set([...plain.matchAll(/\[[^[\]\n]{1,80}\]/g)].map(match=>match[0].replace(/\s+/g,' ')))];
}
const list=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
export function placeholderMessage(gaps,thing='this contract'){return `Fill in ${list(gaps.slice(0,6))}${gaps.length>6?` and ${gaps.length-6} more`:''} before sending ${thing}. Replace each part in square brackets with the real detail.`;}
