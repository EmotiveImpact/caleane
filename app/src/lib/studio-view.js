import {demoCoverFor} from './workflows.js';
export const shortDate=value=>value?new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not scheduled';
export const initials=name=>(name||'').split(/\s+/).map(word=>word[0]).slice(0,2).join('');
export const fileURL=(p,studio,id)=>`/api/projects/${p.id}/files/${id}?studio=${studio.id}`;
export function mediaFor(p,studio,item){if(!item)return '';if(item.fileId){const file=item.assets?.find(asset=>asset.fileId===item.fileId)||p.inspiration?.find(ref=>ref.fileId===item.fileId);if((item.mime||file?.mime)?.startsWith('image/'))return fileURL(p,studio,item.fileId);}return item.sample||'';}
export function projectCover(p,studio){return mediaFor(p,studio,p.designs?.at(-1))||[...(p.inspiration||[])].reverse().map(item=>mediaFor(p,studio,item)).find(Boolean)||demoCoverFor(p)||'';}
export const approvedDirection=p=>[...(p.designs||[])].reverse().find(d=>d.status==='Approved');
export function reviewRecords(projects){return projects.flatMap(project=>(project.designs||[]).map(design=>({project,design,id:project.id+':'+design.id,current:design.id===project.designs.at(-1)?.id,stale:design.briefRevision!==project.briefRevision}))).sort((a,b)=>(b.design.decidedAt||b.design.at||'').localeCompare(a.design.decidedAt||a.design.at||''));}
export function pendingReviews(projects){return reviewRecords(projects).filter(r=>r.current&&r.design.status==='Awaiting approval'&&!['Archived','Complete'].includes(r.project.status));}
export function recentDecisions(projects){return projects.flatMap(project=>[
 ...(project.designs||[]).filter(d=>d.decidedAt).map(d=>({id:d.id,project,title:d.title,status:d.status,by:d.decidedBy,at:d.decidedAt,version:d.version,tab:'Designs',designId:d.id})),
 ...(project.proposals||[]).filter(d=>d.decidedAt).map(d=>({id:d.id,project,title:d.title,status:d.status,by:d.decidedBy,at:d.decidedAt,version:d.version,tab:'Proposal'})),
 ...(project.estimates||[]).filter(d=>d.decidedAt).map(d=>({id:d.id,project,title:d.title,status:d.status,by:d.decidedBy,at:d.decidedAt,version:d.version,tab:'Estimate'})),
 ...(project.decisions||[]).filter(d=>d.decidedAt).map(d=>({id:d.id,project,title:d.title,status:d.status,by:d.decidedBy,at:d.decidedAt,tab:'Decisions'}))
 ]).sort((a,b)=>b.at.localeCompare(a.at));}

export function projectInGroup(project,group){
 if(group==='Enquiries')return project.status==='Enquiry';
 if(group==='Complete'||group==='Archived')return project.status===group;
 if(group==='Awaiting approval')return pendingReviews([project]).length>0;
 return !['Enquiry','Complete','Archived'].includes(project.status);
}
