import {id,now} from './store.mjs';
import {projectAccess} from './relationships.mjs';
import {recordDocumentOpened} from './notification-feed.mjs';

// When a client first opens a proposal, contract, estimate or invoice, and
// when they last came back to it. Only client opens count: the studio looking
// at its own document is not news. Only the studio owner reads the result.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const OPEN_KINDS=['proposal','contract','estimate','invoice'];
const LABEL={proposal:'proposal',contract:'contract',estimate:'estimate',invoice:'invoice'};
// Reloading a page or switching tabs is the same visit, so the count only grows after a gap.
const VISIT_GAP_MS=30*60*1000;

export function installDocumentOpens(db){
 db.exec(`CREATE TABLE IF NOT EXISTS client_document_opens(
  studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('proposal','contract','estimate','invoice')),
  item_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),first_opened_at TEXT NOT NULL,last_opened_at TEXT NOT NULL,opens INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(studio_id,kind,item_id,user_id));
 CREATE INDEX IF NOT EXISTS client_document_opens_project ON client_document_opens(studio_id,project_id);`);
}

function agreement(db,studioId,projectId,itemId){
 const row=db.prepare('SELECT data FROM project_agreements WHERE studio_id=? AND project_id=? AND id=?').get(studioId,projectId,itemId);
 return row?JSON.parse(row.data):null;
}

// What the client is opening, or null when it is not theirs to see.
function findItem(db,{studioId,projectId,project,role,kind,itemId}){
 const money=role==='Approver';
 if(kind==='proposal'){const q=money&&(project.proposals||[]).find(x=>x.id===itemId);return q?{title:q.title,version:q.version}:null;}
 if(kind==='estimate'){const e=money&&(project.estimates||[]).find(x=>x.id===itemId);return e?{title:e.title,version:e.version}:null;}
 if(kind==='invoice'){const i=money&&db.prepare('SELECT number FROM invoices WHERE studio_id=? AND project_id=? AND id=?').get(studioId,projectId,itemId);return i?{title:'Invoice '+i.number}:null;}
 const a=agreement(db,studioId,projectId,itemId);return a&&a.status!=='Draft'&&a.issuedAt?{title:a.title,version:a.version}:null;
}

export function recordDocumentOpen(db,{studioId,projectId,user,owner,staffViewer,kind,itemId,at=now()}){
 installDocumentOpens(db);
 if(!OPEN_KINDS.includes(kind)||typeof itemId!=='string'||!/^[a-f0-9-]{8,64}$/.test(itemId))fail(400,'Choose a document to record.');
 if(owner||staffViewer)return {recorded:false};
 const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId),role=row&&projectAccess(db,studioId,projectId,user.id);
 if(!role)fail(404,'Project not found.');
 const project=JSON.parse(row.data),item=findItem(db,{studioId,projectId,project,role,kind,itemId});
 if(!item)fail(404,'Document not found.');
 const existing=db.prepare('SELECT * FROM client_document_opens WHERE studio_id=? AND kind=? AND item_id=? AND user_id=?').get(studioId,kind,itemId,user.id);
 if(existing){
  const newVisit=Date.parse(at)-Date.parse(existing.last_opened_at)>=VISIT_GAP_MS;
  db.prepare('UPDATE client_document_opens SET last_opened_at=?,opens=opens+? WHERE studio_id=? AND kind=? AND item_id=? AND user_id=?').run(at,newVisit?1:0,studioId,kind,itemId,user.id);
  return {recorded:true,first:false};
 }
 db.prepare('INSERT INTO client_document_opens VALUES(?,?,?,?,?,?,?,1)').run(studioId,projectId,kind,itemId,user.id,at,at);
 const anyoneBefore=db.prepare('SELECT 1 FROM client_document_opens WHERE studio_id=? AND kind=? AND item_id=? AND user_id<>?').get(studioId,kind,itemId,user.id);
 if(!anyoneBefore){
  const what=`${LABEL[kind]}${item.version?' version '+item.version:''}`;
  const opp=db.prepare('SELECT id,client_id FROM crm_opportunities WHERE studio_id=? AND project_id=?').get(studioId,projectId);
  if(opp)db.prepare('INSERT INTO crm_activities (id,studio_id,client_id,opportunity_id,kind,title,detail,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(id(),studioId,opp.client_id,opp.id,'Opened',`${user.name} opened the ${what}`,item.title||'',user.id,user.name,at);
  try{recordDocumentOpened(db,{studioId,projectId,kind,itemId,actorName:user.name,title:`${user.name} opened the ${what}`,detail:project.title,opportunityId:opp?.id,clientId:opp?.client_id,createdAt:at});}catch{/* The open is recorded even if the notification is not. */}
 }
 return {recorded:true,first:!anyoneBefore};
}

// Owner view: "proposal:<id>" -> when it was first and last opened, how many visits, and by whom.
export function documentOpens(db,studioId,projectId){
 installDocumentOpens(db);
 const rows=db.prepare('SELECT o.*,u.name FROM client_document_opens o JOIN users u ON u.id=o.user_id WHERE o.studio_id=? AND o.project_id=? ORDER BY o.first_opened_at').all(studioId,projectId);
 const result={};
 for(const r of rows){
  const key=`${r.kind}:${r.item_id}`,entry=result[key]||(result[key]={firstOpenedAt:r.first_opened_at,lastOpenedAt:r.last_opened_at,opens:0,people:[]});
  if(r.first_opened_at<entry.firstOpenedAt)entry.firstOpenedAt=r.first_opened_at;
  if(r.last_opened_at>entry.lastOpenedAt)entry.lastOpenedAt=r.last_opened_at;
  entry.opens+=r.opens;entry.people.push(r.name);
 }
 return result;
}

export function firstOpenedAt(db,studioId,kind,itemId){
 installDocumentOpens(db);
 return db.prepare('SELECT MIN(first_opened_at) AS at FROM client_document_opens WHERE studio_id=? AND kind=? AND item_id=?').get(studioId,kind,itemId)?.at||null;
}

export function handleDocumentOpens({db,req,route,body,user,studio,owner,staffViewer,reply}){
 const match=route.match(/^\/api\/projects\/([a-f0-9-]+)\/opened$/);
 if(!match)return false;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 reply(200,recordDocumentOpen(db,{studioId:studio.id,projectId:match[1],user,owner,staffViewer,kind:body.kind,itemId:body.itemId}));
 return true;
}
