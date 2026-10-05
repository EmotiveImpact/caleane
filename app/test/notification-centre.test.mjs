import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkspace} from '../server.mjs';
import {notificationCentre,readNotifications} from '../notification-centre.mjs';
import {saveProject,event,appendConversationMessage,openStore} from '../store.mjs';
const stamp=()=>new Date().toISOString();
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'caleane-notification-')),file=join(dir,'db.sqlite'),app=await createWorkspace({dbFile:file,demo:true,disableExternalServices:true});
 t.after(async()=>{app.server.emit('close');app.db?.close();await rm(dir,{recursive:true,force:true});});
 const db=app.db;db.exec('DELETE FROM conversation_message_details; DELETE FROM conversation_reads; DELETE FROM conversation_messages;');
 const studio=db.prepare("SELECT id FROM studios WHERE slug='nay-decor'").get(),owner=db.prepare("SELECT * FROM users WHERE email='studio@example.test'").get(),client=db.prepare("SELECT * FROM users WHERE email='amelia@example.test'").get();
 const p=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studio.id).map(r=>JSON.parse(r.data)).find(p=>p.clientEmail===client.email);
 const args={studioId:studio.id,userId:owner.id},clientArgs={...args,userId:client.id};
 // Fresh isolated source records make history assertions independent of seed age.
 for(const row of db.prepare('SELECT data FROM projects').all()){const data=JSON.parse(row.data);data.activity=[];data.designs=[];data.estimates=[];data.proposals=[];data.messages=[];data.tasks=[];saveProject(db,data);}
 p.activity=[];p.designs=[];p.estimates=[];p.proposals=[];p.messages=[];p.tasks=[];p.status='Planning';saveProject(db,p);
 return {app,db,file,p,owner,client,args,clientArgs,studioId:studio.id,feed:(options)=>notificationCentre(db,args,options),clientFeed:options=>notificationCentre(db,clientArgs,options)};
}
function update(db,p,actor,text){event(p,actor,text);saveProject(db,p);}

test('personal history deduplicates, survives reopening, and reading leaves work unresolved',async t=>{
 const f=await fixture(t),{db,p,owner,client,args}=f;update(db,p,client,'Requested a brief update');update(db,p,owner,'Private studio edit');
 let feed=f.feed();assert.equal(feed.updates.length,1);assert.equal(feed.updates[0].label,'Requested a brief update');const entry=feed.updates[0];
 readNotifications(db,args,{action:'read',id:entry.id,read:true});assert.equal(f.feed().unreadCount,0);const saved=f.feed({filter:'all'}).updates[0];assert.ok(saved.readAt);assert.equal(f.feed().total,0);
 p.activity[1].text='Changed source text';saveProject(db,p);assert.equal(f.feed({filter:'all'}).updates[0].label,entry.label,'materialized history is immutable');
 db.close();f.app.db=null;const reopened=openStore(f.file);try{assert.equal(notificationCentre(reopened,args,{filter:'all'}).updates[0].readAt,saved.readAt);readNotifications(reopened,args,{action:'read',id:entry.id,read:false});assert.equal(notificationCentre(reopened,args).unreadCount,1);}finally{reopened.close();}
});

test('mark all read respects the viewed watermark and unread pagination clamps after reads',async t=>{
 const {db,p,client,args,feed}=await fixture(t);
 for(let n=0;n<28;n++)update(db,p,client,'Shared update '+n);
 const first=feed();assert.equal(first.total,28);assert.equal(first.updates.length,25);assert.equal(feed({offset:25}).updates.length,3);
 update(db,p,client,'Arrived while reading');feed();readNotifications(db,args,{action:'read-all',through:first.watermark});
 const remaining=feed({offset:25});assert.equal(remaining.unreadCount,1);assert.equal(remaining.offset,0);assert.equal(remaining.updates[0].label,'Arrived while reading');assert.equal(feed({filter:'all'}).total,29);
});

