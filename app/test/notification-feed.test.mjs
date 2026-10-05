import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
test('notifications persist per person, respect project access and keep read state',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-notifications-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function call(route,method='GET',body,actor='',headers={}){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookies[actor]?{Cookie:cookies[actor]}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&actor)cookies[actor]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 const feed=async(actor,extra='')=>(await call('/api/notifications'+q+extra,'GET',undefined,actor)).data;
 let q='';
 try{
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner')).status,200);
  assert.equal((await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client')).status,200);
  const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0].id;q=`?studio=${studio}`;
  const project=(await call('/api/projects'+q,'GET',undefined,'owner')).data.projects.find(p=>p.clientEmail==='amelia@example.test');
  assert.equal((await call('/api/notifications'+q)).status,401);
  assert.deepEqual(await feed('owner'),{notifications:[],unread:0,unreadByKind:{enquiry:0,message:0,project_update:0,task_assigned:0,follow_up:0},nextCursor:null},'existing records do not create a backlog');

  assert.equal((await call(`/api/projects/${project.id}/messages${q}`,'POST',{text:'Could we add more candles?'},'client')).status,200);
  let owner=await feed('owner');
  assert.equal(owner.unread,1);assert.equal(owner.notifications[0].kind,'message');
  assert.equal(owner.notifications[0].title,'Amelia Taylor: Could we add more candles?');
  assert.equal(owner.notifications[0].projectId,project.id);assert.ok(owner.notifications[0].conversationId);
  assert.equal((await feed('client')).unread,0,'people are not notified about their own messages');

  assert.equal((await call(`/api/projects/${project.id}/status${q}`,'POST',{status:'Planning'},'owner')).status,200);
  let client=await feed('client');
  assert.equal(client.unread,1);assert.equal(client.notifications[0].kind,'project_update');
  assert.equal(client.notifications[0].title,'Moved project to planning');assert.equal(client.notifications[0].actorName,'NAY Studio');
  assert.equal((await feed('owner')).unread,1,'owner actions do not notify the owner');

  const enquiry={name:'Priya Patel',email:'priya@example.test',occasion:'Anniversary dinner',date:'2027-09-04'};
  assert.equal((await call('/api/public/nay-decor/enquiries','POST',enquiry,'',{'Idempotency-Key':'notify-enquiry'})).status,201);
  assert.equal((await call('/api/public/nay-decor/enquiries','POST',enquiry,'',{'Idempotency-Key':'notify-enquiry'})).status,200);
  owner=await feed('owner');
  assert.equal(owner.unread,2,'a repeated submission does not notify twice');
  assert.deepEqual(owner.unreadByKind,{enquiry:1,message:1,project_update:0,task_assigned:0,follow_up:0});
  const enquiryNote=owner.notifications.find(n=>n.kind==='enquiry');
  assert.equal(enquiryNote.title,'New enquiry from Priya Patel');assert.equal(enquiryNote.detail,'Anniversary dinner · 4 Sept 2027');
  assert.ok(enquiryNote.opportunityId&&enquiryNote.clientId);
  assert.ok(!(await feed('client')).notifications.some(n=>n.kind==='enquiry'),'clients never receive studio enquiries');

  // Read state belongs to the recipient.
  assert.equal((await call('/api/notifications/read'+q,'POST',{ids:[enquiryNote.id]},'client')).status,200);
  assert.equal((await feed('owner')).unread,2,'another person cannot mark my notifications as read');
  assert.equal((await call('/api/notifications/read'+q,'POST',{ids:'all'},'owner')).status,400);
  let marked=await call('/api/notifications/read'+q,'POST',{ids:[enquiryNote.id]},'owner');
  assert.equal(marked.data.unread,1);assert.equal(marked.data.notifications.find(n=>n.id===enquiryNote.id).read,true);
  marked=await call('/api/notifications/unread'+q,'POST',{ids:[enquiryNote.id]},'owner');assert.equal(marked.data.unread,2);
  marked=await call('/api/notifications/read'+q,'POST',{all:true},'owner');assert.equal(marked.data.unread,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notification_events WHERE read_at IS NULL AND user_id=(SELECT id FROM users WHERE email=?)').get('studio@example.test').n,0);

  // Paging is stable and newest first.
  const first=await feed('owner','&limit=1');
  assert.equal(first.notifications.length,1);assert.ok(first.nextCursor);
  const second=await feed('owner','&limit=1&before='+encodeURIComponent(first.nextCursor));
  assert.equal(second.notifications.length,1);assert.notEqual(second.notifications[0].id,first.notifications[0].id);
  assert.ok(second.notifications[0].createdAt<=first.notifications[0].createdAt);
  assert.equal((await call('/api/notifications'+q+'&before=nonsense','GET',undefined,'owner')).status,400);

  // Contributors hear about chat and their own assignments, not project activity.
  const invite=await call('/api/staff'+q,'POST',{email:'assistant-notify@example.test'},'owner');
  assert.equal((await call('/api/staff-invitations/claim','POST',{token:new URL(invite.data.url).hash.slice(1),name:'Studio Assistant',password:'StudioAssistant2026!'},'staff')).status,200);
  const member=(await call('/api/staff'+q,'GET',undefined,'owner')).data.members[0],grant=`/api/staff/${member.id}/projects/${project.id}${q}`;
  assert.equal((await call(grant,'PATCH',{enabled:true},'owner')).status,200);
  const withTask=(await call(`/api/projects/${project.id}/tasks${q}`,'POST',{title:'Measure the entrance',assignee:'studio',due:'2027-05-01'},'owner')).data.project;
  const task=withTask.tasks.find(t=>t.title==='Measure the entrance');
  const endpoint=`/api/task-workspace/project/${task.id}${q}&project=${project.id}`;
  assert.equal((await call(endpoint,'POST',{action:'assign',assigneeId:member.id},'owner')).status,200);
  assert.equal((await call(endpoint,'POST',{action:'assign',assigneeId:member.id},'owner')).status,200);
  assert.equal((await call(`/api/projects/${project.id}/messages${q}`,'POST',{text:'Delivery is at nine.'},'owner')).status,200);
  let staff=await feed('staff');
  assert.deepEqual(staff.notifications.map(n=>n.kind),['message','task_assigned'],'unchanged assignments do not repeat');
  assert.equal(staff.notifications[1].title,'NAY Studio assigned you: Measure the entrance');
  assert.equal(staff.notifications[1].taskId,`project:${project.id}:${task.id}`,'matches the Tasks deep link format');
  assert.ok(!staff.notifications.some(n=>n.kind==='project_update'));
  assert.equal((await feed('client')).notifications[0].title,'NAY Studio: Delivery is at nine.');

  // Removing access removes the history from view without deleting it.
  assert.equal((await call(grant,'PATCH',{enabled:false},'owner')).status,200);
  staff=await feed('staff');
  assert.deepEqual(staff,{notifications:[],unread:0,unreadByKind:{enquiry:0,message:0,project_update:0,task_assigned:0,follow_up:0},nextCursor:null});
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notification_events WHERE user_id=?").get(member.id).n>=2);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});
 }
});
