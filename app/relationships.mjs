import {randomUUID} from 'node:crypto';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const at=()=>new Date().toISOString();

export function installRelationships(db){
 db.exec(`
 CREATE TABLE IF NOT EXISTS crm_organizations(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS crm_organizations_tenant_key ON crm_organizations(id,studio_id);
 CREATE TABLE IF NOT EXISTS crm_contacts(
  id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),name TEXT NOT NULL,
  email TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',organization_id TEXT,user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(studio_id,email),
  FOREIGN KEY(organization_id,studio_id) REFERENCES crm_organizations(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_tenant_key ON crm_contacts(id,studio_id);
 CREATE TABLE IF NOT EXISTS crm_client_contacts(
  studio_id TEXT NOT NULL,client_id TEXT NOT NULL,contact_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Contact',primary_contact INTEGER NOT NULL DEFAULT 0 CHECK(primary_contact IN (0,1)),
  account_access INTEGER NOT NULL DEFAULT 0 CHECK(account_access IN (0,1)),
  PRIMARY KEY(client_id,contact_id),
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(contact_id,studio_id) REFERENCES crm_contacts(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS crm_client_primary ON crm_client_contacts(client_id) WHERE primary_contact=1;
 CREATE TABLE IF NOT EXISTS crm_client_organizations(
  client_id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,organization_id TEXT NOT NULL,
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id),
  FOREIGN KEY(organization_id,studio_id) REFERENCES crm_organizations(id,studio_id));
 CREATE TABLE IF NOT EXISTS crm_project_relationships(
  project_id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,client_id TEXT NOT NULL,
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id),
  FOREIGN KEY(client_id,studio_id) REFERENCES clients(id,studio_id));
 CREATE TABLE IF NOT EXISTS crm_project_stakeholders(
  project_id TEXT NOT NULL,studio_id TEXT NOT NULL,contact_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Approver','Collaborator','Viewer')),
  portal_access INTEGER NOT NULL DEFAULT 1 CHECK(portal_access IN (0,1)),
  primary_contact INTEGER NOT NULL DEFAULT 0 CHECK(primary_contact IN (0,1)),
  PRIMARY KEY(project_id,contact_id),
  FOREIGN KEY(project_id,studio_id) REFERENCES projects(id,studio_id),
  FOREIGN KEY(contact_id,studio_id) REFERENCES crm_contacts(id,studio_id));
 CREATE UNIQUE INDEX IF NOT EXISTS crm_project_primary ON crm_project_stakeholders(project_id) WHERE primary_contact=1;
 CREATE INDEX IF NOT EXISTS crm_contacts_user ON crm_contacts(studio_id,user_id);
 CREATE INDEX IF NOT EXISTS crm_stakeholders_contact ON crm_project_stakeholders(studio_id,contact_id);
 CREATE INDEX IF NOT EXISTS crm_relationships_client ON crm_project_relationships(studio_id,client_id);
 `);
 for(const client of db.prepare('SELECT * FROM clients').all())ensurePrimaryContact(db,client,true);
}

