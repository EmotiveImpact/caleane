export function phaseSummary(milestones=[]){
 const steps=milestones.filter(step=>!step.archivedAt).slice().sort((a,b)=>(a.order||0)-(b.order||0));
 const completed=steps.filter(step=>step.status==='Complete').length;
 return {steps,completed,total:steps.length,current:steps.find(step=>step.status==='In progress')||steps.find(step=>step.status!=='Complete')||null};
}
