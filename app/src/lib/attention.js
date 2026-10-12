// Derived from persisted workflow state, never from invented dashboard metrics.
import {formatDay,todayISO} from './dates.js';
export function attentionFor(project,owner){
 const items=[];
 // at is when the item began waiting, where the record keeps it, so the bell can group by day.
 const add=(kind,label,tab,detail,at)=>items.push({id:project.id+kind,project,kind,label,tab,detail,...(at?{at}:{})});
 const invoice=project.latestInvoice;
 if(invoice&&['Issued','Partially paid'].includes(invoice.status))add('invoice',owner?'Follow up on invoice':'Review your invoice','Billing',`${invoice.number}${invoice.dueDate?' · Due '+formatDay(invoice.dueDate):''}`);
 if(['Complete','Archived'].includes(project.status))return items;
 const proposal=project.proposals?.at(-1);
 if(proposal?.status==='Awaiting response'){
  const needsUpdate=proposal.briefRevision!==project.briefRevision||proposal.expiresOn<todayISO();
  if(owner&&needsUpdate)add('proposal-update','Update the proposal','Proposal','The brief changed or the reply date passed.');
  if(!owner&&!needsUpdate&&project.accessRole==='Approver')add('proposal','Review your proposal','Proposal',proposal.title);
 }
 if(owner&&proposal?.status==='Changes requested')add('proposal-change','Review proposal feedback','Proposal',proposal.feedback);
 if(owner&&project.changeRequests.some(c=>c.status==='Pending'))add('brief','Review brief changes','Brief','An agreed brief has a proposed update.');
 // Only the Approver makes decisions; Collaborators and Viewers are asked to look and comment instead.
 const approver=!owner&&project.accessRole==='Approver';
 if(approver)for(const choice of project.decisions||[]){if(choice.status==='Awaiting choice'&&choice.briefRevision===project.briefRevision)add('choice-'+choice.id,choice.title,'Decisions','Choose the direction you prefer.',choice.createdAt);}
 if(project.unreadMessages>0)add('message',`${project.unreadMessages} unread message${project.unreadMessages===1?'':'s'}`,'Conversation','Pick up the conversation.');
 for(const task of project.tasks||[]){if(!task.completed&&task.assignee===(owner?'studio':'client'))add('task-'+task.id,task.title,'Plan',task.due?'Due '+formatDay(task.due):'A shared project task.',task.at);}
 const quote=project.estimates?.at(-1);if(approver&&quote?.status==='Awaiting review'&&quote.briefRevision===project.briefRevision)add('estimate','Review your estimate','Estimate',quote.title);if(owner&&quote?.status==='Changes requested')add('estimate-change','Review estimate feedback','Estimate',quote.feedback);
 const latest=project.designs.at(-1);
 if(owner&&latest?.status==='Changes requested')add('feedback','Revise the design','Designs',latest.feedback,latest.decidedAt);
 if(latest?.status==='Awaiting approval'&&latest.briefRevision!==project.briefRevision){if(owner)add('stale','Update the design','Designs','The brief changed after this version was shared.');}
 else if(approver&&latest?.status==='Awaiting approval')add('approval','Your design is ready to review','Designs',latest.title,latest.at);
 else if(!owner&&latest?.status==='Awaiting approval')add('design-shared','A new design version is ready to see','Designs',project.accessRole==='Collaborator'?'Add any comments for the approver.':latest.title,latest.at);
 if(owner&&project.status==='Enquiry'&&!project.enquiryReviewedAt)add('enquiry','Review new enquiry','Brief','Read their brief and reply.',project.createdAt);
 if(owner&&project.teamDrafts>0)add('team-draft',project.teamDrafts===1?'A design draft from your team':`${project.teamDrafts} design drafts from your team`,'Designs','Waiting for you to review and share.');
 if(owner&&latest?.comments?.some(c=>!c.resolved&&c.role==='client'))add('comment','Review design comments','Designs','Feedback is pinned to the design version.');
 return items;
}
