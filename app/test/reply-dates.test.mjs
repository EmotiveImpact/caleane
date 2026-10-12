import test from 'node:test';
import assert from 'node:assert/strict';
import {earliestOpenDay} from '../store.mjs';
import {attentionFor} from '../src/lib/attention.js';
import {todayISO} from '../src/lib/dates.js';

test('a reply-by date stays open on the server until that day has ended in every time zone',()=>{
 // 04:00 UTC on 10 Oct is still 9 Oct evening in Los Angeles, so 9 Oct is open.
 assert.equal(earliestOpenDay(Date.parse('2026-10-10T04:00:00Z')),'2026-10-09');
 // By midday UTC on 10 Oct, 9 Oct has ended at UTC-12 too.
 assert.equal(earliestOpenDay(Date.parse('2026-10-10T12:00:00Z')),'2026-10-10');
});

test('proposal attention uses the viewer’s own calendar day',()=>{
 const today=todayISO(),project={id:'p',status:'Planning',briefRevision:1,brief:{},changeRequests:[],designs:[],unreadMessages:0,accessRole:'Approver',proposals:[{status:'Awaiting response',briefRevision:1,expiresOn:today,title:'Proposal'}]};
 assert.equal(attentionFor(project,false).some(item=>item.kind==='proposal'),true,'a proposal due today is still open');
 assert.equal(attentionFor(project,true).some(item=>item.kind==='proposal-update'),false);
});
