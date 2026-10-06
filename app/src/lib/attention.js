// Derived from persisted workflow state, never from invented dashboard metrics.
import {formatDay} from './dates.js';
export function attentionFor(project,owner){
 const items=[];
 const add=(kind,label,tab,detail)=>items.push({id:project.id+kind,project,kind,label,tab,detail});
 const invoice=project.latestInvoice;
 if(invoice&&['Issued','Partially paid'].includes(invoice.status))add('invoice',owner?'Follow up on invoice':'Review your invoice','Billing',`${invoice.number}${invoice.dueDate?' · Due '+formatDay(invoice.dueDate):''}`);
 if(['Complete','Archived'].includes(project.status))return items;
 const proposal=project.proposals?.at(-1);
 if(proposal?.status==='Awaiting response'){
  const needsUpdate=proposal.briefRevision!==project.briefRevision||proposal.expiresOn<new Date().toISOString().slice(0,10);
  if(owner&&needsUpdate)add('proposal-update','Update the proposal','Proposal','The brief changed or the reply date passed.');
  if(!owner&&!needsUpdate&&project.accessRole==='Approver')add('proposal','Review your proposal','Proposal',proposal.title);
 }
 if(owner&&proposal?.status==='Changes requested')add('proposal-change','Review proposal feedback','Proposal',proposal.feedback);
 if(owner&&project.changeRequests.some(c=>c.status==='Pending'))add('brief','Review brief changes','Brief','An agreed brief has a proposed update.');
 if(!owner)for(const choice of project.decisions||[]){if(choice.status==='Awaiting choice'&&choice.briefRevision===project.briefRevision)add('choice-'+choice.id,choice.title,'Decisions','Choose the direction you prefer.');}
 if(project.unreadMessages>0)add('message',`${project.unreadMessages} unread message${project.unreadMessages===1?'':'s'}`,'Conversation','Pick up the conversation.');
 for(const task of project.tasks||[]){if(!task.completed&&task.assignee===(owner?'studio':'client'))add('task-'+task.id,task.title,'Plan',task.due?'Due '+formatDay(task.due):'A shared project task.');}
 const quote=project.estimates?.at(-1);if(!owner&&quote?.status==='Awaiting review'&&quote.briefRevision===project.briefRevision)add('estimate','Review your estimate','Estimate',quote.title);if(owner&&quote?.status==='Changes requested')add('estimate-change','Review estimate feedback','Estimate',quote.feedback);
 const latest=project.designs.at(-1);
 if(owner&&latest?.status==='Changes requested')add('feedback','Revise the design','Designs',latest.feedback);
 if(latest?.status==='Awaiting approval'&&latest.briefRevision!==project.briefRevision){if(owner)add('stale','Update the design','Designs','The brief changed after this version was shared.');}
 else if(!owner&&latest?.status==='Awaiting approval')add('approval','Your design is ready to review','Designs',latest.title);
 if(owner&&project.status==='Enquiry'&&!project.enquiryReviewedAt)add('enquiry','Review new enquiry','Brief',project.brief.occasion);
 if(owner&&latest?.comments?.some(c=>!c.resolved&&c.role==='client'))add('comment','Review design comments','Designs','Feedback is pinned to the design version.');
 return items;
}
