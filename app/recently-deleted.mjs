import {id,now,event,saveProject,transaction} from './store.mjs';
// Deleted tasks, drafts, comments and references wait here for 30 days so the studio can put them back.
// Files they used stay until the item is restored or its 30 days are up. Erasing a client or project clears their rows too.
export const KEEP_DAYS=30;
const DAY=86400000;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const KINDS={'project-task':'Task','crm-task':'Task','draft':'Design draft','design-comment':'Design comment','reference':'Reference','reference-comment':'Reference comment'};

export function installRecentlyDeleted(db){
 db.exec(`CREATE TABLE IF NOT EXISTS deleted_items(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,project_id TEXT,client_id TEXT,kind TEXT NOT NULL,label TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL,file_ids TEXT NOT NULL DEFAULT '[]',deleted_by TEXT,deleted_by_name TEXT NOT NULL DEFAULT '',deleted_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS deleted_items_studio ON deleted_items(studio_id,deleted_at);`);
}

/** Keeps a copy of something just deleted. Call inside the same transaction as the deletion. */
export function binItem(db,{studioId,projectId=null,clientId=null,kind,label,detail='',payload,fileIds=[],user}){
 if(!KINDS[kind])throw new Error('Unknown deleted item kind: '+kind);
 const itemId=id();
 db.prepare('INSERT INTO deleted_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(itemId,studioId,projectId,clientId,kind,String(label||KINDS[kind]).slice(0,200),String(detail||'').slice(0,240),JSON.stringify(payload),JSON.stringify(fileIds),user?.id||null,user?.name||'',now());
 return itemId;
}

export const fileHeldInBin=(db,studioId,fileId)=>!!db.prepare('SELECT 1 FROM deleted_items d,json_each(d.file_ids) f WHERE d.studio_id=? AND f.value=?').get(studioId,fileId);

function fileInUse(db,studioId,projectId,fileId,kind){
 if(fileHeldInBin(db,studioId,fileId))return true;
 // A reference never owned a file someone uploaded for a design draft.
 if(kind==='reference'&&db.prepare('SELECT 1 FROM design_assets WHERE file_id=? AND studio_id=?').get(fileId,studioId))return true;
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);if(!row)return false;
 const p=JSON.parse(row.data);
 return (p.designs||[]).some(d=>d.fileId===fileId||d.assets?.some(a=>a.fileId===fileId))||(p.inspiration||[]).some(r=>r.fileId===fileId)||db.prepare('SELECT asset_ids FROM design_drafts WHERE studio_id=? AND project_id=?').all(studioId,projectId).some(d=>JSON.parse(d.asset_ids||'[]').includes(fileId));
}

/** Removes items older than 30 days for good, with any files nothing else still uses. */
export function purgeBin(db,studioId,at=Date.now()){
 const old=db.prepare('SELECT * FROM deleted_items WHERE studio_id=? AND deleted_at<?').all(studioId,new Date(at-KEEP_DAYS*DAY).toISOString());
 if(!old.length)return 0;
 transaction(db,()=>{for(const item of old){
  db.prepare('DELETE FROM deleted_items WHERE id=?').run(item.id);
  for(const fileId of JSON.parse(item.file_ids))if(item.project_id&&!fileInUse(db,studioId,item.project_id,fileId,item.kind)){
   db.prepare('DELETE FROM design_assets WHERE file_id=? AND studio_id=? AND project_id=?').run(fileId,studioId,item.project_id);
   db.prepare('DELETE FROM files WHERE id=? AND project_id=?').run(fileId,item.project_id);
  }
 }});
 return old.length;
}

export function listBin(db,studioId){
 purgeBin(db,studioId);
 return db.prepare('SELECT d.*,p.data AS project FROM deleted_items d LEFT JOIN projects p ON p.id=d.project_id AND p.studio_id=d.studio_id WHERE d.studio_id=? ORDER BY d.deleted_at DESC').all(studioId).map(r=>({id:r.id,kind:r.kind,type:KINDS[r.kind],label:r.label,detail:r.detail,projectId:r.project_id,projectTitle:r.project?JSON.parse(r.project).title:'',deletedBy:r.deleted_by_name,deletedAt:r.deleted_at,expiresAt:new Date(Date.parse(r.deleted_at)+KEEP_DAYS*DAY).toISOString()}));
}

const insertRow=(db,table,row)=>{const cols=Object.keys(row);db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>row[c]));};

export function restoreItem(db,studioId,itemId,user){
 const item=db.prepare('SELECT * FROM deleted_items WHERE id=? AND studio_id=?').get(itemId,studioId);if(!item)fail(404,'This is no longer in Recently deleted.');
 const payload=JSON.parse(item.payload);
 return transaction(db,()=>{
  if(item.kind==='crm-task'){
   const row={...payload.row};
   if(row.client_id&&!db.prepare('SELECT 1 FROM clients WHERE id=? AND studio_id=?').get(row.client_id,studioId))fail(409,'The client this task belonged to has been removed.');
   if(row.opportunity_id&&!db.prepare('SELECT 1 FROM crm_opportunities WHERE id=? AND studio_id=?').get(row.opportunity_id,studioId))row.opportunity_id=null;
   if(db.prepare('SELECT 1 FROM crm_tasks WHERE id=?').get(row.id))fail(409,'This task is already back.');
   insertRow(db,'crm_tasks',row);
  }else{
   const projectRow=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(item.project_id,studioId);if(!projectRow)fail(409,'The project this belonged to has been deleted.');
   if(item.kind==='draft'){
    if(db.prepare('SELECT 1 FROM design_drafts WHERE id=?').get(payload.row.id))fail(409,'This draft is already back.');
    insertRow(db,'design_drafts',payload.row);
   }else{
    const p=JSON.parse(projectRow.data);
    if(item.kind==='project-task'){p.tasks||=[];if(!p.tasks.some(t=>t.id===payload.task.id))p.tasks.push(payload.task);event(p,user,'Restored task: '+payload.task.title);}
    else if(item.kind==='design-comment'){const d=p.designs.find(d=>d.id===payload.designId);if(!d)fail(409,'That design version no longer exists.');d.comments||=[];for(const c of payload.comments)if(!d.comments.some(x=>x.id===c.id))d.comments.push(c);event(p,user,'Restored a design comment');}
    else if(item.kind==='reference'){p.inspiration||=[];if(!p.inspiration.some(r=>r.id===payload.reference.id))p.inspiration.push(payload.reference);if(payload.position){p.referenceLayout||={};p.referenceLayout.positions||={};p.referenceLayout.positions[payload.reference.id]=payload.position;}event(p,user,'Restored a reference: '+payload.reference.title);}
    else if(item.kind==='reference-comment'){const ref=(p.inspiration||[]).find(r=>r.id===payload.referenceId);if(!ref)fail(409,'That reference has been removed.');ref.comments||=[];if(!ref.comments.some(c=>c.id===payload.comment.id))ref.comments.push(payload.comment);event(p,user,'Restored a reference comment');}
    saveProject(db,p);
   }
  }
  db.prepare('DELETE FROM deleted_items WHERE id=?').run(item.id);
  return {kind:item.kind,projectId:item.project_id};
 });
}
