// Where a notification leads. Kept separate from the drawer so routing stays testable.
// A missing tab lets the caller choose its default, as the contributor view does.
// Money activity that only the owner and a project's Approver may see (matches the project view).
export const MONEY_ACTIVITY=/invoice|payment|refund|credit note|estimate|proposal|deposit|instalment|balance/i;

// The project tab an activity entry is about, so a notification opens the work itself.
export function activityTab(text){
 const t=String(text||'').toLowerCase();
 return /invoice|payment|refund|credit note|deposit|instalment|balance/.test(t)?'Billing':t.includes('estimate')?'Estimate':t.includes('proposal')?'Proposal'
  :/contract|agreement/.test(t)?'Contract':t.includes('design')?'Designs':/reference|inspiration/.test(t)?'Inspiration':t.includes('task')?'Plan'
  :/document|file/.test(t)?'Documents':t.includes('decision')?'Decisions':t.includes('brief')?'Brief':'Activity';
}

export function notificationDestination(item,{owner=false,staff=false}={}){
 if(item.kind==='enquiry')return owner?{view:'pipeline',opportunityId:item.opportunityId,clientId:item.clientId}:null;
 if(item.kind==='task_assigned'){
  if(owner)return {view:'tasks',taskId:item.taskId};
  return item.projectId?{view:'projects',projectId:item.projectId}:null;
 }
 if(item.kind==='message'){
  if(item.projectId)return staff?{view:'projects',projectId:item.projectId}:{view:'projects',projectId:item.projectId,tab:'Conversation'};
  return {view:'inbox',clientId:owner?item.clientId:null,conversationId:owner?item.conversationId:null};
 }
 if(item.kind==='follow_up')return owner?{view:'inbox',clientId:item.clientId,conversationId:item.conversationId}:null;
 if(item.kind==='project_update'&&item.projectId)return {view:'projects',projectId:item.projectId,tab:activityTab(item.title)};
 return null;
}

export const NOTIFICATION_KIND_LABEL={enquiry:'Enquiry',message:'Message',project_update:'Project update',task_assigned:'Assigned to you',follow_up:'Follow up'};

export function notificationAge(createdAt,now=Date.now()){
 const at=Date.parse(createdAt);if(!Number.isFinite(at))return '';
 const minutes=Math.max(0,Math.floor((now-at)/60000));
 if(minutes<1)return 'Just now';
 if(minutes<60)return `${minutes} min ago`;
 const hours=Math.floor(minutes/60);if(hours<24)return `${hours} h ago`;
 const days=Math.floor(hours/24);if(days<7)return days===1?'Yesterday':`${days} days ago`;
 return new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'short',...(new Date(at).getFullYear()!==new Date(now).getFullYear()?{year:'numeric'}:{})});
}
