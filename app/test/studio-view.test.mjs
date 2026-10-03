import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInGroup,approvedDirection,mediaFor,projectCover,pendingReviews,reviewRecords,recentDecisions} from '../src/lib/studio-view.js';
const studio={id:'studio-one'};
const approved={id:'v1',version:1,briefRevision:1,status:'Approved',title:'First direction',decidedBy:'Client',at:'2026-09-01T12:00:00Z',decidedAt:'2026-09-02T12:00:00Z'};
const project={id:'project-one',status:'Design',briefRevision:2,brief:{name:'Client'},inspiration:[],designs:[approved,{id:'v2',version:2,status:'Awaiting approval',briefRevision:2,at:'2026-09-03T12:00:00Z'}]};
test('review index preserves the earlier approved direction when a new version awaits approval',()=>{
 assert.equal(approvedDirection(project).id,'v1');
 assert.deepEqual(pendingReviews([project]).map(r=>r.design.id),['v2']);
 assert.equal(reviewRecords([project]).find(r=>r.design.id==='v1').current,false);
 assert.equal(recentDecisions([project])[0].designId,'v1');
 assert.equal(project.designs[0].status,'Approved');
});
test('review index identifies stale pending versions and retains archived decision history',()=>{
 assert.equal(pendingReviews([{...project,briefRevision:3}])[0].stale,true);
 assert.deepEqual(pendingReviews([{...project,status:'Archived'}]),[]);
 assert.equal(recentDecisions([{...project,status:'Archived'}]).length,1);
 const superseded={...project,designs:[{...project.designs[1],status:'Superseded'}, {...approved,id:'v3',version:3}]};
 assert.deepEqual(pendingReviews([superseded]),[]);
});
test('media resolves tenant-scoped uploaded images and does not invent a cover for a real empty project',()=>{
 const withFile={...project,inspiration:[{fileId:'image-one',mime:'image/png'},{fileId:'doc-one',mime:'application/pdf'}]};
 assert.equal(mediaFor(withFile,studio,{fileId:'image-one'}),'/api/projects/project-one/files/image-one?studio=studio-one');
 assert.equal(mediaFor(withFile,studio,{fileId:'doc-one'}),'');
 const sharedPrivate={fileId:'private-one',assets:[{fileId:'private-one',name:'Direction.png',mime:'image/png'}]};
 assert.equal(mediaFor(project,studio,sharedPrivate),'/api/projects/project-one/files/private-one?studio=studio-one');
 assert.equal(projectCover(project,studio),'');
 assert.equal(projectCover(withFile,studio),'/api/projects/project-one/files/image-one?studio=studio-one');
});


test('unaccepted enquiries stay discoverable but outside active delivery work',()=>{
 const enquiry={...project,status:'Enquiry',designs:[]};
 assert.equal(projectInGroup(enquiry,'Active'),false);assert.equal(projectInGroup(enquiry,'Enquiries'),true);
 assert.equal(projectInGroup({...enquiry,status:'Planning'},'Active'),true);assert.equal(projectInGroup({...enquiry,status:'Planning'},'Enquiries'),false);
 for(const status of ['Complete','Archived'])assert.equal(projectInGroup({...project,status},'Active'),false);
 assert.equal(projectInGroup(project,'Awaiting approval'),true);
});
