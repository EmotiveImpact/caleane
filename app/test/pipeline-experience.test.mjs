import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';
import {attentionFor,stageLabelsFor,opportunityTotals,sortByAttention} from '../src/lib/pipeline.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?view=pipeline',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','history','sessionStorage','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType='mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};
const compiled=fileURLToPath(new URL(`.pipeline-experience-${process.pid}.mjs`,import.meta.url));
const output=await build({entryPoints:[fileURLToPath(new URL('../src/components/PipelineCRM.jsx',import.meta.url))],bundle:true,packages:'external',format:'esm',platform:'node',write:false,plugins:[{name:'omit-css',setup(builder){builder.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
await writeFile(compiled,output.outputFiles[0].text);const {PipelineCRM}=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(cleanup);after(async()=>{await unlink(compiled);dom.window.close();});
const studio={id:'s',name:'Sample studio',branding:{profession:'floral-design'}};
const base={id:'o1',clientId:'c1',clientName:'Amelia',title:'Wedding flowers',description:'Ivory flowers.',stage:'Discovery',amountMinor:0,currency:'GBP',probability:20,expectedClose:'',lostReason:'',source:'Website',revision:1,activities:[],tasks:[],projectId:'p1'};
function fixture({stale=false,count=1,intake=null,pipeline=null}={}){
 let opportunity={...structuredClone(base),...(intake?{intake,formName:intake.formName,projectStatus:'Enquiry',needsReview:true}: {})},tasks=[];const writes=[],opened=[];
 const request=async(path,method,body)=>{
  if(method==='PATCH'&&path.startsWith('/api/opportunities/')){writes.push({path,body});if(stale&&writes.length===2)throw Error('This opportunity changed while you were editing. Refresh and try again.');assert.equal(body.revision,opportunity.revision);opportunity={...opportunity,...body,revision:opportunity.revision+1};return {opportunity:{...opportunity,tasks}};}
  if(method==='POST'&&path.includes('/review?')){writes.push({path,body});assert.equal(body.revision,opportunity.revision);opportunity={...opportunity,reviewedAt:body.reviewed?'2026-10-03T12:00:00Z':null,reviewedBy:'Sophie',needsReview:!body.reviewed,revision:opportunity.revision+1};return {opportunity:{...opportunity,tasks}};}
  if(method==='POST'&&path.startsWith('/api/opportunities')){writes.push({path,body});opportunity={...base,...body,clientName:'Amelia'};return {opportunity};}
  if(method==='POST'&&path.startsWith('/api/crm/tasks')){writes.push({path,body});const task={id:'t1',...body,completed:false};tasks=[...tasks,task];return {task};}
  if(method==='PATCH'&&path.startsWith('/api/crm/tasks/')){tasks=tasks.map(t=>({...t,...body}));return {task:tasks[0]};}
  if(path.startsWith('/api/opportunities/o1'))return {opportunity:{...opportunity,tasks}};
  if(path.startsWith('/api/opportunities'))return {opportunities:count===1?[opportunity]:Array.from({length:count},(_,i)=>({...opportunity,id:'o'+(i+1),title:'Enquiry '+String(i+1).padStart(2,'0'),stage:i%2?'Qualified':'Discovery'}))};
  if(path.startsWith('/api/clients'))return {clients:[{id:'c1',name:'Amelia'}]};
  if(path.startsWith('/api/crm/tasks'))return {tasks};
  if(path.startsWith('/api/task-workspace'))return {assignments:{'crm:t1':'Sophie'}};
  if(pipeline&&path.startsWith('/api/pipeline'))return pipeline;
  if(pipeline&&path.startsWith('/api/catalogue'))return {items:[{id:'i1',name:'Bridal bouquet',unitAmount:28500,currency:'GBP',unit:'each',archived:false}]};
  if(pipeline&&method==='POST'&&path.startsWith('/api/projects/p1/estimates')){writes.push({path,body});return {project:{id:'p1'}};}
  throw Error('Unexpected request '+path);
 };
 render(h(PipelineCRM,{studio,request,run:fn=>fn(),openClient:id=>opened.push(['client',id]),openProject:(p,tab)=>opened.push(['project',p.id,tab]),openTask:id=>opened.push(['task',id]),onProjectCreated(){}}));return {writes,opened};
}
async function choose(input,label,option){await input.click(screen.getByRole('combobox',{name:label,exact:true}));await input.click(screen.getByRole('option',{name:option,exact:true}));}

test('attention only includes open enquiries with actionable missing/due steps; currencies remain separate',()=>{
 const opportunities=['missing','future','overdue','undated','today','closed'].map((id,i)=>({...base,id,title:id,stage:id==='closed'?'Won':'Discovery',currency:i%2?'USD':'GBP',amountMinor:i?10000:0}));
 const tasks=[{opportunityId:'future',title:'Call',dueDate:'2026-10-10'},{opportunityId:'overdue',title:'Call',dueDate:'2026-10-01'},{opportunityId:'today',title:'Call',dueDate:'2026-10-03'},{opportunityId:'undated',title:'Call',dueDate:''},{opportunityId:'missing',title:'Done',dueDate:'2026-10-01',completed:true}];
 assert.equal(attentionFor(opportunities[1],tasks,'2026-10-03'),null);assert.equal(attentionFor(opportunities[5],tasks,'2026-10-03'),null);
 assert.deepEqual(sortByAttention(opportunities.slice(0,5),tasks,'2026-10-03').map(o=>o.id),['overdue','today','undated','missing','future']);
 assert.deepEqual(opportunityTotals(opportunities),[['USD',20000],['GBP',20000]]);
 assert.equal(stageLabelsFor(studio).Proposal,'Preparing quote');assert.equal(stageLabelsFor({branding:{profession:'interior-design'}}).Qualified,'Consultation');
});

test('drawer prioritises follow-ups and persisted stage change can be undone with latest revision',async()=>{
 const input=user(),{writes}=fixture();await input.click(await screen.findByRole('button',{name:'View Wedding flowers'}));
 await screen.findByRole('heading',{name:'Next steps'});assert.equal(screen.queryByRole('textbox',{name:'Enquiry title'}),null);
 await choose(input,'Enquiry status','Awaiting decision');await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].body.stage,'Negotiation');
 await input.click(screen.getByRole('button',{name:'Undo',exact:true}));await waitFor(()=>assert.equal(writes.length,2));assert.equal(writes[1].body.stage,'Discovery');assert.equal(writes[1].body.revision,2);
});

test('adding a dated follow-up removes enquiry from attention, supports assignment route and completing restores attention',async()=>{
 const input=user(),{writes,opened}=fixture();await input.click(await screen.findByRole('button',{name:'View Wedding flowers'}));await screen.findByRole('heading',{name:'Next steps'});
 await input.click(screen.getByRole('button',{name:'Follow-up',exact:true}));assert.equal(screen.getByRole('textbox',{name:'Next step'}).value,'Follow up with Amelia');
 await input.type(screen.getByLabelText('Follow-up date'),'2099-10-10');await input.click(screen.getByRole('button',{name:'Add step'}));
 await screen.findByRole('button',{name:'Complete Follow up with Amelia'});assert.equal(writes[0].body.clientId,'c1');assert.equal(writes[0].body.opportunityId,'o1');assert.equal(writes[0].body.dueDate,'2099-10-10');
 await input.click(screen.getByRole('button',{name:'Edit',exact:true}));assert.deepEqual(opened,[['task','t1']]);
 await input.click(screen.getByRole('button',{name:'Complete Follow up with Amelia'}));await screen.findByText('1 completed steps');
 await input.click(screen.getByRole('button',{name:'Close enquiry'}));assert.ok(await screen.findByRole('button',{name:'View Wedding flowers'}));
});

test('not proceeding requires an explanation and keeps project accessible; Undo restores previous stage',async()=>{
 const input=user(),{writes}=fixture();await input.click(await screen.findByRole('button',{name:'View Wedding flowers'}));await screen.findByRole('heading',{name:'Next steps'});
 await choose(input,'Enquiry status','Not proceeding');assert.ok(screen.getByRole('dialog',{name:'Not proceeding'}));assert.equal(writes.length,0);
 await input.type(screen.getByRole('textbox',{name:'Reason',exact:true}),'Dates changed');await input.click(screen.getByRole('button',{name:'Mark as not proceeding'}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog',{name:'Not proceeding'}),null));assert.equal(writes[0].body.lostReason,'Dates changed');assert.ok(screen.getByRole('button',{name:'Open project brief',exact:true}));
 await input.click(screen.getByRole('button',{name:'Undo',exact:true}));await waitFor(()=>assert.equal(writes.length,2));assert.equal(writes[1].body.stage,'Discovery');
});

test('stale Undo surfaces conflict and cannot report success or overwrite another edit',async()=>{
 const input=user(),{writes}=fixture({stale:true});await input.click(await screen.findByRole('button',{name:'View Wedding flowers'}));await screen.findByRole('heading',{name:'Next steps'});
 await choose(input,'Enquiry status','Confirmed');await input.click(await screen.findByRole('button',{name:'Undo',exact:true}));
 await waitFor(()=>assert.match(screen.getByRole('alert').textContent,/changed while you were editing/));assert.equal(writes.length,2);assert.equal(screen.queryByText('Stage change undone.'),null);
});


test('new enquiry needs only a client and title, preserves optional defaults and opens the saved record',async()=>{
 const input=user(),{writes}=fixture();await screen.findByRole('button',{name:'View Wedding flowers'});await input.click(screen.getByRole('button',{name:'New enquiry',exact:true}));
 await choose(input,'Client','Amelia');await input.type(screen.getByRole('textbox',{name:'Enquiry',exact:true}),'Summer flowers');await input.click(screen.getByRole('button',{name:'Create enquiry',exact:true}));
 await screen.findByRole('heading',{name:'Next steps'});assert.equal(writes[0].body.title,'Summer flowers');assert.equal(writes[0].body.stage,'Discovery');assert.equal(writes[0].body.currency,'GBP');assert.equal(writes[0].body.amountMinor,0);
});

test('board provides every open stage and editor keeps commercial data separate from project navigation',async()=>{
 const input=user(),{opened}=fixture();await screen.findByRole('button',{name:'View Wedding flowers'});await input.click(screen.getByRole('radio',{name:'Board',exact:true}));
 assert.ok(screen.getByRole('heading',{name:'Preparing quote',exact:true}));assert.ok(screen.getByRole('heading',{name:'Awaiting decision',exact:true}));
 await input.click(screen.getByRole('button',{name:'View Wedding flowers'}));await screen.findByRole('heading',{name:'Next steps'});await input.click(screen.getByRole('button',{name:'Prepare quote'}));assert.deepEqual(opened,[['project','p1','Estimate']]);
 await input.click(screen.getByRole('button',{name:'Edit details'}));assert.ok(screen.getByRole('textbox',{name:'Enquiry title'}));assert.equal(screen.queryByRole('heading',{name:'Next steps'}),null);
});


test('pagination bounds displayed records, preserves stage grouping and resets with filters or page size',async()=>{
 const input=user();fixture({count:53});await screen.findByText('1–25 of 53 enquiries');
 assert.equal(screen.getAllByRole('button',{name:/^View Enquiry /}).length,25);
 const firstPage=screen.getAllByRole('button',{name:/^View Enquiry /}).map(e=>e.getAttribute('aria-label'));
 await input.click(screen.getByRole('button',{name:'Next',exact:true}));await screen.findByText('26–50 of 53 enquiries');
 assert.equal(screen.getAllByRole('button',{name:/^View Enquiry /}).length,25);assert.ok(screen.getAllByRole('button',{name:/^View Enquiry /}).every(e=>!firstPage.includes(e.getAttribute('aria-label'))));
 await choose(input,'Enquiries per page','10 rows');await screen.findByText('1–10 of 53 enquiries');
 await input.click(screen.getByRole('button',{name:'Next',exact:true}));await screen.findByText('11–20 of 53 enquiries');
 await choose(input,'Enquiry stage','Discussing the brief');await screen.findByText('1–10 of 26 enquiries');assert.equal(screen.getByRole('button',{name:'Previous',exact:true}).disabled,true);
 await input.click(screen.getByRole('radio',{name:'All enquiries',exact:true}));await choose(input,'Enquiry stage','Open enquiries');await screen.findByText('1–10 of 53 enquiries');
 assert.ok(screen.getByRole('heading',{name:'New enquiry',exact:true}));assert.equal(screen.queryByRole('heading',{name:'Discussing the brief',exact:true}),null,'a page slices the grouped sequence, rather than regrouping unrelated chunks');
 await input.click(screen.getByRole('radio',{name:'Board',exact:true}));assert.equal(screen.queryByRole('navigation',{name:'Enquiry pagination'}),null);assert.equal(screen.getAllByRole('button',{name:/^View Enquiry /}).length,53);
});


test('submitted request is available in context; review is explicit, preserves stage and the conversation stays project scoped',async()=>{
 const intake={formName:'Interior consultation',version:2,submittedAt:'2026-10-03T10:00:00Z',original:true,brief:{name:'Amelia',email:'amelia@example.test',workflowType:'interior-design',occasion:'A single room',date:'2027-04-10',venue:'London',vision:'A calm space for reading.',budget:'£8,000',details:{spaces:'Living room',constraints:'Keep the bookshelves'},intakeAnswers:[{label:'Natural light',value:'South facing',applicable:true},{label:'Hidden answer',value:'Private hidden response',applicable:false}]}};
 const input=user(),{writes,opened}=fixture({intake});await screen.findByRole('heading',{name:'New enquiries to review'});
 await input.click(screen.getByRole('button',{name:'View Wedding flowers'}));await screen.findByRole('heading',{name:'Their request'});
 assert.equal(writes.length,0,'opening does not mark the enquiry reviewed');assert.ok(screen.getByText('A calm space for reading.'));assert.ok(screen.getByText('Client budget'));assert.ok(screen.getByText('£8,000'));
 await input.click(screen.getByText('View original submission'));assert.ok(screen.getByText('Keep the bookshelves'));assert.ok(screen.getByText('South facing'));assert.equal(screen.queryByText('Private hidden response'),null);
 assert.equal(screen.getByRole('button',{name:'Start planning'}).disabled,true);
 await input.click(screen.getByRole('button',{name:'Mark reviewed',exact:true}));await screen.findByText(/Reviewed by Sophie/);
 assert.equal(writes[0].body.reviewed,true);assert.equal(writes[0].body.stage,undefined);assert.equal(screen.getByRole('button',{name:'Start planning'}).disabled,false);
 await input.click(screen.getByRole('button',{name:'Open conversation',exact:true}));assert.deepEqual(opened,[['project','p1','Conversation']]);
 await input.click(screen.getByRole('button',{name:'Mark for review',exact:true}));await screen.findByRole('button',{name:'Mark reviewed',exact:true});assert.equal(writes[1].body.revision,2);assert.equal(writes[1].body.reviewed,false);
});

test('board keeps every stage reachable on small screens and the enquiry drives its own quote',async()=>{
 const signal={opportunityId:'o1',projectId:'p1',eventDate:'2027-06-12',venue:'Bath',estimate:null,proposal:null,hold:null,deposit:null,fit:[{kind:'date',ok:false,label:'12 Jun is fully booked'}],flags:[{kind:'clash',tone:'bad',label:'Date full',rank:1}]};
 const pipeline={settings:{dailyCapacity:1},dates:[],insights:null,signals:{o1:signal}};
 const input=user(),{writes}=fixture({pipeline});
 await screen.findByText('Date full');
 assert.ok(screen.getByRole('heading',{name:'Needs a decision from you'}),'a date clash is surfaced in Today');
 await input.click(screen.getByRole('radio',{name:'Board'}));
 const strip=screen.getByRole('group',{name:'Pipeline stages'});
 assert.equal(within(strip).getByRole('button',{name:/New enquiry/}).getAttribute('aria-pressed'),'true');
 await input.click(screen.getByRole('button',{name:'Next stage'}));
 assert.equal(within(strip).getByRole('button',{name:/Discussing the brief/}).getAttribute('aria-pressed'),'true');
 await input.selectOptions(screen.getByRole('combobox',{name:'Move Amelia to'}),'Qualified');
 await waitFor(()=>assert.equal(writes.at(-1).body.stage,'Qualified'),'cards can move without dragging');
 await input.click(screen.getByRole('button',{name:'View Wedding flowers'}));
 const deal=await screen.findByRole('region',{name:'Quote and booking'});
 assert.match(deal.textContent,/already fully booked/);
 await input.click(within(deal).getByRole('button',{name:'Build quote'}));
 await input.selectOptions(await screen.findByRole('combobox',{name:'Add from your price list'}),'i1');
 await input.click(screen.getByRole('button',{name:'Add line'}));
 assert.equal(screen.getByRole('textbox',{name:'Line 1 description'}).value,'Bridal bouquet');
 await input.click(screen.getByRole('button',{name:'Share quote'}));
 await waitFor(()=>assert.ok(writes.some(w=>w.path.startsWith('/api/projects/p1/estimates'))));
 const quote=writes.find(w=>w.path.startsWith('/api/projects/p1/estimates')).body;
 assert.deepEqual(quote.items,[{title:'Bridal bouquet',quantity:1,unitAmount:28500}]);assert.equal(quote.currency,'GBP');
});