test('incoming messages link to the exact conversation and notification reads do not read messages',async t=>{
 const {db,p,owner,client,args,feed,studioId}=await fixture(t),c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id);
 const message=appendConversationMessage(db,c,client,'client','A private sample message');
 const entries=feed().updates.filter(x=>x.kind==='message');assert.ok(entries.some(x=>x.destination.projectId===p.id&&x.destination.tab==='Conversation'));
 assert.equal(feed().updates.filter(x=>x.label==='Added a message').length,0,'message activity is not duplicated');
 readNotifications(db,args,{action:'read-all',through:feed().watermark});assert.ok(feed().actions.some(x=>x.kind==='message'));assert.equal(db.prepare('SELECT 1 FROM conversation_reads WHERE user_id=? AND conversation_id=?').get(owner.id,c.id),undefined);
 const id='general-thread';db.prepare('INSERT INTO conversations(id,studio_id,client_id,subject,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,studioId,c.client_id,'Materials',stamp(),stamp());
 const general=db.prepare('SELECT * FROM conversations WHERE id=?').get(id);appendConversationMessage(db,general,client,'client','Can we discuss samples?');
 assert.deepEqual(feed().updates.find(x=>x.context==='Materials').destination,{type:'conversation',clientId:c.client_id,conversationId:id});assert.ok(message);
});

test('private activity and drafts stay private; current permissions govern persisted history',async t=>{
 const {db,p,owner,clientArgs,clientFeed,feed}=await fixture(t);update(db,p,{id:'someone-else',name:owner.name},'Private studio notes');assert.equal(feed().updates.length,1,'same display name is not identity');
 p.designs.push({id:'shared',title:'Shared direction',at:stamp(),status:'Awaiting approval',briefRevision:p.briefRevision});p.estimates.push({id:'draft',title:'Private estimate',status:'Draft',at:stamp()},{id:'issued',title:'Client estimate',status:'Awaiting review',at:stamp()});saveProject(db,p);
 let seen=clientFeed({filter:'all'});assert.equal(seen.updates.length,2);assert.equal(seen.updates.some(x=>x.label==='Private studio notes'),false);assert.equal(seen.updates.some(x=>x.detail==='Private estimate'),false);
 const financial=seen.updates.find(x=>x.detail==='Client estimate');const contact=db.prepare('SELECT id FROM crm_contacts WHERE user_id=? AND studio_id=?').get(clientArgs.userId,clientArgs.studioId);
 db.prepare("UPDATE crm_project_stakeholders SET role='Viewer' WHERE contact_id=? AND project_id=?").run(contact.id,p.id);
 seen=clientFeed({filter:'all'});assert.equal(seen.updates.length,1);assert.equal(seen.actions.some(x=>['estimate','invoice'].includes(x.kind)),false);assert.throws(()=>readNotifications(db,clientArgs,{action:'read',id:financial.id,read:true}),{status:404});
 const design=seen.updates[0];db.prepare('UPDATE crm_project_stakeholders SET portal_access=0 WHERE contact_id=? AND project_id=?').run(contact.id,p.id);
 assert.equal(clientFeed({filter:'all'}).updates.length,0);assert.throws(()=>readNotifications(db,clientArgs,{action:'read',id:design.id,read:true}),{status:404});
});

test('enquiry review and task completion are independent of notification read state',async t=>{
 const {db,p,client,args,feed,studioId}=await fixture(t);p.status='Enquiry';p.tasks=[{id:'due-task',title:'Call the venue',assignee:'studio',due:'2000-01-01',completed:false},{id:'future',title:'Future task',assignee:'studio',due:'2099-01-01',completed:false}];update(db,p,client,'New enquiry received');
 const first=feed(),enquiry=first.actions.find(x=>x.kind==='enquiry'),task=first.actions.find(x=>x.label==='Call the venue');assert.equal(enquiry.destination.type,'opportunity');assert.equal(task.destination.taskId,'project:'+p.id+':due-task');assert.equal(first.actions.some(x=>x.label==='Future task'),false);
 readNotifications(db,args,{action:'read-all',through:first.watermark});assert.ok(feed().actions.find(x=>x.id===enquiry.id));assert.ok(feed().actions.find(x=>x.id===task.id));
 db.prepare('INSERT INTO crm_enquiry_reviews VALUES(?,?,?,?)').run(enquiry.destination.opportunityId,studioId,stamp(),'Studio');p.tasks[0].completed=true;saveProject(db,p);assert.equal(feed().actions.some(x=>x.id===enquiry.id||x.id===task.id),false);
});

