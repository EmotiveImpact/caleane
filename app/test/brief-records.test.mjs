import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';
import {valueText,briefChanges,versionAuthor,versionWritten,openChangeRequests} from '../src/lib/brief-view.js';
import {createWorkspace} from '../server.mjs';

// Brief change requests and brief history must read clearly whatever shape a stored value has.
const dom=setupDom();
const {module:ui,remove}=await bundle("export {BriefChangeRequests,BriefHistory} from './src/components/BriefRecords.jsx'; export {SectionBoundary} from './src/components/SectionBoundary.jsx';",'brief-records');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const workflow={id:'event-styling',date:'Event date',place:'Venue / setting'};
const base={name:'Amelia Taylor',occasion:'Wedding',venue:'A London townhouse',date:'2027-06-12',vision:'Candlelight',colours:['Ivory','Sage'],customColours:'',budget:'',pinterest:'',workflowType:'event-styling',details:{guestCount:'',styledAreas:''},intakeAnswers:[]};

test('any stored value becomes readable text',()=>{
 assert.equal(valueText(80),'80');assert.equal(valueText(['Tables','Entrance']),'Tables, Entrance');assert.equal(valueText(true),'Yes');assert.equal(valueText(null),'');
 assert.equal(valueText({guestCount:80,styledAreas:['Tables']}),'Guest count: 80 · Styled areas: Tables');
});
test('a change to guest count and styled areas is listed by field label with the earlier wording',()=>{
 const changes=briefChanges(base,{...base,details:{guestCount:80,styledAreas:['Tables','Entrance']}},workflow);
 assert.deepEqual(changes.map(c=>[c.label,c.was,c.now]),[['Approximate guest count','','80'],['What should be styled?','','Tables, Entrance']]);
 assert.deepEqual(briefChanges(base,base,workflow),[]);
});
test('older versions credit the person who wrote them, not the person who replaced them',()=>{
 const history=[{revision:2,by:'Amelia Taylor',at:'2026-10-03'},{revision:1,by:'NAY Studio',at:'2026-10-02'}];
 assert.equal(versionAuthor(history,history[0]),'NAY Studio');assert.equal(versionAuthor(history,history[1],'Amelia Taylor'),'Amelia Taylor');
 assert.equal(versionAuthor(history,{revision:3,author:'Studio Owner'}),'Studio Owner');
 assert.equal(versionWritten(history,history[0],'2026-10-01'),'2026-10-02');assert.equal(versionWritten(history,history[1],'2026-10-01'),'2026-10-01');
 assert.deepEqual(openChangeRequests([{status:'Declined'},{status:'Pending'},null]).length,1);
});
test('open requests can be accepted or declined; settled and outdated ones are not offered again',async()=>{
 const calls=[],mutate=async(action,body)=>{calls.push([action,body]);return {};};
 const p={brief:base,briefRevision:2,changeRequests:[
  {id:'c1',status:'Pending',baseRevision:2,by:'Amelia Taylor',at:'2026-10-09',brief:{...base,details:{guestCount:80,styledAreas:['Tables','Entrance'],extra:{note:'Long tables'}}}},
  {id:'c2',status:'Pending',baseRevision:1,by:'Amelia Taylor',at:'2026-10-08',brief:{...base,venue:'Kew Gardens'}},
  {id:'c3',status:'Declined',baseRevision:1,by:'Amelia Taylor',at:'2026-10-07',brief:{...base,details:{guestCount:{min:60,max:90}}}}
 ]};
 const view=render(h(ui.BriefChangeRequests,{p,workflow,owner:true,busy:false,mutate}));
 const [current,outdated]=view.container.querySelectorAll('article');
 assert.equal(view.container.querySelectorAll('article').length,2);
 assert.match(current.textContent,/Approximate guest count80Was: Not specified/);assert.match(current.textContent,/What should be styled\?Tables, EntranceWas: Not specified/);assert.match(current.textContent,/Note: Long tables/);
 assert.match(outdated.textContent,/The brief has changed since/);assert.equal(within(outdated).queryByRole('button',{name:'Accept update'}),null);
 assert.match(screen.getByRole('list').textContent,/Declined · requested by Amelia Taylor/);
 const input=userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
 await input.click(within(current).getByRole('button',{name:'Accept update'}));await input.click(within(outdated).getByRole('button',{name:'Decline'}));
 await input.type(within(outdated).getByRole('textbox'),'The venue is already booked.');await input.click(within(outdated).getByRole('button',{name:'Decline request'}));
 assert.deepEqual(calls,[['changes',{changeId:'c1',decision:'accept'}],['changes',{changeId:'c2',decision:'decline',note:'The venue is already booked.'}]]);
 cleanup();render(h(ui.BriefChangeRequests,{p,workflow,owner:false,busy:false,mutate}));
 assert.equal(screen.queryAllByRole('button').length,0);assert.equal(screen.getAllByText('Waiting for the studio to review.').length,2);
});
test('brief history reads like the brief and names the right author',()=>{
 const p={createdAt:'2026-10-01',activity:[{text:'Updated the brief',actor:'NAY Studio'},{text:'Submitted the first brief',actor:'Amelia Taylor'}],briefHistory:[{revision:2,brief:{...base,venue:'Kew Gardens'},at:'2026-10-05',by:'Amelia Taylor'},{revision:1,brief:base,at:'2026-10-03',by:'NAY Studio'}]};
 const view=render(h(ui.BriefHistory,{p,workflow}));
 const [v2,v1]=view.container.querySelectorAll('details');
 assert.match(v2.textContent,/Written by NAY Studio/);assert.match(v2.textContent,/Changed: Venue \/ setting/);assert.match(v2.textContent,/Venue \/ settingKew Gardens/);
 assert.match(v1.textContent,/Written by Amelia Taylor/);assert.doesNotMatch(view.container.textContent,/[{}"]/);
});
test('one unreadable value shows a note in that section instead of a blank page',()=>{
 const original=console.error;console.error=()=>{};
 try{const Broken=()=>{throw new Error('bad value');};render(h(ui.SectionBoundary,{resetKey:'a'},h(Broken)));assert.match(screen.getByRole('alert').textContent,/This section could not be shown/);}
 finally{console.error=original;}
});
test('declined requests stay settled and an accepted request credits the client who asked for it',async()=>{
 const origin='http://127.0.0.1:4320',dir=await mkdtemp(path.join(os.tmpdir(),'brief-records-'));
 const {server}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+server.address().port,cookies={};
 const call=async(route,method,body,who)=>{const r=await fetch(root+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});const c=r.headers.get('set-cookie');if(c)cookies[who]=c.split(';')[0];return {status:r.status,data:await r.json()};};
 try{
  await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
  const studio=(await call('/api/me','GET',null,'client')).data.studios[0].id,q='?studio='+studio;
  let p=(await call('/api/projects'+q,'GET',null,'client')).data.projects[0];const route='/api/projects/'+p.id;
  p=(await call(route+'/approval'+q,'POST',{designId:p.designs.at(-1).id,decision:'approve'},'client')).data.project;assert.equal(p.briefLocked,true);
  p=(await call(route+'/brief'+q,'POST',{revision:p.briefRevision,brief:{...p.brief,details:{guestCount:'80',styledAreas:'Tables and entrance'}}},'client')).data.project;
  p=(await call(route+'/brief'+q,'POST',{revision:p.briefRevision,note:'My aunt offered her garden.',brief:{...p.brief,venue:'Kew Gardens'}},'client')).data.project;
  const [venue,guests]=p.changeRequests;assert.equal(venue.note,'My aunt offered her garden.','the client can say why');
  p=(await call(route+'/changes'+q,'POST',{changeId:venue.id,decision:'decline',note:'The townhouse deposit is already paid.'},'owner')).data.project;
  assert.equal(p.changeRequests.find(c=>c.id===venue.id).response,'The townhouse deposit is already paid.','the studio can say why not');
  assert.deepEqual(openChangeRequests(p.changeRequests).map(c=>c.id),[guests.id]);
  assert.equal((await call(route+'/changes'+q,'POST',{changeId:venue.id,decision:'accept'},'owner')).status,409);
  p=(await call(route+'/changes'+q,'POST',{changeId:guests.id,decision:'accept'},'owner')).data.project;
  assert.equal(p.brief.details.guestCount,'80');assert.equal(openChangeRequests(p.changeRequests).length,0);
  p=(await call(route+'/brief'+q,'POST',{revision:p.briefRevision,brief:{...p.brief,venue:'The Orangery'}},'owner')).data.project;
  assert.equal(versionAuthor(p.briefHistory,p.briefHistory[0]),'Amelia Taylor');assert.equal(p.briefHistory[0].by,'NAY Studio');
 }finally{server.close();await rm(dir,{recursive:true,force:true});}
});
