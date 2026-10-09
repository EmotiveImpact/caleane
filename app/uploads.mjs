// Studio file storage: a per-studio quota checked by every upload path, and cleanup of uploads nobody attached.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hasTable=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
export const DEFAULT_STUDIO_QUOTA_BYTES=2*1024**3;
/** CALEANE_STUDIO_STORAGE_BYTES overrides the 2 GB default. */
export function studioQuotaBytes(env=process.env){const n=Number(env.CALEANE_STUDIO_STORAGE_BYTES);return Number.isFinite(n)&&n>0?n:DEFAULT_STUDIO_QUOTA_BYTES;}
/** Bytes stored for a studio across project files, task attachments, conversation files and files kept in custom fields. */
export function studioStorageBytes(db,studioId){
 let total=db.prepare('SELECT COALESCE(SUM(length(f.content)),0) AS n FROM files f JOIN projects p ON p.id=f.project_id WHERE p.studio_id=?').get(studioId).n;
 if(hasTable(db,'task_attachments'))total+=db.prepare('SELECT COALESCE(SUM(length(content)),0) AS n FROM task_attachments WHERE studio_id=?').get(studioId).n;
 if(hasTable(db,'conversation_files'))total+=db.prepare('SELECT COALESCE(SUM(length(f.content)),0) AS n FROM conversation_files f JOIN conversations c ON c.id=f.conversation_id WHERE c.studio_id=?').get(studioId).n;
 if(hasTable(db,'custom_field_files'))total+=db.prepare('SELECT COALESCE(SUM(length(content)),0) AS n FROM custom_field_files WHERE studio_id=?').get(studioId).n;
 return total;
}
export function assertQuota(db,studioId,bytes,limit=studioQuotaBytes()){
 if(studioStorageBytes(db,studioId)+bytes>limit)fail(413,'This studio has used all of its file storage. Remove files you no longer need, then try again.');
}
/**
 * Conversation files are uploaded before the message that attaches them; drop those never attached after olderThanMs.
 * Task attachments are added to their task in the same transaction, so any not listed on a task are removed.
 */
export function cleanupUnattachedUploads(db,{olderThanMs=86400000,clock=Date.now}={}){
 let removed=0;
 if(hasTable(db,'conversation_files')&&hasTable(db,'conversation_message_details'))removed+=Number(db.prepare(`DELETE FROM conversation_files WHERE created_at<? AND NOT EXISTS(SELECT 1 FROM conversation_message_details d JOIN conversation_messages m ON m.id=d.message_id JOIN json_each(d.attachment_ids) a
  WHERE m.conversation_id=conversation_files.conversation_id AND a.value=conversation_files.id)`).run(new Date(clock()-olderThanMs).toISOString()).changes);
 if(hasTable(db,'task_attachments')&&hasTable(db,'task_collaboration'))removed+=Number(db.prepare(`DELETE FROM task_attachments WHERE NOT EXISTS(SELECT 1 FROM task_collaboration t JOIN json_each(t.data,'$.files') f
  WHERE t.studio_id=task_attachments.studio_id AND t.task_key=task_attachments.task_key AND json_extract(f.value,'$.id')=task_attachments.id)`).run().changes);
 return removed;
}