test('an older unpaid invoice remains actionable even when the latest invoice is paid',async t=>{
 const {db,p,owner,args,feed,studioId}=await fixture(t);
 for(const [id,date] of [['old','2026-01-01'],['new','2026-02-01']])db.prepare("INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,payment_instructions,snapshot,issued_at,issued_by) VALUES(?,?,?,?,?,1,'Full','GBP',1000,1000,0,0,'','Bank','{}',?,?)").run(id,studioId,p.id,id,'estimate',date,owner.name);
 db.prepare("INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,received_at,recorded_at,recorded_by) VALUES('paid',?,?,1000,'bank_transfer',?,?,?)").run(studioId,'new',stamp(),stamp(),owner.name);
 assert.equal(feed().actions.find(x=>x.kind==='invoice').destination.invoiceId,'old');assert.equal(notificationCentre(db,args).actions.filter(x=>x.kind==='invoice').length,1);
});

test('invalid requests and cross-recipient history access are rejected',async t=>{
 const {db,p,client,args,clientArgs,feed}=await fixture(t);update(db,p,client,'A client update');const item=feed().updates[0];
 for(const options of [{filter:'invalid'},{offset:-1},{offset:1.5}])assert.throws(()=>notificationCentre(db,args,options),{status:400});
 for(const body of [null,[],{action:'read-all'},{action:'read-all',through:-1},{action:'read',id:item.id,read:'true'},{action:'delete'}])assert.throws(()=>readNotifications(db,args,body),{status:400});
 assert.throws(()=>readNotifications(db,clientArgs,{action:'read',id:item.id,read:true}),{status:404});assert.throws(()=>notificationCentre(db,{...args,studioId:'other-studio'}),{status:403});assert.throws(()=>notificationCentre(db,{...args,userId:'other-person'}),{status:403});
});

test('authenticated API enforces studio access, persists read state and rejects unsupported methods',async t=>{
 const {app,p,db,client,studioId}=await fixture(t);update(db,p,client,'API update');await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.server.close(resolve)));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='';const call=async(method='GET',body,query='?studio='+studioId)=>{const response=await fetch(base+'/api/notification-centre'+query,{method,headers:{Origin:'http://127.0.0.1:4320',Cookie:cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 assert.equal((await call()).status,401);const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4320','Content-Type':'application/json'},body:JSON.stringify({email:'studio@example.test',password:'StudioDemo2026!'})});cookie=login.headers.get('set-cookie').split(';')[0];
 let result=await call();assert.equal(result.status,200);assert.equal(result.data.unreadCount,1);assert.equal((await call('POST',{action:'read',id:result.data.updates[0].id,read:true})).status,200);assert.equal((await call()).data.unreadCount,0);assert.equal((await call('GET',null,'?studio=other')).status,403);assert.equal((await call('PATCH',{})).status,405);
});

test('assigned studio contributors receive only accessible project messages; removal hides history',async t=>{
 const {db,p,owner,client,studioId}=await fixture(t);const staff={id:'staff-user',name:'Studio colleague'};db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(staff.id,'staff@example.test',staff.name,'unused');
 db.prepare("INSERT INTO studio_staff VALUES(?,?,'viewer',?)").run(staff.id,studioId,stamp());db.prepare('INSERT INTO studio_project_collaborators VALUES(?,?,?,?,?)').run(staff.id,studioId,p.id,stamp(),owner.id);
 update(db,p,client,'Private client finance response');const c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id);appendConversationMessage(db,c,client,'client','Project question');
 const args={studioId,userId:staff.id},feed=notificationCentre(db,args);assert.equal(feed.updates.length,1);assert.equal(feed.updates[0].destination.tab,'Messages');assert.equal(feed.actions.length,1);assert.equal(feed.actions[0].destination.tab,'Messages');
 db.prepare('DELETE FROM studio_project_collaborators WHERE user_id=? AND project_id=?').run(staff.id,p.id);assert.equal(notificationCentre(db,args,{filter:'all'}).total,0);assert.throws(()=>readNotifications(db,args,{action:'read',id:feed.updates[0].id,read:true}),{status:404});
});
