import {installConversationFeatures,messageDetails,messageDetailsDTO,validateMessageDetails,saveMessageDetails,conversationExtras} from './conversation-features.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {runMigrations} from './migrations.mjs';
import {installRelationships,clientForProject,ensurePrimaryContact,ensureProjectRelationship,projectClientId,joinStatus} from './relationships.mjs';
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
let dummyHash;
// A missing account still costs one scrypt, so sign-in timing does not reveal which emails exist.
export function passwordOK(password,stored){const real=typeof stored==='string'&&stored.includes(':');const [salt,key]=(real?stored:(dummyHash||=passwordHash(randomBytes(16).toString('hex')))).split(':');const expected=Buffer.from(key,'hex');return timingSafeEqual(expected,scryptSync(password,salt,64))&&real;}
// Staff access levels: a viewer can be given projects to contribute to; a bookkeeper sees finances only, read-only.
export const STAFF_ACCESS=['viewer','bookkeeper'];
const staffAccessCheck=`CHECK(access IN (${STAFF_ACCESS.map(value=>`'${value}'`).join(',')}))`;
const STAFF_TABLES={
 studio_staff:name=>`CREATE TABLE IF NOT EXISTS ${name}(user_id TEXT NOT NULL REFERENCES users(id),studio_id TEXT NOT NULL REFERENCES studios(id),access TEXT NOT NULL ${staffAccessCheck},joined_at TEXT NOT NULL,PRIMARY KEY(user_id,studio_id));`,
 staff_invitations:name=>`CREATE TABLE IF NOT EXISTS ${name}(token TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),email TEXT NOT NULL,access TEXT NOT NULL ${staffAccessCheck},expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);`,
};
// Older databases only allowed 'viewer'. Rebuild those tables once, keeping every row, so bookkeepers can be stored.
function widenStaffAccess(db){
 for(const [table,create] of Object.entries(STAFF_TABLES)){
  const schema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql||'';
  if(schema.includes("'bookkeeper'"))continue;
  transaction(db,()=>db.exec(`${create(table+'_access_migration')}
   INSERT INTO ${table}_access_migration SELECT * FROM ${table};
   DROP TABLE ${table};
   ALTER TABLE ${table}_access_migration RENAME TO ${table};`));
 }
 db.exec('CREATE INDEX IF NOT EXISTS staff_invitations_studio_email ON staff_invitations(studio_id,email);');
}
// Older databases only allowed GBP, EUR or USD on invoices and costs. Rebuild those tables once,
// keeping every row and index, so any currency in src/lib/currencies.js can be stored. Foreign keys
// are paused for the swap because payments, credit notes and receipts point at these rows.
const NARROW_CURRENCY="CHECK(currency IN ('GBP','EUR','USD'))";
export function widenCurrencyChecks(db){
 const schema=table=>db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql||'';
 const tables=['invoices','expenses'].filter(table=>schema(table).includes(NARROW_CURRENCY));
 if(!tables.length)return;
 db.exec('PRAGMA foreign_keys=OFF');
 try{
  for(const table of tables)transaction(db,()=>{
   const temp=`${table}_currency_migration`,indexes=db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name=? AND sql IS NOT NULL").all(table).map(row=>row.sql);
   db.exec(schema(table).replace(NARROW_CURRENCY,'CHECK(length(currency)=3)').replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?\w+["`]?/i,`CREATE TABLE ${temp}`));
   db.exec(`INSERT INTO ${temp} SELECT * FROM ${table};DROP TABLE ${table};ALTER TABLE ${temp} RENAME TO ${table};`);
   for(const sql of indexes)db.exec(sql);
   if(db.prepare('PRAGMA foreign_key_check').all().some(row=>row.table===table||row.parent===table))throw new Error(`The ${table} table could not be upgraded safely.`);
  });
 }finally{db.exec('PRAGMA foreign_keys=ON');}
}
export function openStore(file){
 const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS studios(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,accent TEXT NOT NULL,origins TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id),studio_id TEXT REFERENCES studios(id),role TEXT CHECK(role IN ('owner','client')),PRIMARY KEY(user_id,studio_id));
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,studio_id TEXT REFERENCES studios(id),client_email TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,studio_id TEXT REFERENCES studios(id),email TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL);
 CREATE INDEX IF NOT EXISTS files_project ON files(project_id);
 CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,studio_id TEXT REFERENCES studios(id),email TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(studio_id,email));
 CREATE TABLE IF NOT EXISTS project_reads(user_id TEXT NOT NULL,project_id TEXT NOT NULL,seen TEXT NOT NULL,PRIMARY KEY(user_id,project_id));
 CREATE TABLE IF NOT EXISTS studio_branding(studio_id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS receipts(studio_id TEXT NOT NULL,key TEXT NOT NULL,digest TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(studio_id,key));
 ${STAFF_TABLES.studio_staff('studio_staff')}
 ${STAFF_TABLES.staff_invitations('staff_invitations')}
 CREATE TABLE IF NOT EXISTS studio_project_collaborators(user_id TEXT NOT NULL REFERENCES users(id),studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),assigned_at TEXT NOT NULL,assigned_by TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(user_id,studio_id,project_id));
 CREATE INDEX IF NOT EXISTS studio_project_collaborators_project ON studio_project_collaborators(studio_id,project_id);
 CREATE INDEX IF NOT EXISTS staff_invitations_studio_email ON staff_invitations(studio_id,email);
 CREATE TABLE IF NOT EXISTS design_assets(file_id TEXT PRIMARY KEY REFERENCES files(id),studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),uploaded_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS design_drafts(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL,description TEXT NOT NULL,asset_ids TEXT NOT NULL,brief_revision INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL CHECK(status IN ('private','shared')),created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,shared_design_id TEXT);
 CREATE INDEX IF NOT EXISTS design_drafts_project ON design_drafts(studio_id,project_id,status,updated_at);`);
 db.exec(`
 CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_key ON clients(id,studio_id);
 CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_key ON projects(id,studio_id);
 CREATE TABLE IF NOT EXISTS conversations(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),client_id TEXT NOT NULL,
  project_id TEXT UNIQUE,subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Waiting','Resolved')),
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
 CREATE TABLE IF NOT EXISTS conversation_messages(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id TEXT REFERENCES users(id),author_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','client')),
  text TEXT NOT NULL,created_at TEXT NOT NULL,client_key TEXT,
  UNIQUE(conversation_id,user_id,client_key));
 CREATE TABLE IF NOT EXISTS conversation_reads(
  user_id TEXT NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_seq INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,conversation_id));
 CREATE INDEX IF NOT EXISTS conversations_studio_updated ON conversations(studio_id,updated_at DESC);
 CREATE INDEX IF NOT EXISTS conversations_client ON conversations(studio_id,client_id);
 CREATE INDEX IF NOT EXISTS conversation_messages_order ON conversation_messages(conversation_id,seq);
 CREATE INDEX IF NOT EXISTS projects_studio_client ON projects(studio_id,client_email);
 CREATE INDEX IF NOT EXISTS memberships_studio_role ON memberships(studio_id,role);
 CREATE INDEX IF NOT EXISTS invitations_studio_email ON invitations(studio_id,email);
 CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
 CREATE TABLE IF NOT EXISTS crm_opportunities(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),client_id TEXT NOT NULL,
  project_id TEXT UNIQUE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL CHECK(stage IN ('Discovery','Qualified','Proposal','Negotiation','Won','Lost')),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(amount_minor>=0),currency TEXT NOT NULL DEFAULT 'GBP',
  probability INTEGER NOT NULL DEFAULT 20 CHECK(probability BETWEEN 0 AND 100),
  expected_close TEXT NOT NULL DEFAULT '',lost_reason TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
 CREATE TABLE IF NOT EXISTS crm_activities(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),client_id TEXT NOT NULL,
  opportunity_id TEXT,kind TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',
  actor_id TEXT REFERENCES users(id),actor_name TEXT NOT NULL,created_at TEXT NOT NULL,
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(opportunity_id,studio_id) REFERENCES crm_opportunities(id,studio_id));
 CREATE TABLE IF NOT EXISTS crm_tasks(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),client_id TEXT NOT NULL,
  opportunity_id TEXT,title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',due_date TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL CHECK(priority IN ('Low','Normal','High')),completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(opportunity_id,studio_id) REFERENCES crm_opportunities(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_tenant_key ON crm_opportunities(id,studio_id);
 CREATE TABLE IF NOT EXISTS crm_enquiry_reviews(
  opportunity_id TEXT NOT NULL,studio_id TEXT NOT NULL,reviewed_at TEXT NOT NULL,reviewed_by TEXT NOT NULL,
  PRIMARY KEY(opportunity_id,studio_id),
  FOREIGN KEY(opportunity_id,studio_id) REFERENCES crm_opportunities(id,studio_id));
 CREATE INDEX IF NOT EXISTS crm_opportunities_studio_stage ON crm_opportunities(studio_id,stage,updated_at DESC);
 CREATE INDEX IF NOT EXISTS crm_opportunities_client ON crm_opportunities(studio_id,client_id);
 CREATE INDEX IF NOT EXISTS crm_activities_client ON crm_activities(studio_id,client_id,created_at DESC);
 CREATE INDEX IF NOT EXISTS crm_activities_opportunity ON crm_activities(studio_id,opportunity_id,created_at DESC);
 CREATE INDEX IF NOT EXISTS crm_tasks_studio_due ON crm_tasks(studio_id,completed,due_date);
 CREATE INDEX IF NOT EXISTS crm_tasks_client ON crm_tasks(studio_id,client_id);
 `);
 db.exec(`
 CREATE TABLE IF NOT EXISTS invoice_counters(
  studio_id TEXT NOT NULL REFERENCES studios(id),year INTEGER NOT NULL,next_number INTEGER NOT NULL CHECK(next_number>0),
  PRIMARY KEY(studio_id,year));
 CREATE TABLE IF NOT EXISTS invoices(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT NOT NULL,
  number TEXT NOT NULL,estimate_id TEXT NOT NULL,estimate_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('Deposit','Balance','Full')),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),net_minor INTEGER NOT NULL CHECK(net_minor>=0),
  tax_minor INTEGER NOT NULL CHECK(tax_minor>=0),tax_rate REAL NOT NULL CHECK(tax_rate BETWEEN 0 AND 100),
  due_date TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',payment_instructions TEXT NOT NULL,
  snapshot TEXT NOT NULL,issued_at TEXT NOT NULL,issued_by TEXT NOT NULL,
  cancelled_at TEXT,cancelled_by TEXT,cancel_reason TEXT,
  UNIQUE(studio_id,number),
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_key ON invoices(id,studio_id);
 CREATE INDEX IF NOT EXISTS invoices_studio_issued ON invoices(studio_id,issued_at DESC);
 CREATE INDEX IF NOT EXISTS invoices_project ON invoices(studio_id,project_id,issued_at DESC);
 CREATE TABLE IF NOT EXISTS invoice_payments(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  method TEXT NOT NULL CHECK(method IN ('bank_transfer','paypal_external','stripe_external','other_external')),
  reference TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL,recorded_by TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'owner_recorded' CHECK(source='owner_recorded'),
  client_key TEXT,
  FOREIGN KEY(invoice_id,studio_id) REFERENCES invoices(id,studio_id),
  UNIQUE(invoice_id,client_key));
 CREATE INDEX IF NOT EXISTS invoice_payments_invoice ON invoice_payments(studio_id,invoice_id,recorded_at);
 `);
 installConversationFeatures(db);
 transaction(db,()=>{
  installRelationships(db);
  // Only parse projects that still lack a conversation, relationship or opportunity (legacy data or a new table).
  const fresh=[];
  for(const row of db.prepare(`SELECT data FROM projects p WHERE NOT EXISTS(SELECT 1 FROM conversations c WHERE c.project_id=p.id)
   OR NOT EXISTS(SELECT 1 FROM crm_project_relationships r WHERE r.project_id=p.id AND r.studio_id=p.studio_id)
   OR NOT EXISTS(SELECT 1 FROM crm_opportunities o WHERE o.project_id=p.id)`).all()){const p=JSON.parse(row.data);if(!db.prepare('SELECT 1 FROM conversations WHERE project_id=?').get(p.id))fresh.push(p.id);materializeProjectConversation(db,p);ensureProjectOpportunity(db,p);}
  // Only untouched automatically generated opportunities used the project date as a forecast.
  // Preserve every manually edited forecast and all original project/form dates.
  db.prepare(`UPDATE crm_opportunities SET expected_close='',revision=revision+1
   WHERE revision=1 AND expected_close<>'' AND (source IN ('Project enquiry','Sample project') OR source LIKE 'Form: %')
   AND expected_close=(SELECT json_extract(data,'$.brief.date') FROM projects WHERE id=project_id AND studio_id=crm_opportunities.studio_id)
   AND NOT EXISTS(SELECT 1 FROM crm_activities WHERE opportunity_id=crm_opportunities.id AND studio_id=crm_opportunities.studio_id)`).run();
  // Legacy read positions only seed conversations created above; later reads are written to both tables.
  for(const read of fresh.flatMap(projectId=>db.prepare('SELECT * FROM project_reads WHERE project_id=?').all(projectId))){
   const c=db.prepare('SELECT id FROM conversations WHERE project_id=?').get(read.project_id);
   if(!c||!db.prepare('SELECT id FROM users WHERE id=?').get(read.user_id))continue;
   const last=db.prepare('SELECT MAX(seq) AS seq FROM conversation_messages WHERE conversation_id=? AND created_at<=?').get(c.id,read.seen);
   if(last.seq)db.prepare('INSERT OR IGNORE INTO conversation_reads VALUES(?,?,?)').run(read.user_id,c.id,last.seq);
  }
 });
 widenStaffAccess(db);
 runMigrations(db);
 return db;
}
export function event(project,actor,text){project.activity.unshift({id:id(),actor:actor.name,text,at:now()});project.updatedAt=now();}
export function makeProject(studioId,brief,actor,clientId=null){const p={id:id(),studioId,title:brief.occasion==='Wedding'?`${brief.name.split(' ')[0]}’s wedding`:brief.occasion+' · '+brief.name,clientEmail:brief.email,...(clientId?{clientId}:{}),status:'Enquiry',brief,briefRevision:1,briefAuthor:actor?.name,briefLocked:false,briefHistory:[],changeRequests:[],messages:[],inspiration:[],designs:[],estimates:[],tasks:[],decisions:[],activity:[],createdAt:now(),updatedAt:now()};event(p,actor,'Submitted the first brief');return p;}
export function saveProject(db,p){transaction(db,()=>{db.prepare('UPDATE projects SET data=? WHERE id=? AND studio_id=?').run(JSON.stringify(p),p.id,p.studioId);materializeProjectConversation(db,p);});}
export function insertProject(db,p){transaction(db,()=>{db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(p.id,p.studioId,p.clientEmail,JSON.stringify(p));materializeProjectConversation(db,p);ensureProjectOpportunity(db,p);});}

export function ensureClient(db,p){
 const existing=clientForProject(db,p);
 if(existing){ensurePrimaryContact(db,existing);return existing;}
 const data={company:'',phone:'',stage:p.status==='Enquiry'?'Lead':'Active',source:'Website / project enquiry',tags:[],notes:[],followUp:'',createdAt:p.createdAt,updatedAt:now()};
 const clientId=id();db.prepare('INSERT INTO clients VALUES(?,?,?,?,?)').run(clientId,p.studioId,p.clientEmail,p.brief.name,JSON.stringify(data));
 const row=db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);ensurePrimaryContact(db,row);return row;
}

export function ensureProjectOpportunity(db,p){
 const client=db.prepare('SELECT id FROM clients WHERE id=? AND studio_id=?').get(projectClientId(db,p.studioId,p.id),p.studioId);
 if(!client)return;
 const at=p.createdAt||now();
 db.prepare(`INSERT OR IGNORE INTO crm_opportunities
  (id,studio_id,client_id,project_id,title,description,stage,amount_minor,currency,probability,expected_close,lost_reason,source,revision,created_at,updated_at)
  VALUES(?,?,?,?,?,'','Discovery',0,'GBP',20,?,'',?,1,?,?)`).run(id(),p.studioId,client.id,p.id,p.title,'',p.demo?'Sample project':'Project enquiry',at,p.updatedAt||at);
}

// Savepoints also work inside the public intake transaction.
export function transaction(db,fn){const key='work_'+id().replaceAll('-','');db.exec('SAVEPOINT '+key);try{const result=fn();db.exec('RELEASE '+key);return result;}catch(error){db.exec('ROLLBACK TO '+key);db.exec('RELEASE '+key);throw error;}}

export function materializeProjectConversation(db,p){
 ensureClient(db,p);
 const relation=ensureProjectRelationship(db,p);
 let c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id);
 // Project messages are copied once, when the conversation is first created (new or legacy projects).
 // After that appendConversationMessage writes each message to both places, so saves never rewrite history.
 if(!c){const cid=id();db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)').run(cid,p.studioId,relation.client_id,p.id,p.title,p.threadStatus||'Open',p.createdAt,p.updatedAt);c=db.prepare('SELECT * FROM conversations WHERE id=?').get(cid);
 for(const m of p.messages||[]){
  const author=m.userId?db.prepare('SELECT id FROM users WHERE id=?').get(m.userId):db.prepare('SELECT u.id FROM users u JOIN memberships ms ON ms.user_id=u.id WHERE ms.studio_id=? AND ms.role=? AND u.name=?').get(p.studioId,m.role,m.by);
  db.prepare('INSERT OR IGNORE INTO conversation_messages(id,conversation_id,user_id,author_name,role,text,created_at) VALUES(?,?,?,?,?,?,?)').run(m.id,c.id,author?.id||null,m.by,m.role,m.text,m.at);
 }}
 // Existing project actions still own their primary thread status and messages.
 const latest=(p.messages||[]).at(-1)?.at||c.updated_at;
 db.prepare('UPDATE conversations SET status=?,updated_at=MAX(updated_at,?) WHERE id=?').run(p.threadStatus||c.status,latest,c.id);
 return db.prepare('SELECT * FROM conversations WHERE id=?').get(c.id);
}

export function conversationDTO(db,c,user){
 const client=db.prepare('SELECT name,email FROM clients WHERE id=? AND studio_id=?').get(c.client_id,c.studio_id);
 const rows=db.prepare('SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY seq').all(c.id);
 const seen=db.prepare('SELECT message_seq FROM conversation_reads WHERE user_id=? AND conversation_id=?').get(user.id,c.id)?.message_seq||0;
 const project=c.project_id?db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,c.studio_id):null;
 const participants=c.project_id?[...db.prepare("SELECT u.id,u.name,'Studio owner' AS role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.studio_id=? AND m.role='owner'").all(c.studio_id),...db.prepare("SELECT u.id,u.name,ps.role FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id JOIN users u ON u.id=ct.user_id WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1").all(c.studio_id,c.project_id),...db.prepare("SELECT u.id,u.name,'Studio contributor' AS role FROM studio_project_collaborators pc JOIN studio_staff ss ON ss.user_id=pc.user_id AND ss.studio_id=pc.studio_id JOIN users u ON u.id=pc.user_id WHERE pc.studio_id=? AND pc.project_id=?").all(c.studio_id,c.project_id)]:[...db.prepare("SELECT u.id,u.name,'Studio owner' AS role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.studio_id=? AND m.role='owner'").all(c.studio_id),...db.prepare("SELECT u.id,u.name,'Client' AS role FROM crm_client_contacts cc JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id JOIN users u ON u.id=ct.user_id WHERE cc.studio_id=? AND cc.client_id=? AND cc.account_access=1").all(c.studio_id,c.client_id)];
 const people=[...new Map(participants.map(person=>[person.id,person])).values()],messages=rows.map(m=>({id:m.id,userId:m.user_id,by:m.author_name,role:m.role,text:m.text,at:m.created_at,...messageDetailsDTO(db,c,m.id)}));
 return {participants:people,id:c.id,subject:c.subject,clientId:c.client_id,clientName:client.name,clientEmail:client.email,projectId:c.project_id,projectTitle:project?JSON.parse(project.data).title:null,status:c.status,createdAt:c.created_at,updatedAt:c.updated_at,
  messages,unreadMessages:rows.filter(m=>m.seq>seen&&(m.user_id?m.user_id!==user.id:m.author_name!==user.name)).length,...conversationExtras(db,c,user,rows,messages,seen,people),
  // The studio sees who cannot read this yet because they have not joined.
  ...(db.prepare("SELECT 1 FROM memberships WHERE user_id=? AND studio_id=? AND role='owner'").get(user.id,c.studio_id)?{waitingToJoin:joinStatus(db,c.studio_id,c.project_id?{projectId:c.project_id}:{clientId:c.client_id}).waiting}:{})};
}

// Project list badges should not load full conversation histories into memory.
export function conversationUnreadCount(db,c,user){return db.prepare(`SELECT COUNT(*) AS count FROM conversation_messages
 WHERE conversation_id=? AND seq>COALESCE((SELECT message_seq FROM conversation_reads WHERE user_id=? AND conversation_id=?),0)
 AND ((user_id IS NOT NULL AND user_id<>?) OR (user_id IS NULL AND author_name<>?))`).get(c.id,user.id,c.id,user.id,user.name).count;}

export function markConversationSeen(db,c,user,lastMessageId){
 const last=db.prepare('SELECT seq,created_at FROM conversation_messages WHERE conversation_id=? AND id=?').get(c.id,lastMessageId);
 if(!last)return false;
 transaction(db,()=>{
  db.prepare('INSERT INTO conversation_reads VALUES(?,?,?) ON CONFLICT(user_id,conversation_id) DO UPDATE SET message_seq=MAX(message_seq,excluded.message_seq)').run(user.id,c.id,last.seq);
  if(c.project_id)db.prepare('INSERT INTO project_reads VALUES(?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET seen=MAX(seen,excluded.seen)').run(user.id,c.project_id,last.created_at);
 });return true;
}

export function appendConversationMessage(db,c,user,role,text,clientKey=null,details={}){
 return transaction(db,()=>{
  const metadata=validateMessageDetails(db,c,user,details,conversationDTO(db,c,user).participants);
  if(!text.trim()&&!metadata.attachmentIds.length)throw Object.assign(new Error('Write a message or attach a file first.'),{status:400});
  if(clientKey){const existing=db.prepare('SELECT * FROM conversation_messages WHERE conversation_id=? AND user_id=? AND client_key=?').get(c.id,user.id,clientKey);if(existing){if(existing.text!==text||JSON.stringify(messageDetails(db,existing.id))!==JSON.stringify(metadata))throw Object.assign(new Error('This message reference has already been used for another message.'),{status:409});return existing.id;}}
  const message={id:id(),userId:user.id,by:user.name,role,text,at:now(),...metadata};
  db.prepare('INSERT INTO conversation_messages(id,conversation_id,user_id,author_name,role,text,created_at,client_key) VALUES(?,?,?,?,?,?,?,?)').run(message.id,c.id,user.id,user.name,role,text,message.at,clientKey);
  saveMessageDetails(db,message.id,metadata);
  db.prepare("UPDATE conversations SET updated_at=?,status='Open' WHERE id=?").run(message.at,c.id);
  if(c.project_id){const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,c.studio_id).data);p.messages.push(message);p.threadStatus='Open';event(p,user,'Added a message');saveProject(db,p);}
  return message.id;
 });
}

export function setConversationStatus(db,c,user,status){transaction(db,()=>{
 db.prepare('UPDATE conversations SET status=?,updated_at=? WHERE id=?').run(status,now(),c.id);
 if(c.project_id){const p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(c.project_id,c.studio_id).data);p.threadStatus=status;event(p,user,'Conversation marked '+status.toLowerCase());saveProject(db,p);}
});}
