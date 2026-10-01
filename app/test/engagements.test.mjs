import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore,id,makeProject,insertProject,saveProject} from '../store.mjs';
import {installEngagements,changeEngagements,getEngagements,projectCalendar} from '../engagements.mjs';
test('agreements retain exact accepted terms and reject stale, expired and unauthorized responses; resource conflicts and calendar visibility are scoped',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-engagements-')),db=openStore(path.join(dir,'test.sqlite'));installEngagements(db);
 const studioId=id(),ownerId=id(),clientId=id(),otherStudio=id();
 try{
 for(const [sid,slug] of [[studioId,'one'],[otherStudio,'two']])db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(sid,slug,slug,'#181925','[]');
 for(const [uid,email,name,role] of [[ownerId,'owner@example.test','Owner','owner'],[clientId,'client@example.test','Client','client']]){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(uid,email,name,'unused');db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(uid,studioId,role);}
 const project=makeProject(studioId,{name:'Client',email:'client@example.test',occasion:'Flowers',workflowType:'floral-design',date:'2099-02-01'},{name:'Owner'});insertProject(db,project);db.prepare('UPDATE crm_contacts SET user_id=? WHERE studio_id=? AND email=?').run(clientId,studioId,'client@example.test');
 const args={studioId,projectId:project.id,userId:ownerId},edit=(action,body,userId=ownerId)=>changeEngagements(db,{...args,userId,action,body}),read=(userId=ownerId)=>getEngagements(db,{...args,userId}),reject=(f,status)=>assert.throws(f,e=>e.status===status);
 const rich=edit('create-agreement',{title:'Rich draft',termsHtml:'<h2>Scope</h2><p onclick="bad()">Flowers <strong>only</strong><script>alert(1)</script><img src="https://bad.test/x"></p>',expiresOn:'2099-01-01'}).agreements[0];
 assert.ok(rich.termsHtml.includes('<strong>only</strong>'));assert.ok(!/script|onclick|img/.test(rich.termsHtml));
 const revised=edit('update-agreement',{...rich,termsHtml:'<h2>Revised scope</h2><p>Approved formatting</p>'}).agreements[0];
 assert.equal(revised.revision,2);reject(()=>edit('update-agreement',{...rich,termsHtml:'<p>Stale</p>'}),409);
 const issuedRich=edit('issue-agreement',revised).agreements[0];reject(()=>edit('update-agreement',{...issuedRich,termsHtml:'<p>Rewritten</p>'}),409);
 assert.ok(read(clientId).agreements.find(x=>x.id===rich.id).termsHtml.includes('Revised scope'));
 let a=edit('create-agreement',{title:'Service terms',terms:'Exact agreed work. No substitutions.',expiresOn:'2099-01-01'}).agreements[0];
 assert.ok(!read(clientId).agreements.some(x=>x.id===a.id));reject(()=>edit('issue-agreement',a,clientId),403);reject(()=>getEngagements(db,{...args,studioId:otherStudio}),404);
 a=edit('issue-agreement',a).agreements[0];assert.equal(a.digest.length,64);
 reject(()=>edit('respond-agreement',{...a,decision:'accept',signerName:'Client',consent:false},clientId),400);
 reject(()=>edit('respond-agreement',{...a,revision:0,decision:'accept',signerName:'Client',consent:true},clientId),409);
 a=edit('respond-agreement',{...a,decision:'accept',signerName:'Client',consent:true},clientId).agreements[0];assert.equal(a.status,'Accepted');assert.equal(a.response.digest,a.digest);reject(()=>edit('withdraw-agreement',{...a,reason:'Rewrite'}),409);
 let newer=edit('create-agreement',{title:'New terms',terms:'Replacement terms',expiresOn:'2099-01-01'}).agreements[0];newer=edit('issue-agreement',newer).agreements[0];project.briefRevision++;saveProject(db,project);reject(()=>edit('respond-agreement',{...newer,decision:'decline'},clientId),409);
 let exp=edit('create-agreement',{title:'Expiry',terms:'Time limited',expiresOn:'2099-01-01'}).agreements[0];exp=edit('issue-agreement',exp).agreements[0];exp.expiresOn='2000-01-01';db.prepare('UPDATE project_agreements SET data=? WHERE id=?').run(JSON.stringify(exp),exp.id);reject(()=>edit('respond-agreement',{...exp,decision:'decline'},clientId),409);
 const base={title:'Private room',resource:'The Hall',kind:'Venue',startDate:'2099-02-01',endDate:'2099-02-02',status:'Tentative',shared:false,note:'Private margin'};
 let b=edit('save-booking',base).bookings[0];reject(()=>edit('save-booking',{...base,resource:'the hall'}),409);reject(()=>edit('save-booking',{...b,status:'Confirmed'}),400);reject(()=>edit('save-booking',{...b,revision:0}),409);reject(()=>edit('save-booking',base,clientId),403);
 assert.equal(read(clientId).bookings.length,0);assert.ok(!projectCalendar(db,{...args,userId:clientId}).includes('Private room'));
 b=edit('save-booking',{...b,title:'Room, A; B\nC',status:'Confirmed',confirmation:'EMAIL-42',shared:true}).bookings[0];assert.equal(b.history.length,1);assert.equal(read(clientId).bookings[0].confirmation,undefined);assert.equal(read(clientId).bookings[0].note,undefined);
 const ics=projectCalendar(db,{...args,userId:clientId});assert.ok(ics.includes('DTEND;VALUE=DATE:20990203'));assert.ok(ics.includes('Room\\, A\\; B\\nC'));assert.ok(!ics.includes('Private margin'));
 edit('save-booking',{...b,status:'Cancelled'});edit('save-booking',base);assert.equal(read().bookings.length,2);assert.equal(read().agreements.find(x=>x.id===a.id).terms,'Exact agreed work. No substitutions.');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
