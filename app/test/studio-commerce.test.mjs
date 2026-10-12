import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {runReminders} from '../reminders.mjs';
import {localToUtc,availableSlots} from '../consultations.mjs';

const origin='http://127.0.0.1:4320';
const addDays=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);

async function workspace(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-commerce-'));
 const ws=await createWorkspace({dbFile:path.join(dir,'workspace.sqlite'),origin,demo:true,reminderIntervalMs:0});
 await new Promise(resolve=>ws.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${ws.server.address().port}`,cookies={};
 async function call(route,method='GET',body,who='',headers={}){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{Cookie:cookies[who]}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const cookie=response.headers.get('set-cookie');if(cookie&&who)cookies[who]=cookie.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 t.after(async()=>{await new Promise(resolve=>ws.server.close(resolve));ws.db.close();await rm(dir,{recursive:true,force:true});});
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'},'owner');
 await call('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'},'client');
 const studio=(await call('/api/me','GET',undefined,'owner')).data.studios[0];
 const suffix=`?studio=${studio.id}`;
 const project=(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(item=>item.clientEmail==='amelia@example.test');
 return {ws,call,studio,suffix,project};
}

async function confirmEstimate(call,suffix,project,total=100000){
 let response=await call(`/api/projects/${project.id}/estimates${suffix}`,'POST',{title:'Scope',currency:'GBP',items:[{title:'Styling',quantity:1,unitAmount:total}],taxRate:0},'owner');
 assert.equal(response.status,200);
 const estimate=response.data.project.estimates.at(-1);
 response=await call(`/api/projects/${project.id}/estimate-decision${suffix}`,'POST',{estimateId:estimate.id,decision:'confirm'},'client');
 assert.equal(response.status,200);return estimate;
}

test('price list, templates and billing defaults are owner-only studio libraries',async t=>{
 const {call,suffix}=await workspace(t);
 assert.equal((await call('/api/catalogue'+suffix,'GET',undefined,'client')).status,403);
 let response=await call('/api/catalogue'+suffix,'POST',{action:'create',item:{name:'Balloon arch',description:'Organic garland',category:'Installations',unitAmount:45000,currency:'GBP',unit:'each'}},'owner');
 assert.equal(response.status,200);assert.equal(response.data.items[0].name,'Balloon arch');
 assert.equal((await call('/api/catalogue'+suffix,'POST',{action:'create',item:{name:'',unitAmount:10}},'owner')).status,400);
 response=await call('/api/catalogue'+suffix,'POST',{action:'archive',id:response.data.items[0].id},'owner');
 assert.equal(response.data.items[0].archived,true);

 response=await call('/api/message-templates'+suffix,'GET',undefined,'owner');
 assert.ok(response.data.templates.length>=4);assert.ok(response.data.placeholders.includes('client_first_name'));
 const first=response.data.templates[0];
 response=await call('/api/message-templates'+suffix,'POST',{action:'delete',id:first.id},'owner');
 assert.ok(!response.data.templates.some(item=>item.id===first.id),'deleted defaults are not seeded again');

 assert.equal((await call('/api/billing-defaults'+suffix,'POST',{plan:[{label:'Deposit',percent:40,due:{type:'on_issue',days:0}}]},'owner')).status,400);
 response=await call('/api/billing-defaults'+suffix,'POST',{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer, reference the invoice number.',paymentTermsDays:14,plan:[{label:'Deposit',percent:25,due:{type:'on_issue',days:0}},{label:'Second payment',percent:25,due:{type:'days_after_confirm',days:30}},{label:'Balance',percent:50,due:{type:'days_before_event',days:14}}]},'owner');
 assert.equal(response.status,200);assert.equal(response.data.defaults.plan.length,3);
 assert.equal(response.data.defaults.currency,'GBP');assert.equal(response.data.defaults.taxRate,0);
 response=await call('/api/billing-defaults'+suffix,'POST',{...response.data.defaults,currency:'EUR',taxRate:21},'owner');
 assert.equal(response.status,200);assert.equal(response.data.defaults.currency,'EUR');assert.equal(response.data.defaults.taxRate,21);
 assert.equal((await call('/api/billing-defaults'+suffix,'POST',{...response.data.defaults,currency:'JPY'},'owner')).status,400);
 assert.equal((await call('/api/billing-defaults'+suffix,'POST',{...response.data.defaults,taxRate:150},'owner')).status,400);
});

test('payment plans issue scheduled invoices, and refunds with credit notes settle them',async t=>{
 const {call,suffix,project}=await workspace(t);
 await call('/api/billing-defaults'+suffix,'POST',{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:30,due:{type:'on_issue',days:0}},{label:'Instalment',percent:30,due:{type:'days_after_confirm',days:30}},{label:'Balance',percent:40,due:{type:'days_before_event',days:14}}]},'owner');
 const route=`/api/projects/${project.id}/invoices`;
 assert.equal((await call(route+'/plan'+suffix,'POST',{action:'create'},'owner')).status,409,'a plan needs a confirmed estimate');
 await confirmEstimate(call,suffix,project,100001);
 let response=await call(route+'/plan'+suffix,'POST',{action:'create'},'owner');
 assert.equal(response.status,200);
 let plan=response.data.plan;
 assert.deepEqual(plan.steps.map(step=>step.amountMinor),[30000,30000,40001]);
 assert.equal((await call(route+'/plan'+suffix,'POST',{action:'create'},'client')).status,403);
 assert.equal((await call(route+'/plan'+suffix,'GET',undefined,'client')).data.plan.steps.length,3,'the approver can see the schedule');
 assert.equal((await call(route+'/plan'+suffix,'POST',{action:'update',revision:plan.revision,steps:plan.steps.map(step=>({...step,amountMinor:1}))},'owner')).status,400);
 assert.equal((await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[1].id,customerAddress:'Client Street'},'owner')).status,409,'payments are issued in order');
 assert.equal((await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[0].id},'owner')).status,400,'the client address is still required');
 response=await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.status,201,JSON.stringify(response.data));
 const deposit=response.data.invoice;
 assert.equal(deposit.kind,'Deposit');assert.equal(deposit.amountMinor,30000);assert.equal(deposit.snapshot.sellerAddress,'1 Studio Lane, London','saved studio details fill the invoice');
 response=await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[1].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.status,201,JSON.stringify(response.data));assert.equal(response.data.invoice.kind,'Deposit');assert.equal(response.data.invoice.label,'Instalment');
 response=await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[2].id,customerAddress:'Client Street, London'},'owner');
 assert.equal(response.data.invoice.kind,'Balance');assert.equal(response.data.invoice.amountMinor,40001);
 assert.ok(response.data.plan.steps.every(step=>step.invoice));

 // Pay the deposit, then refund part of it with a credit note.
 const today=new Date().toISOString().slice(0,10);
 response=await call(`${route}/${deposit.id}/payments${suffix}`,'POST',{amountMinor:30000,method:'bank_transfer',receivedAt:today},'owner');
 assert.equal(response.data.invoice.status,'Paid');
 assert.equal((await call(`${route}/${deposit.id}/cancel${suffix}`,'POST',{reason:'Changed plans'},'owner')).status,409);
 assert.equal((await call(`${route}/${deposit.id}/refunds${suffix}`,'POST',{amountMinor:40000,method:'bank_transfer',refundedAt:today,creditNote:true,reason:'Too much'},'owner')).status,400);
 assert.equal((await call(`${route}/${deposit.id}/refunds${suffix}`,'POST',{amountMinor:5000,method:'bank_transfer',refundedAt:today,creditNote:true,reason:'Reduced scope'},'client')).status,403);
 response=await call(`${route}/${deposit.id}/refunds${suffix}`,'POST',{amountMinor:10000,method:'bank_transfer',refundedAt:today,creditNote:true,reason:'Reduced scope'},'owner');
 assert.equal(response.status,200);
 let invoice=response.data.invoice;
 assert.equal(invoice.status,'Partly refunded');assert.equal(invoice.dueMinor,20000);assert.equal(invoice.paidMinor,20000);assert.equal(invoice.balanceMinor,0);
 assert.match(invoice.credits[0].number,/^CN-\d{4}-0001$/);
 response=await call(`${route}/${deposit.id}/refunds${suffix}`,'POST',{amountMinor:20000,method:'bank_transfer',refundedAt:today,creditNote:true,reason:'Event cancelled'},'owner');
 invoice=response.data.invoice;
 assert.equal(invoice.status,'Refunded');assert.equal(invoice.balanceMinor,0);assert.equal(invoice.refundedMinor,30000);
 // A credit note on its own reduces what the client owes.
 const instalment=(await call(route+suffix,'GET',undefined,'owner')).data.invoices.find(item=>item.label==='Instalment');
 response=await call(`${route}/${instalment.id}/credit-notes${suffix}`,'POST',{amountMinor:30000,reason:'Removed the second installation'},'owner');
 assert.equal(response.data.invoice.status,'Credited');assert.equal(response.data.invoice.balanceMinor,0);
 assert.equal((await call(`${route}/${instalment.id}/payments${suffix}`,'POST',{amountMinor:100,method:'bank_transfer',receivedAt:today},'owner')).status,409);
 // The client sees the adjusted record.
 const seen=(await call(route+suffix,'GET',undefined,'client')).data.invoices.find(item=>item.id===deposit.id);
 assert.equal(seen.status,'Refunded');
});

test('automatic reminders message the client once and create owner follow-ups for planned payments',async t=>{
 const {ws,call,suffix,project,studio}=await workspace(t);
 const route=`/api/projects/${project.id}/invoices`;
 await confirmEstimate(call,suffix,project,50000);
 let response=await call(route+suffix,'POST',{estimateId:(await call('/api/projects'+suffix,'GET',undefined,'owner')).data.projects.find(p=>p.id===project.id).estimates.at(-1).id,kind:'Deposit',amountMinor:10000,dueDate:addDays(2),supplyDate:addDays(30),sellerAddress:'Studio',sellerContact:'hello@studio.test',customerAddress:'Client',paymentInstructions:'Bank transfer.'},'owner');
 assert.equal(response.status,201);
 response=await call('/api/reminders'+suffix,'GET',undefined,'owner');
 assert.equal(response.data.settings.enabled,false,'reminders start switched off');
 assert.ok(response.data.upcoming.some(item=>item.kind==='Invoice due'&&item.on===new Date().toISOString().slice(0,10)));
 assert.deepEqual(runReminders(ws.db,{studioId:studio.id}),[],'nothing is sent while switched off');
 assert.equal((await call('/api/reminders'+suffix,'POST',{action:'save',settings:{...response.data.settings,enabled:true,approvalAfterDays:0}},'client')).status,403);
 response=await call('/api/reminders'+suffix,'POST',{action:'save',settings:{...response.data.settings,enabled:true}},'owner');
 assert.equal(response.data.settings.enabled,true);
 response=await call('/api/reminders'+suffix,'POST',{action:'run'},'owner');
 assert.equal(response.data.sent.filter(item=>item.kind==='Invoice due').length,1);
 assert.equal((await call('/api/reminders'+suffix,'POST',{action:'run'},'owner')).data.sent.filter(item=>item.kind==='Invoice due').length,0,'each reminder is sent once');
 const conversations=(await call('/api/conversations'+suffix,'GET',undefined,'client')).data.conversations;
 const thread=conversations.find(item=>item.projectId===project.id);
 const detail=(await call(`/api/conversations/${thread.id}${suffix}`,'GET',undefined,'client')).data.conversation;
 assert.ok(detail.messages.some(message=>/gentle reminder that invoice INV-/.test(message.text)),'the client sees the reminder in their project conversation');
 // Overdue reminders repeat on the configured interval only.
 const today=new Date().toISOString().slice(0,10);
 const overdue=runReminders(ws.db,{studioId:studio.id,today:addDays(3)});
 assert.equal(overdue.filter(item=>item.kind==='Invoice overdue').length,1);
 assert.equal(runReminders(ws.db,{studioId:studio.id,today:addDays(4)}).filter(item=>item.kind==='Invoice overdue').length,0);
 assert.equal(runReminders(ws.db,{studioId:studio.id,today:addDays(10)}).filter(item=>item.kind==='Invoice overdue').length,1);
 assert.ok(today);
});

test('clients book a free consultation slot that lands on the studio record',async t=>{
 const {ws,call,suffix,studio}=await workspace(t);
 const closed=await call(`/api/booking/${studio.slug}`);assert.equal(closed.status,404,'booking is off until the studio enables it');
 assert.equal(closed.data.studio.slug,studio.slug,'the closed page can still name the studio and link to its enquiry form');
 let response=await call('/api/consultations'+suffix,'GET',undefined,'owner');
 const settings={...response.data.settings,enabled:true,minNoticeHours:0,horizonDays:14,weekly:{0:[{start:'09:00',end:'12:00'}],1:[{start:'09:00',end:'12:00'}],2:[{start:'09:00',end:'12:00'}],3:[{start:'09:00',end:'12:00'}],4:[{start:'09:00',end:'12:00'}],5:[{start:'09:00',end:'12:00'}],6:[{start:'09:00',end:'12:00'}]}};
 assert.equal((await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings},'client')).status,403);
 assert.equal((await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings:{...settings,weekly:{1:[{start:'12:00',end:'09:00'}]}}},'owner')).status,400);
 response=await call('/api/consultations'+suffix,'POST',{action:'save-settings',settings},'owner');
 assert.equal(response.status,200);assert.match(response.data.bookingUrl,/\/book\/nay-decor$/);
 const page=await call(`/api/booking/${studio.slug}`);
 assert.equal(page.status,200);assert.equal(page.data.booking.title,'Discovery call');
 const slot=page.data.slots.at(-1);assert.ok(slot);
 const key='booking-key-123456';
 const booking={name:'Priya Shah',email:'priya@example.test',phone:'07700 900123',notes:'Garden party for 60',start:slot};
 assert.equal((await call(`/api/booking/${studio.slug}`,'POST',booking,'',{'Idempotency-Key':'short'})).status,400);
 response=await call(`/api/booking/${studio.slug}`,'POST',booking,'',{'Idempotency-Key':key});
 assert.equal(response.status,201);assert.equal(response.data.start,slot);
 assert.equal((await call(`/api/booking/${studio.slug}`,'POST',booking,'',{'Idempotency-Key':key})).status,200,'a retry returns the same booking');
 assert.equal((await call(`/api/booking/${studio.slug}`,'POST',{...booking,email:'other@example.test'},'',{'Idempotency-Key':'booking-key-other-1'})).status,409,'a taken slot cannot be booked twice');
 assert.ok(!(await call(`/api/booking/${studio.slug}`)).data.slots.includes(slot));
 const client=ws.db.prepare('SELECT * FROM clients WHERE studio_id=? AND email=?').get(studio.id,'priya@example.test');
 assert.equal(JSON.parse(client.data).source,'Consultation booking');
 const task=ws.db.prepare('SELECT * FROM crm_tasks WHERE studio_id=? AND client_id=?').get(studio.id,client.id);
 assert.match(task.title,/^Discovery call with Priya Shah at \d\d:\d\d$/);
 response=await call('/api/consultations'+suffix,'GET',undefined,'owner');
 const booked=response.data.consultations[0];assert.equal(booked.name,'Priya Shah');
 response=await call('/api/consultations'+suffix,'POST',{action:'cancel',id:booked.id,note:'Client asked to move'},'owner');
 assert.equal(response.data.consultations.find(item=>item.id===booked.id).status,'Cancelled');
 assert.equal(ws.db.prepare('SELECT completed FROM crm_tasks WHERE id=?').get(task.id).completed,1);
 assert.ok((await call(`/api/booking/${studio.slug}`)).data.slots.includes(slot),'a cancelled slot opens again');
});

test('slot times follow the studio time zone across daylight saving',()=>{
 assert.equal(new Date(localToUtc('2026-07-01','10:00','Europe/London')).toISOString(),'2026-07-01T09:00:00.000Z');
 assert.equal(new Date(localToUtc('2026-12-01','10:00','Europe/London')).toISOString(),'2026-12-01T10:00:00.000Z');
 assert.equal(new Date(localToUtc('2026-07-01','10:00','America/New_York')).toISOString(),'2026-07-01T14:00:00.000Z');
 assert.equal(typeof availableSlots,'function');
});

test('a credit note is not kept when its project event cannot be saved',async t=>{
 const {ws,call,suffix,project}=await workspace(t);
 await call('/api/billing-defaults'+suffix,'POST',{sellerAddress:'1 Studio Lane, London',sellerContact:'hello@studio.test',taxRegistration:'',paymentInstructions:'Bank transfer.',paymentTermsDays:14,plan:[{label:'Deposit',percent:30,due:{type:'on_issue',days:0}},{label:'Balance',percent:70,due:{type:'days_before_event',days:14}}]},'owner');
 const route=`/api/projects/${project.id}/invoices`;
 await confirmEstimate(call,suffix,project,100000);
 const plan=(await call(route+'/plan'+suffix,'POST',{action:'create'},'owner')).data.plan;
 const deposit=(await call(route+'/plan'+suffix,'POST',{action:'issue',stepId:plan.steps[0].id,customerAddress:'Client Street, London'},'owner')).data.invoice;
 const errors=t.mock.method(console,'error',()=>{});
 ws.db.exec("CREATE TRIGGER block_project_save BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT,'project save failed'); END;");
 const failed=await call(`${route}/${deposit.id}/credit-notes${suffix}`,'POST',{amountMinor:5000,reason:'Reduced scope'},'owner');
 assert.equal(failed.status,500);assert.doesNotMatch(JSON.stringify(failed.data),/project save failed/);
 assert.equal(ws.db.prepare('SELECT COUNT(*) AS n FROM invoice_credit_notes').get().n,0,'the credit note rolled back with the event');
 assert.match(String(errors.mock.calls[0].arguments[0]),/POST \/api\/projects\/.+\/credit-notes/);
 assert.match(String(errors.mock.calls[0].arguments[1]),/project save failed/);
 ws.db.exec('DROP TRIGGER block_project_save');
 const saved=await call(`${route}/${deposit.id}/credit-notes${suffix}`,'POST',{amountMinor:5000,reason:'Reduced scope'},'owner');
 assert.equal(saved.status,200);assert.equal(saved.data.invoice.credits.length,1);
});

test('invoice design is saved by the owner, readable by the client and rendered safely',async t=>{
 const {call,suffix,project}=await workspace(t);
 const {invoicePageHtml,normaliseInvoiceDesign}=await import('../src/lib/invoice-design.js');
 let r=await call('/api/invoice-design'+suffix,'GET',undefined,'owner');assert.equal(r.status,200);assert.equal(r.data.design.layout,'atelier');
 r=await call('/api/invoice-design'+suffix,'POST',{layout:'bold',font:'serif',accent:'#2b4a3a',showLogo:true,thankYou:'With thanks',footer:'Company 0123456'},'client');assert.equal(r.status,403);
 r=await call('/api/invoice-design'+suffix,'POST',{layout:'loud',font:'serif',accent:'',showLogo:true},'owner');assert.equal(r.status,400);
 r=await call('/api/invoice-design'+suffix,'POST',{layout:'bold',font:'serif',accent:'red',showLogo:true},'owner');assert.equal(r.status,400);
 r=await call('/api/invoice-design'+suffix,'POST',{layout:'bold',font:'serif',accent:'#2b4a3a',showLogo:false,thankYou:'With thanks',footer:'Company 0123456'},'owner');assert.equal(r.status,200);assert.equal(r.data.design.layout,'bold');
 r=await call(`/api/projects/${project.id}/invoices${suffix}`,'GET',undefined,'client');assert.equal(r.status,200);assert.equal(r.data.design.footer,'Company 0123456');assert.equal(r.data.design.accent,'#2b4a3a');
 const html=invoicePageHtml({number:'INV-1',status:'Paid',currency:'GBP',amountMinor:12000,netMinor:10000,taxMinor:2000,taxRate:20,issuedAt:'2026-10-05',dueDate:'2026-10-19',snapshot:{sellerName:'<b>Studio</b>',billToName:'A <script>x()</script>'}},{studio:{name:'S',accent:'#ffffff',branding:{logoUrl:'javascript:alert(1)'}},design:{layout:'bold',accent:'#ffffff" onload="x',footer:'<img src=x>'}});
 assert.doesNotMatch(html,/<script>x|javascript:|<img src=x>|onload=/);assert.match(html,/&lt;b&gt;Studio/);assert.match(html,/\.band{[^}]*background:#ffffff;color:#141414}/);assert.match(html,/class="stamp">Paid/);
 assert.deepEqual(normaliseInvoiceDesign({layout:'nope',font:'x',accent:'bad'}).layout,'atelier');
});

test('brand kit accepts real logos and fonts only, serves them inertly and feeds invoices',async t=>{
 const {call,suffix,project,ws}=await workspace(t);
 const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(40)]).toString('base64');
 const woff2=Buffer.concat([Buffer.from('wOF2'),Buffer.alloc(40)]).toString('base64');
 let r=await call('/api/brand-kit'+suffix,'POST',{action:'upload',kind:'logo',name:'logo.png',content:png},'client');assert.equal(r.status,403);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'upload',kind:'logo',name:'logo.png',content:Buffer.from('MZ not an image at all').toString('base64')},'owner');assert.equal(r.status,400);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'upload',kind:'font',name:'font.woff2',content:png},'owner');assert.equal(r.status,400);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'upload',kind:'logo',name:'logo.png',content:png},'owner');assert.equal(r.status,201);const logo=r.data.asset;assert.equal(logo.mime,'image/png');
 r=await call('/api/brand-kit'+suffix,'POST',{action:'upload',kind:'font',name:'Brand-Serif.woff2',content:woff2},'owner');assert.equal(r.status,201);const font=r.data.asset;assert.equal(font.mime,'font/woff2');
 r=await call('/api/brand-kit'+suffix,'POST',{action:'save',kit:{logos:{primary:font.id}}},'owner');assert.equal(r.status,400);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'save',kit:{logos:{primary:logo.id},colours:{primary:'#5a2d4c',secondary:'#f3e9ee'},fonts:{heading:{type:'upload',assetId:font.id,family:'Brand Serif'},body:{type:'preset',preset:'dm-sans'}}}},'owner');assert.equal(r.status,200);
 assert.equal(r.data.kit.logos.primary,logo.id);assert.equal(r.data.kit.fonts.heading.family,'Brand Serif');
 // The primary logo becomes the studio logo clients see, as a full address for embedded forms.
 let me=await call('/api/me','GET',undefined,'owner');assert.match(me.data.studios[0].branding.logoUrl,new RegExp(logo.url+'$'));assert.match(me.data.studios[0].branding.logoUrl,/^http/);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'save',kit:{...r.data.kit,logos:{primary:''}}},'owner');assert.equal(r.status,200);
 me=await call('/api/me','GET',undefined,'owner');assert.equal(me.data.studios[0].branding.logoUrl,'');
 r=await call('/api/brand-kit'+suffix,'POST',{action:'save',kit:{...r.data.kit,logos:{primary:logo.id}}},'owner');assert.equal(r.status,200);
 const base=`http://127.0.0.1:${ws.server.address().port}`,file=await fetch(base+logo.url);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'image/png');assert.match(file.headers.get('content-security-policy'),/sandbox/);assert.equal(file.headers.get('x-content-type-options'),'nosniff');
 r=await call(`/api/projects/${project.id}/invoices${suffix}`,'GET',undefined,'client');assert.equal(r.data.brandKit.colours.primary,'#5a2d4c');assert.equal(r.data.brandKit.logos.primary,logo.id);
 // The client's session carries the kit too, so estimates, proposals, contracts and the portal wear it.
 me=await call('/api/me','GET',undefined,'client');assert.equal(me.data.studios[0].brandKit.colours.primary,'#5a2d4c');assert.equal(me.data.studios[0].brandKit.fonts.heading.family,'Brand Serif');
 const {invoicePageHtml}=await import('../src/lib/invoice-design.js');
 const html=invoicePageHtml({number:'INV-9',currency:'GBP',amountMinor:30000,netMinor:25000,taxMinor:5000,taxRate:20,snapshot:{}},{design:{layout:'studio',font:'brand'},brandKit:r.data.brandKit,estimate:{items:[{title:'Arch <b>',quantity:2,unitAmount:25000}],total:60000,taxRate:20}});
 assert.match(html,new RegExp(`/api/brand-assets/${logo.id}`));assert.match(html,/font-family:'Brand Serif'/);assert.match(html,/Arch &lt;b&gt;/);assert.match(html,/50% of the project total/);assert.match(html,/#5a2d4c/);
 r=await call('/api/brand-kit'+suffix,'POST',{action:'remove',assetId:font.id},'owner');assert.equal(r.data.kit.fonts.heading.type,'preset');assert.equal(r.data.assets.some(a=>a.id===font.id),false);
 assert.equal((await fetch(base+font.url)).status,404);
});
