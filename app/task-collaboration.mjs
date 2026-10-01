import {id,now} from './store.mjs';
import {projectAccess} from './relationships.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(v,n)=>{if(typeof v!=='string'||v.length>n)fail(400,'Check the task details.');return v.trim();};
export function installTaskCollaboration(db){db.exec(`CREATE TABLE IF NOT EXISTS task_collaboration(studio_id TEXT NOT NULL,task_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(studio_id,task_key)); CREATE TABLE IF NOT EXISTS task_attachments(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,task_key TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL);`);}
function assignees(db,studioId,projectId){return [...db.prepare("SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.studio_id=? AND m.role='owner'").all(studioId),...(projectId?db.prepare('SELECT u.id,u.name FROM studio_project_collaborators c JOIN studio_staff s ON s.user_id=c.user_id AND s.studio_id=c.studio_id JOIN users u ON u.id=c.user_id WHERE c.studio_id=? AND c.project_id=?').all(studioId,projectId):[])];}
export async function handleTaskCollaboration({db,req,res,url,route,body,user,studio,owner,staffViewer,reply}){
 if(route!=='/api/task-workspace'&&!route.startsWith('/api/task-workspace/'))return false;
 installTaskCollaboration(db);
 if(route==='/api/task-workspace'){
  if(!owner)fail(403,'Only the studio owner can list private task assignments.');if(req.method!=='GET')fail(405,'Method not allowed.');
  const assignments={};for(const row of db.prepare('SELECT task_key,data FROM task_collaboration WHERE studio_id=?').all(studio.id)){const d=JSON.parse(row.data),parts=row.task_key.split(':');if(d.assigneeId){const person=assignees(db,studio.id,parts[0]==='project'?parts[1]:null).find(p=>p.id===d.assigneeId);if(person)assignments[row.task_key]=person.name;}}
  reply(200,{assignments});return true;
 }
 const match=route.match(/^\/api\/task-workspace\/(project|crm)\/([a-f0-9-]+)(?:\/files\/([a-f0-9-]+))?$/);if(!match)fail(404,'Task not found.');
 const [,kind,taskId,fileId]=match,projectId=kind==='project'?url.searchParams.get('project'):null,key=kind+':'+(projectId?projectId+':':'')+taskId;
 let task,access='Owner';
 if(kind==='project'){
  const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studio.id);if(!row)fail(404,'Task not found.');
  task=JSON.parse(row.data).tasks?.find(t=>t.id===taskId);access=owner?'Owner':staffViewer?(db.prepare('SELECT 1 FROM studio_project_collaborators WHERE studio_id=? AND project_id=? AND user_id=?').get(studio.id,projectId,user.id)?'Contributor':null):projectAccess(db,studio.id,projectId,user.id);
 }else{if(!owner)fail(403,'Private follow-ups are only available to the studio owner.');task=db.prepare('SELECT * FROM crm_tasks WHERE id=? AND studio_id=?').get(taskId,studio.id);}
 if(!task||!access)fail(404,'Task not found.');
 const state=JSON.parse(db.prepare('SELECT data FROM task_collaboration WHERE studio_id=? AND task_key=?').get(studio.id,key)?.data||'{"assigneeId":"","comments":[],"files":[]}');
 if(fileId){if(req.method!=='GET')fail(405,'Method not allowed.');const file=db.prepare('SELECT * FROM task_attachments WHERE id=? AND studio_id=? AND task_key=?').get(fileId,studio.id,key);if(!file)fail(404,'File not found.');res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(Buffer.from(file.content));return true;}
 const people=assignees(db,studio.id,projectId);
 if(req.method==='POST'){
  if(access==='Viewer')fail(403,'This participant has view-only access.');
  if(body.action==='assign'){
   if(!owner)fail(403,'Only the studio owner can assign a task.');const selected=text(body.assigneeId||'',100);if(selected&&!people.some(p=>p.id===selected))fail(400,'Choose a team member with access to this project.');if(kind==='project'&&task.assignee==='client'&&selected)fail(400,'Change responsibility to Studio before assigning a team member.');state.assigneeId=selected;
  }else if(body.action==='comment'){
   const content=text(body.text,4000);if(!content)fail(400,'Write a comment first.');state.comments.push({id:id(),text:content,by:user.name,userId:user.id,at:now()});
  }else if(body.action==='file'){
   const name=text(body.name,180),encoded=text(body.content,8400000),data=Buffer.from(encoded,'base64');if(!name||data.length<12||data.length>6000000)fail(400,'Choose a file smaller than 6 MB.');let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use PNG, JPG, WebP or PDF.');const fid=id();db.prepare('INSERT INTO task_attachments VALUES(?,?,?,?,?,?)').run(fid,studio.id,key,name,mime,data);state.files.push({id:fid,name,mime,size:data.length,by:user.name,at:now()});
  }else fail(400,'Choose a task action.');
  db.prepare('INSERT INTO task_collaboration VALUES(?,?,?) ON CONFLICT(studio_id,task_key) DO UPDATE SET data=excluded.data').run(studio.id,key,JSON.stringify(state));
 }else if(req.method!=='GET')fail(405,'Method not allowed.');
 reply(200,{...state,assigneeName:people.find(p=>p.id===state.assigneeId)?.name||'',assignees:owner?people:[],canAssign:owner,canContribute:access!=='Viewer'});return true;
}
