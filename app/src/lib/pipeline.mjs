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
