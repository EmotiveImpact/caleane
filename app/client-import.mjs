import {id,now,transaction} from './store.mjs';
import {ensurePrimaryContact,linkCompany} from './relationships.mjs';
import {fieldDefinitions} from './custom-fields.mjs';
import {IMPORT_STAGES,MAX_IMPORT_ROWS,reviewImport} from './src/lib/client-import.js';

// Import clients in one go from a mapped CSV. Rows with a problem are skipped
// and reported back; every other row becomes a client record with its primary
// contact, exactly as if it had been added by hand.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};

export function importClients(db,{studioId,rows,stage='Active',tag='',fileName='',by='Studio'}){
 if(!Array.isArray(rows)||!rows.length)fail(400,'Choose a file with at least one client.');
 if(rows.length>MAX_IMPORT_ROWS)fail(400,`Import up to ${MAX_IMPORT_ROWS.toLocaleString('en-GB')} clients at a time. Split the file and import the rest next.`);
 if(!IMPORT_STAGES.some(s=>s.value===stage))fail(400,'Choose a relationship stage for these clients.');
 if(typeof tag!=='string'||tag.length>50||typeof fileName!=='string')fail(400,'Check the tag for these clients.');
 const extraTag=tag.replace(/\s+/g,' ').trim(),source=('Imported'+(fileName?` from ${fileName.trim()}`:'')).slice(0,200);
 const existingEmails=db.prepare('SELECT email FROM clients WHERE studio_id=?').all(studioId).map(r=>r.email);
 const reviewed=reviewImport(rows,{existingEmails,customFields:fieldDefinitions(db,studioId).client});
 const created=[],skipped=[];
 transaction(db,()=>{
  for(const {client:c,problem,row} of reviewed){
   if(problem){skipped.push({row,email:c.email,name:c.name,reason:problem});continue;}
   const tags=extraTag&&!c.tags.some(t=>t.toLowerCase()===extraTag.toLowerCase())?[...c.tags.slice(0,19),extraTag]:c.tags,at=now();
   const data={company:c.company,phone:c.phone,stage,source,tags,customFields:c.fields,notes:c.note?[{id:id(),text:c.note,by,at}]:[],followUp:'',importedAt:at,createdAt:at,updatedAt:at};
   const clientId=id();
   db.prepare('INSERT INTO clients VALUES(?,?,?,?,?)').run(clientId,studioId,c.email,c.name,JSON.stringify(data));
   ensurePrimaryContact(db,db.prepare('SELECT * FROM clients WHERE id=?').get(clientId));
   linkCompany(db,studioId,clientId,c.company);
   created.push(clientId);
  }
 });
 return {created,skipped};
}

export function handleClientImport({db,req,route,body,studio,owner,user,reply,clientDTO,rate}){
 if(route!=='/api/clients/import')return false;
 if(!owner)fail(403,'Only the studio owner can import clients.');
 if(req.method!=='POST')fail(405,'Method not allowed.');
 rate(req,'client-import',20);
 const result=importClients(db,{studioId:studio.id,rows:body.rows,stage:body.stage,tag:body.tag??'',fileName:body.fileName??'',by:user.name});
 const clients=result.created.map(cid=>clientDTO(db.prepare('SELECT * FROM clients WHERE id=?').get(cid)));
 return reply(201,{clients,skipped:result.skipped}),true;
}
