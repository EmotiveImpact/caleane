import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionFor} from '../src/lib/attention.js';
const project={id:'p',status:'Enquiry',briefRevision:2,brief:{occasion:'Wedding'},changeRequests:[],designs:[],unreadMessages:0};
test('attention identifies the right person and destination for each decision',()=>{
 assert.equal(attentionFor(project,true)[0].tab,'Brief');
 assert.equal(attentionFor({...project,enquiryReviewedAt:'2026-10-03T12:00:00Z'},true).some(i=>i.kind==='enquiry'),false,'reviewed enquiries leave the global review queue');
 assert.equal(attentionFor(project,false).length,0);
 const review={...project,status:'Design',designs:[{status:'Awaiting approval',briefRevision:2,title:'New concept'}]};
 assert.equal(attentionFor(review,false)[0].kind,'approval');
 assert.equal(attentionFor({...review,briefRevision:3},false).length,0);
 assert.equal(attentionFor({...review,briefRevision:3},true)[0].kind,'stale');
 assert.equal(attentionFor({...project,status:'Complete',unreadMessages:4},true).length,0);
 assert.equal(attentionFor({...project,status:'Planning',unreadMessages:2},true)[0].tab,'Conversation');
 assert.equal(attentionFor({...project,changeRequests:[{status:'Pending'}]},true)[0].kind,'brief');
});