export function ensurePrimaryContact(db,client,bindLegacyUser=false){
 let contact=db.prepare('SELECT * FROM crm_contacts WHERE studio_id=? AND email=?').get(client.studio_id,client.email);
 if(!contact){
  const user=bindLegacyUser?db.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id
   WHERE m.studio_id=? AND m.role='client' AND u.email=?`).get(client.studio_id,client.email):null;
  const contactId=randomUUID(),created=at(),data=JSON.parse(client.data);
  db.prepare(`INSERT INTO crm_contacts(id,studio_id,name,email,phone,user_id,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?)`).run(contactId,client.studio_id,client.name,client.email,data.phone||'',user?.id||null,created,created);
  contact=db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(contactId);
 }
 db.prepare(`INSERT OR IGNORE INTO crm_client_contacts(studio_id,client_id,contact_id,role,primary_contact,account_access)
  VALUES(?,?,?,'Primary contact',1,1)`).run(client.studio_id,client.id,contact.id);
 return contact;
}

export function clientForProject(db,p){
 const relation=db.prepare('SELECT client_id FROM crm_project_relationships WHERE project_id=? AND studio_id=?').get(p.id,p.studioId);
 if(relation)return db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(relation.client_id,p.studioId);
 if(p.clientId){const row=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(p.clientId,p.studioId);if(!row)fail(404,'Client not found.');if(row.email!==p.clientEmail)fail(409,'The project email differs from this client. Update the primary contact first.');return row;}
 const linked=db.prepare(`SELECT cl.* FROM clients cl JOIN crm_client_contacts cc ON cc.client_id=cl.id AND cc.studio_id=cl.studio_id
  JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id
  WHERE cl.studio_id=? AND ct.email=? AND cc.primary_contact=1`).get(p.studioId,p.clientEmail);
 return linked||db.prepare('SELECT * FROM clients WHERE studio_id=? AND email=?').get(p.studioId,p.clientEmail);
}

export function ensureProjectRelationship(db,p){
 let relation=db.prepare('SELECT * FROM crm_project_relationships WHERE project_id=? AND studio_id=?').get(p.id,p.studioId);
 if(relation)return relation;
 const client=clientForProject(db,p);if(!client)fail(404,'Client not found.');
 const primary=ensurePrimaryContact(db,client);
 db.prepare('INSERT INTO crm_project_relationships VALUES(?,?,?)').run(p.id,p.studioId,client.id);
 db.prepare(`INSERT OR IGNORE INTO crm_project_stakeholders(project_id,studio_id,contact_id,role,portal_access,primary_contact)
  VALUES(?,?,?,'Approver',1,1)`).run(p.id,p.studioId,primary.id);
 return {project_id:p.id,studio_id:p.studioId,client_id:client.id};
}

export function projectClientId(db,studioId,projectId){return db.prepare('SELECT client_id FROM crm_project_relationships WHERE studio_id=? AND project_id=?').get(studioId,projectId)?.client_id||null;}
export function accountAccess(db,studioId,clientId,userId){return !!db.prepare(`SELECT 1 FROM crm_client_contacts cc JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id
 WHERE cc.studio_id=? AND cc.client_id=? AND cc.account_access=1 AND ct.user_id=?`).get(studioId,clientId,userId);}
export function projectAccess(db,studioId,projectId,userId){return db.prepare(`SELECT ps.role FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id
 WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1 AND ct.user_id=?
 ORDER BY CASE ps.role WHEN 'Approver' THEN 0 WHEN 'Collaborator' THEN 1 ELSE 2 END LIMIT 1`).get(studioId,projectId,userId)?.role||null;}
export function conversationAccess(db,c,userId){if(c.project_id){const assigned=db.prepare('SELECT 1 FROM studio_project_collaborators pc JOIN studio_staff ss ON ss.studio_id=pc.studio_id AND ss.user_id=pc.user_id WHERE pc.studio_id=? AND pc.project_id=? AND pc.user_id=?').get(c.studio_id,c.project_id,userId);return assigned?'Contributor':projectAccess(db,c.studio_id,c.project_id,userId);}return accountAccess(db,c.studio_id,c.client_id,userId)?'Approver':null;}

export function listClientContacts(db,studioId,clientId){return db.prepare(`SELECT ct.id,ct.name,ct.email,ct.phone,ct.organization_id AS organizationId,
 o.name AS organizationName,ct.user_id IS NOT NULL AS portalLinked,cc.role,cc.primary_contact AS isPrimary,
 cc.account_access AS accountAccess
 FROM crm_client_contacts cc JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id
 LEFT JOIN crm_organizations o ON o.id=ct.organization_id AND o.studio_id=ct.studio_id
 WHERE cc.studio_id=? AND cc.client_id=? ORDER BY cc.primary_contact DESC,ct.name`).all(studioId,clientId)
 .map(row=>({...row,portalLinked:!!row.portalLinked,isPrimary:!!row.isPrimary,accountAccess:!!row.accountAccess}));}
export function listStakeholders(db,studioId,projectId){return db.prepare(`SELECT ps.contact_id AS contactId,ct.name,ct.email,ps.role,ps.primary_contact AS isPrimary,
 ct.user_id IS NOT NULL AS portalLinked FROM crm_project_stakeholders ps
 JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id
 WHERE ps.studio_id=? AND ps.project_id=? ORDER BY ps.primary_contact DESC,ct.name`).all(studioId,projectId)
 .map(row=>({...row,isPrimary:!!row.isPrimary,portalLinked:!!row.portalLinked}));}

// Joined means the person accepted an invitation: their contact has a login that is a client of this studio.
// A lead from a public form or booking has portal access on paper but no login, so nothing reaches them yet.
const JOINED=`ct.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=ct.user_id AND m.studio_id=ct.studio_id AND m.role='client')`;
function audience(db,studioId,{projectId=null,clientId=null}){return projectId?db.prepare(`SELECT ct.id AS contactId,ct.name,ct.email,${JOINED} AS joined FROM crm_project_stakeholders ps
 JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1 ORDER BY ps.primary_contact DESC,ct.name`).all(studioId,projectId)
 :db.prepare(`SELECT ct.id AS contactId,ct.name,ct.email,${JOINED} AS joined FROM crm_client_contacts cc
 JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id WHERE cc.studio_id=? AND cc.client_id=? AND cc.account_access=1 ORDER BY cc.primary_contact DESC,ct.name`).all(studioId,clientId);}
/** Who would see a project or client conversation, and who of them has not joined yet (with whether an invitation is waiting). */
export function joinStatus(db,studioId,scope){
 const people=audience(db,studioId,scope);
 if(!people.length){const client=db.prepare('SELECT name,email FROM clients WHERE id=? AND studio_id=?').get(scope.projectId?projectClientId(db,studioId,scope.projectId):scope.clientId,studioId);if(client)people.push({contactId:null,name:client.name,email:client.email,joined:0});}
 const invited=db.prepare('SELECT 1 FROM invitations WHERE studio_id=? AND email=? AND used=0 AND expires>?');
 return {joined:people.some(p=>p.joined),waiting:people.filter(p=>!p.joined).map(p=>({contactId:p.contactId,name:p.name,email:p.email,invited:!!invited.get(studioId,p.email,Date.now())}))};
}
export function hasJoinedClient(db,studioId,projectId){return !!db.prepare(`SELECT 1 FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE ps.studio_id=? AND ps.project_id=? AND ps.portal_access=1 AND ${JOINED}`).get(studioId,projectId);}

export function bindInvitedContact(db,studioId,email,userId){
 for(const contact of db.prepare('SELECT id,user_id FROM crm_contacts WHERE studio_id=? AND email=?').all(studioId,email)){
  if(contact.user_id&&contact.user_id!==userId)fail(409,'This contact is already linked to another portal account.');
  db.prepare('UPDATE crm_contacts SET user_id=? WHERE id=? AND studio_id=?').run(userId,contact.id,studioId);
 }
}

/** A company typed on a client becomes their organisation: an existing one of that name is reused, otherwise one is created. A client already linked to an organisation keeps it. */
export function linkCompany(db,studioId,clientId,company){
 const name=String(company||'').trim();if(!name)return null;
 if(db.prepare('SELECT 1 FROM crm_client_organizations WHERE client_id=? AND studio_id=?').get(clientId,studioId))return null;
 let organization=db.prepare('SELECT id FROM crm_organizations WHERE studio_id=? AND lower(name)=lower(?) ORDER BY created_at LIMIT 1').get(studioId,name);
 if(!organization){organization={id:randomUUID()};const created=at();db.prepare('INSERT INTO crm_organizations VALUES(?,?,?,?,?,?)').run(organization.id,studioId,name,'',created,created);}
 db.prepare('INSERT INTO crm_client_organizations VALUES(?,?,?)').run(clientId,studioId,organization.id);
 db.prepare(`UPDATE crm_contacts SET organization_id=? WHERE studio_id=? AND organization_id IS NULL AND id IN (SELECT contact_id FROM crm_client_contacts WHERE studio_id=? AND client_id=? AND primary_contact=1)`).run(organization.id,studioId,studioId,clientId);
 return organization.id;
}
