import test from 'node:test';
import assert from 'node:assert/strict';
import {weekFollowUps} from '../src/lib/follow-ups.js';

test('this week’s follow-ups bring Pipeline, client and task follow-ups together, soonest first',()=>{
 const today='2026-10-09';
 const list=weekFollowUps({
  pipeline:[{opportunityId:'o1',clientId:'c1',clientName:'Olivia Chen',date:'2026-10-12',step:1,steps:3},{opportunityId:'o2',clientId:'c2',clientName:'Later Lead',date:'2026-10-20',step:2,steps:3}],
  clients:[{id:'c3',name:'Zara Audit',followUp:'2026-10-08',followUpNote:'Send mood board'},{id:'c4',name:'No date'}],
  tasks:[{id:'t1',title:'Call Olivia about florals',clientName:'Olivia Chen',dueDate:'2026-10-10'},{id:'t2',title:'Due today',dueDate:today},{id:'t3',title:'Done',dueDate:'2026-10-11',completed:true}],
 },today);
 assert.deepEqual(list.map(f=>[f.kind,f.name,f.date]),[['client','Zara Audit','2026-10-08'],['task','Olivia Chen','2026-10-10'],['pipeline','Olivia Chen','2026-10-12']]);
 assert.equal(list[2].note,'Proposal follow-up 1 of 3');assert.equal(list[1].note,'Call Olivia about florals');
});
