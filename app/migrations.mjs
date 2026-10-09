import {saveProject,transaction} from './store.mjs';
// One-off data backfills, recorded in PRAGMA user_version so each runs once per database.
// Append new steps only. Never reorder, remove or edit a step that has shipped.
// Schema (CREATE ... IF NOT EXISTS) stays in the install functions; this list is for data changes.
export const MIGRATIONS=[
 // 1. Designs shared before brief revisions existed belong to the first brief.
 db=>{for(const row of db.prepare("SELECT data FROM projects WHERE EXISTS(SELECT 1 FROM json_each(data,'$.designs') d WHERE json_extract(d.value,'$.briefRevision') IS NULL)").all()){const p=JSON.parse(row.data);for(const d of p.designs||[])if(d.briefRevision==null){d.briefRevision=1;d.briefSnapshot=(p.briefHistory||[]).find(h=>h.revision===1)?.brief||p.brief;}saveProject(db,p);}},
 // 2. Messages live in conversation_messages; drop the old copy each project record carried.
 //    openStore has already copied any project-only messages into conversations before this runs.
 db=>db.prepare("UPDATE projects SET data=json_remove(data,'$.messages') WHERE json_type(data,'$.messages') IS NOT NULL").run(),
];
export function schemaVersion(db){return db.prepare('PRAGMA user_version').get().user_version;}
export function runMigrations(db,steps=MIGRATIONS){
 for(let version=schemaVersion(db);version<steps.length;version++)transaction(db,()=>{steps[version](db);db.exec(`PRAGMA user_version=${version+1}`);});
 return schemaVersion(db);
}
