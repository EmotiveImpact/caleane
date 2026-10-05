// Where a notification leads. Kept separate from the drawer so routing stays testable.
// A missing tab lets the caller choose its default, as the contributor view does.
export function notificationDestination(item,{owner=false,staff=false}={}){
 if(item.kind==='enquiry')return owner?{view:'pipeline',opportunityId:item.opportunityId,clientId:item.clientId}:null;
 if(item.kind==='task_assigned'){
  if(owner)return {view:'tasks',taskId:item.taskId};
  return item.projectId?{view:'projects',projectId:item.projectId}:null;
 }
 if(item.kind==='message'){
  if(item.projectId)return staff?{view:'projects',projectId:item.projectId}:{view:'projects',projectId:item.projectId,tab:'Conversation'};
  return {view:'inbox',clientId:owner?item.clientId:null};
 }
 if(item.kind==='project_update'&&item.projectId)return {view:'projects',projectId:item.projectId,tab:'Activity'};
 return null;
}

export const NOTIFICATION_KIND_LABEL={enquiry:'Enquiry',message:'Message',project_update:'Project update',task_assigned:'Assigned to you'};

export function notificationAge(createdAt,now=Date.now()){
 const at=Date.parse(createdAt);if(!Number.isFinite(at))return '';
 const minutes=Math.max(0,Math.floor((now-at)/60000));
 if(minutes<1)return 'Just now';
 if(minutes<60)return `${minutes} min ago`;
 const hours=Math.floor(minutes/60);if(hours<24)return `${hours} h ago`;
 const days=Math.floor(hours/24);if(days<7)return days===1?'Yesterday':`${days} days ago`;
 return new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'short',...(new Date(at).getFullYear()!==new Date(now).getFullYear()?{year:'numeric'}:{})});
}
