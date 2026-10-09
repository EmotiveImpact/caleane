// This week's follow-ups: proposal follow-ups from Pipeline, client follow-up dates and CRM tasks, soonest first.
// Anything due today or earlier is under Needs your attention already, except proposal follow-ups and client dates.
export function weekFollowUps({tasks=[],clients=[],pipeline=[]},today){
 const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);const last=end.toISOString().slice(0,10);
 return [
  ...pipeline.filter(f=>f.date<=last).map(f=>({id:'pipeline-'+f.opportunityId,kind:'pipeline',name:f.clientName,note:`Proposal follow-up ${f.step} of ${f.steps}`,date:f.date,opportunityId:f.opportunityId,clientId:f.clientId})),
  ...clients.filter(c=>c.followUp&&c.followUp<=last).map(c=>({id:'client-'+c.id,kind:'client',name:c.name,note:c.followUpNote||'Follow up',date:c.followUp,clientId:c.id})),
  ...tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate>today&&t.dueDate<=last).map(t=>({id:'task-'+t.id,kind:'task',name:t.clientName||t.title,note:t.clientName?t.title:'Task',date:t.dueDate,taskId:'crm:'+t.id})),
 ].sort((a,b)=>a.date.localeCompare(b.date));
}
