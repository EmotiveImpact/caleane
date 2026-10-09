export const PIPELINE_STAGES=['Discovery','Qualified','Proposal','Negotiation','Won','Lost'];
export const ACTIVE_PIPELINE_STAGES=PIPELINE_STAGES.slice(0,4);
export const isOpenEnquiry=o=>!['Won','Lost'].includes(o.stage);
export function stageLabelsFor(studio){
 const profession=studio?.branding?.profession;
 const quote=['floral-design','balloon-styling','bespoke-making'].includes(profession);
 return {Discovery:'New enquiry',Qualified:profession==='interior-design'?'Consultation':'Discussing the brief',Proposal:quote?'Preparing quote':'Preparing proposal',Negotiation:'Awaiting decision',Won:'Confirmed',Lost:'Not proceeding'};
}
export function nextStepFor(opportunity,tasks){return tasks.filter(t=>t.opportunityId===opportunity.id&&!t.completed).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title))[0];}
export function attentionFor(opportunity,tasks,today){
 if(!isOpenEnquiry(opportunity))return null;
 if(opportunity.needsReview)return {kind:'review',label:'Review enquiry',rank:-1,task:null};
 const task=nextStepFor(opportunity,tasks);
 if(!task)return {kind:'missing',label:'Set a next step',rank:3,task:null};
 if(!task.dueDate)return {kind:'undated',label:'Choose a follow-up date',rank:2,task};
 if(task.dueDate<today)return {kind:'overdue',label:'Overdue follow-up',rank:0,task};
 if(task.dueDate===today)return {kind:'today',label:'Due today',rank:1,task};
 return null;
}
export function sortByAttention(opportunities,tasks,today){return [...opportunities].sort((a,b)=>{
 const left=attentionFor(a,tasks,today),right=attentionFor(b,tasks,today);
 return (left?.rank??4)-(right?.rank??4)||(left?.task?.dueDate||'9999').localeCompare(right?.task?.dueDate||'9999')||a.title.localeCompare(b.title);
});}
export function opportunityTotals(opportunities){return Object.entries(opportunities.filter(isOpenEnquiry).filter(o=>o.amountMinor>0).reduce((result,o)=>{result[o.currency]=(result[o.currency]||0)+o.amountMinor;return result;},{}));}

// Why work is lost, from a short fixed list so "Budget" and "over budget" count together.
// A reason is stored as the choice, or "Choice: note" when the studio adds a note.
export const LOST_REASONS=['Budget','Dates not available','Chose someone else','No reply','Plans changed','Other'];
const LOST_WORDS=[['Budget',/budget|price|cost|expensive|afford|money|quote too/],['Dates not available',/\bdates?\b|availab|booked|clash/],['Chose someone else',/another|someone else|competitor|went with|chose|cheaper/],['No reply',/no (reply|response|answer)|ghost|went quiet|silence|never (heard|replied)|unresponsive/],['Plans changed',/cancel|postpon|called off|changed|not going ahead|scaled back/]];
export function splitLostReason(text){
 const value=String(text||'').trimStart(),match=LOST_REASONS.find(r=>value.trimEnd().toLowerCase()===r.toLowerCase()||value.toLowerCase().startsWith(r.toLowerCase()+':'));
 return match?{reason:match,note:value.slice(match.length+1).replace(/^ /,'')}:{reason:value.trim()?'Other':'',note:value};
}
// The note keeps its spaces while it is typed; the server trims the saved reason.
export const joinLostReason=(reason,note)=>String(note||'').trim()?`${reason}: ${note}`:reason;
// Older reasons were free text, so they are matched to the list by their words.
export function lostReasonGroup(text){
 const value=String(text||'').trim();if(!value)return 'No reason recorded';
 const {reason}=splitLostReason(value);if(reason!=='Other'||/^other\b/i.test(value))return reason;
 return LOST_WORDS.find(([,words])=>words.test(value.toLowerCase()))?.[0]||'Other';
}
