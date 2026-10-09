import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';

const origin='http://127.0.0.1:4320';
const later=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);

test('pipeline automations follow each event at once, without anyone opening Pipeline',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-pipeline-events-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,cookies={};
 async function call(route,body,who='owner'){
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  if(response.headers.get('set-cookie'))cookies[who]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,...await response.json()};
 }
 for(const [who,email] of [['owner','studio@example.test'],['client','amelia@example.test']])assert.equal((await call('/api/login',{email,password:'StudioDemo2026!'},who)).status,200);
 const studio=(await call('/api/me')).studios[0].id,suffix='?studio='+studio;
 await call('/api/billing-defaults'+suffix,{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:30,due:{type:'on_issue',days:0}},{label:'Balance',percent:70,due:{type:'days_before_event',days:14}}]});
 let p=(await call('/api/projects'+suffix,undefined,'client')).projects[0];const route='/api/projects/'+p.id,act=(action,body,who)=>call(route+'/'+action+suffix,body,who);
 const opportunity=()=>db.prepare('SELECT * FROM crm_opportunities WHERE project_id=?').get(p.id);
 const pipelineOpened=()=>db.prepare("SELECT COUNT(*) AS n FROM crm_pipeline_triggers").get().n;
 const holds=()=>JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data).operations?.holds||[];

 p=(await act('estimates',{title:'Studio fee',currency:'GBP',items:[{title:'Creative delivery',quantity:1,unitAmount:100000}],taxRate:0})).project;
 assert.equal(opportunity().stage,'Negotiation','sharing a quote moves the enquiry on straight away');
 assert.equal(opportunity().amount_minor,100000);
 const shared=await act('proposals',{title:'Project scope',scope:'Design and installation',delivery:'Install before the event',exclusions:'',expiresOn:later(30),estimateId:p.estimates.at(-1).id,briefRevision:p.briefRevision});
 assert.equal(shared.status,200);
 assert.equal(holds().at(-1)?.status,'Held','the date is held as soon as the proposal is shared');
 assert.ok(pipelineOpened()>0);

 // The client accepts: their quote is no longer waiting for a budget decision, and the follow-on items exist at once.
 const accepted=await act('proposal-response',{proposalId:shared.project.proposals.at(-1).id,decision:'accept',acknowledged:true},'client');
 assert.equal(accepted.status,200);
 assert.equal(accepted.project.estimates.at(-1).status,'Budget confirmed','the client is not asked to confirm a budget they accepted');
 const plan=(await call(`${route}/invoices/plan${suffix}`)).plan;
 assert.ok(plan,'the payment plan is ready');
 const task=()=>db.prepare("SELECT completed FROM crm_tasks WHERE opportunity_id=? AND title='Issue the deposit invoice'").get(opportunity().id);
 assert.equal(task()?.completed,0,'the deposit task is waiting');

 // The studio issues the deposit from the plan, then records it as paid.
 const issued=await call(`${route}/invoices/plan${suffix}`,{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London'});
 assert.equal(issued.status,201);
 assert.equal(task().completed,1,'issuing the deposit ticks off its task');
 const invoice=issued.invoice;
 assert.equal((await call(`${route}/invoices/${invoice.id}/payments${suffix}`,{amountMinor:invoice.amountMinor,method:'bank_transfer',receivedAt:new Date().toISOString().slice(0,10)})).status,200);
 assert.equal(holds().at(-1).status,'Confirmed','the paid deposit confirms the date');
 assert.equal(opportunity().stage,'Won');
});
