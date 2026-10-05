import {installForms,listForms,changeForm,publicForm,submitForm,listFormResponses,formResponseCSV} from './forms.mjs';
import {installDataGovernance,dataGovernance,changeGovernance,exportStudio} from './data-governance.mjs';
import {handleCalendarSync} from './calendar-sync.mjs';
import {operationalReadiness} from './operational-readiness.mjs';
import {installDocuments,listDocuments,changeDocument,downloadDocument,syncProjectArchives} from './documents.mjs';
import {handleTaskCollaboration} from './task-collaboration.mjs';
import {handleConversationFileUpload} from './conversation-features.mjs';
import {handleConversationOrganiser} from './conversation-organiser.mjs';
import {createAccountSecurity} from './account-security.mjs';
import {installEngagements,getEngagements,changeEngagements,projectCalendar} from './engagements.mjs';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import Stripe from 'stripe';
import {openStore,id,now,hash,passwordHash,passwordOK,event,makeProject,saveProject,insertProject,transaction,materializeProjectConversation,conversationDTO,conversationUnreadCount,markConversationSeen,appendConversationMessage,setConversationStatus} from './store.mjs';
import {listOpportunities,getOpportunity,reviewOpportunity,createOpportunity,updateOpportunity,listActivities,logActivity,listTasks,createTask,updateTask} from './crm.mjs';
import {bindInvitedContact,conversationAccess,ensurePrimaryContact,listClientContacts,listStakeholders,projectAccess,projectClientId} from './relationships.mjs';
import {installStripePayments,activeStripeCheckout,createStripeCheckout,expireStripeCheckout,processStripeWebhook,listStripeCheckoutAttempts} from './stripe-payments.mjs';
import {installStripeOnboarding,startStripeOnboarding,refreshStripeOnboarding,returnFromStripeOnboarding,stripeOnboardingStatus} from './stripe-onboarding.mjs';
import {installNotifications,createNotificationOutbox} from './notifications.mjs';
import {installOnboarding,handleOnboarding} from './onboarding.mjs';
import {installNotificationFeed,recordProjectEvent,recordMessage,recordEnquiry,handleNotificationFeed} from './notification-feed.mjs';
import {saveReferenceLayout} from './reference-layout.mjs';
import {getProjectOperations,changeProjectOperations} from './studio-operations.mjs';
import {DEFAULT_WORKFLOW,isWorkflowId,projectTypesFor,briefFieldsFor} from './src/lib/workflows.js';
import {validateIntakeQuestions,captureIntakeAnswers,updateIntakeAnswers,normalizeIntakeAnswers} from './intake-questions.mjs';
import {searchWorkspace} from './workspace-search.mjs';
import {installStudioCommerce,handleStudioCommerce,billingDefaults} from './studio-commerce.mjs';
import {installInvoiceAdjustments,invoiceAdjustments,invoiceState,issueCreditNote,recordRefund,refundWithCredit} from './invoice-adjustments.mjs';
import {installReminders,handleReminders,runAllReminders} from './reminders.mjs';
import {installConsultations,handleConsultations,publicBooking,bookConsultation} from './consultations.mjs';
import {installPaymentPlans,planView,createPlan,updatePlan,deletePlan,stepInvoice,markStepInvoiced} from './payment-plans.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function fail(status,message){throw Object.assign(new Error(message),{status});}
function str(value,max=5000){if(typeof value!=='string'||value.length>max)fail(400,'Please check the length and format of your answer.');return value.trim();}
function email(value){const result=str(value,254).toLowerCase();if(!emailPattern.test(result))fail(400,'Enter a valid email address.');return result;}
function password(value){if(typeof value!=='string'||value.length<12||value.length>200)fail(400,'Use a password with 12–200 characters.');return value;}
function date(value,label='date'){const result=str(value||'',10);if(result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||isNaN(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result))fail(400,`Enter a valid ${label}.`);return result;}
function safeURL(value){if(!value)return '';const raw=str(value,2000);try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw 0;return u.href;}catch{fail(400,'Use a complete http or https link.');}}
function brief(input){const result={};for(const [key,max] of Object.entries({name:120,occasion:120,date:10,venue:300,vision:5000,customColours:300,budget:120}))result[key]=str(input[key]||'',max);result.email=email(input.email);result.pinterest=safeURL(input.pinterest||'');result.colours=Array.isArray(input.colours)?input.colours.map(x=>str(x,60)).slice(0,15):[];result.workflowType=input.workflowType||DEFAULT_WORKFLOW;if(!isWorkflowId(result.workflowType))fail(400,'Choose a valid service area.');if(input.details!=null&&(typeof input.details!=='object'||Array.isArray(input.details)))fail(400,'Check the project details.');result.details=Object.fromEntries(briefFieldsFor(result.workflowType).map(field=>[field.key,str(input.details?.[field.key]||'',500)]));result.intakeAnswers=normalizeIntakeAnswers(input.intakeAnswers||[]);if(!result.name||!result.occasion)fail(400,'Include your name and the kind of project.');if(result.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||isNaN(Date.parse(result.date))||new Date(result.date).toISOString().slice(0,10)!==result.date))fail(400,'Enter a valid project date.');return result;}
function designDraftDTO(db,projectId,row){const assetIds=JSON.parse(row.asset_ids),creator=db.prepare('SELECT name FROM users WHERE id=?').get(row.created_by);return {id:row.id,projectId:row.project_id,title:row.title,description:row.description,assetIds,assets:assetIds.map(fileId=>{const file=db.prepare('SELECT name,mime,length(content) AS size FROM files WHERE id=? AND project_id=?').get(fileId,projectId);return {fileId,name:file?.name||'Project file',mime:file?.mime||'',size:file?.size||0};}),briefRevision:row.brief_revision,revision:row.revision,status:row.status,createdBy:row.created_by,createdByName:creator?.name||'Studio contributor',createdAt:row.created_at,updatedAt:row.updated_at,sharedDesignId:row.shared_design_id||null};}
function staffProjectDTO(p){return {id:p.id,title:p.title,status:p.status,briefRevision:p.briefRevision,briefLocked:!!p.briefLocked,brief:{name:p.brief.name,occasion:p.brief.occasion,date:p.brief.date,venue:p.brief.venue,vision:p.brief.vision,colours:p.brief.colours||[],customColours:p.brief.customColours||'',pinterest:p.brief.pinterest||'',workflowType:p.brief.workflowType,details:p.brief.details||{},intakeAnswers:p.brief.intakeAnswers||[]},tasks:(p.tasks||[]).map(task=>({...task})),references:(p.inspiration||[]).map(ref=>({id:ref.id,title:ref.title,note:ref.note||'',url:ref.url||'',category:ref.category||'',source:ref.source||'',by:ref.by,at:ref.at})),messages:(p.messages||[]).map(message=>({id:message.id,by:message.by,role:message.role,text:message.text,at:message.at}))};}
function invoiceDTO(db,row){
 const payments=db.prepare('SELECT * FROM invoice_payments WHERE studio_id=? AND invoice_id=? ORDER BY recorded_at,id').all(row.studio_id,row.id).map(payment=>({id:payment.id,amountMinor:payment.amount_minor,method:payment.method,reference:payment.reference,receivedAt:payment.received_at,note:payment.note,recordedAt:payment.recorded_at,recordedBy:payment.recorded_by,source:payment.source}));
 const grossPaidMinor=payments.reduce((sum,payment)=>sum+payment.amountMinor,0),adjustments=invoiceAdjustments(db,row.studio_id,row.id);
 const state=invoiceState({amountMinor:row.amount_minor,grossPaidMinor,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,cancelled:!!row.cancelled_at}),paidMinor=state.paidMinor;
 const checkout=activeStripeCheckout(db,{studioId:row.studio_id,invoiceId:row.id});
 return {id:row.id,number:row.number,projectId:row.project_id,estimateId:row.estimate_id,estimateVersion:row.estimate_version,kind:row.kind,label:row.label||'',currency:row.currency,amountMinor:row.amount_minor,netMinor:row.net_minor,taxMinor:row.tax_minor,taxRate:row.tax_rate,dueDate:row.due_date,note:row.note,paymentInstructions:row.payment_instructions,snapshot:JSON.parse(row.snapshot),status:state.status,dueMinor:state.dueMinor,balanceMinor:state.balanceMinor,refundDueMinor:state.refundDueMinor,grossPaidMinor,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,credits:adjustments.credits,refunds:adjustments.refunds,issuedAt:row.issued_at,issuedBy:row.issued_by,cancelledAt:row.cancelled_at||'',cancelledBy:row.cancelled_by||'',cancelReason:row.cancel_reason||'',paidMinor,payments,checkout:checkout?{status:checkout.status,url:checkout.checkout_url||null}:null};
}
function invoiceRows(db,studioId,projectId=null){return projectId?db.prepare('SELECT * FROM invoices WHERE studio_id=? AND project_id=? ORDER BY issued_at DESC,number DESC').all(studioId,projectId):db.prepare('SELECT * FROM invoices WHERE studio_id=? ORDER BY issued_at DESC,number DESC').all(studioId);}
function previewAuthorized(header,userDigest,passDigest){
 const match=typeof header==='string'&&header.length<=2048?/^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header):null;
 if(!match)return false;
 const credentials=Buffer.from(match[1],'base64').toString('utf8'),separator=credentials.indexOf(':');
 if(separator<0)return false;
 const suppliedUser=Buffer.from(hash(credentials.slice(0,separator)),'hex'),suppliedPass=Buffer.from(hash(credentials.slice(separator+1)),'hex');
 const userMatches=timingSafeEqual(suppliedUser,userDigest),passMatches=timingSafeEqual(suppliedPass,passDigest);
 return userMatches&&passMatches;
}
export async function createWorkspace({dbFile=path.join(root,'data/workspace.sqlite'),origin='http://127.0.0.1:4320',demo=false,dev=false,stripeClient=null,stripeWebhookSecret=process.env.STRIPE_WEBHOOK_SECRET||'',enableStripeCollection=process.env.CALENNE_STRIPE_COLLECTION_ENABLED==='1',notificationKey=process.env.CALENNE_NOTIFICATION_KEY||'',disableExternalServices=false,reminderIntervalMs=disableExternalServices?0:3600000}={}){
 const previewUser=disableExternalServices?'':process.env.PREVIEW_ACCESS_USER||'',previewPass=disableExternalServices?'':process.env.PREVIEW_ACCESS_PASS||'';
 if(Boolean(previewUser)!==Boolean(previewPass)||previewUser.includes(':'))throw new Error('Set both valid PREVIEW_ACCESS_USER and PREVIEW_ACCESS_PASS to protect the preview.');
 const previewEnabled=Boolean(previewUser),previewUserDigest=previewEnabled?Buffer.from(hash(previewUser),'hex'):null,previewPassDigest=previewEnabled?Buffer.from(hash(previewPass),'hex'):null;
 await mkdir(path.dirname(dbFile),{recursive:true});const db=openStore(dbFile);installStripePayments(db);installStripeOnboarding(db);installNotifications(db);installNotificationFeed(db);installOnboarding(db);installEngagements(db);installDocuments(db);installDataGovernance(db);installForms(db);installStudioCommerce(db);installInvoiceAdjustments(db);installPaymentPlans(db);installReminders(db);installConsultations(db);const limits=new Map();
 const stripe=disableExternalServices?null:stripeClient||(process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null);
 const stripeReady=Boolean(enableStripeCollection&&stripe&&stripeWebhookSecret&&(origin.startsWith('https://')||/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)));
 const outbox=notificationKey?createNotificationOutbox(db,{encryptionKey:notificationKey,origin}):null;
 const accountSecurity=createAccountSecurity(db,{origin,encryptionKey:notificationKey});
 const queueProjectEvent=(studioId,projectId,actorUserId,eventId)=>{if(!eventId)return;recordProjectEvent(db,{studioId,projectId,actorUserId,eventId});if(outbox)outbox.enqueueProjectActivity({studioId,projectId,actorUserId,eventId});};
 function rate(req,bucket,max=30){const key=bucket+':'+req.socket.remoteAddress;const time=Date.now();for(const [k,v] of limits)if(v.until<time)limits.delete(k);const v=limits.get(key)||{n:0,until:time+600000};if(++v.n>max)fail(429,'Please wait a few minutes before trying again.');limits.set(key,v);}
 if(demo&&!db.prepare('SELECT id FROM studios WHERE slug=?').get('nay-decor')){
  const studioId=id();db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'nay-decor','NAY DÉCOR','#181925',JSON.stringify(['http://127.0.0.1:4318','http://127.0.0.1:4317',origin]));
  const owner={id:id(),name:'NAY Studio',email:'studio@example.test'},client={id:id(),name:'Amelia Taylor',email:'amelia@example.test'};
  for(const [u,role] of [[owner,'owner'],[client,'client']]){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(u.id,u.email,u.name,passwordHash('StudioDemo2026!'));db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(u.id,studioId,role);}
  for(const [index,person] of ['Amelia Taylor','Noah Williams','Olivia Chen'].entries()){
   const b={name:person,email:index===0?client.email:`demo${index}@example.test`,occasion:['Wedding','Brand launch','Private dinner'][index],date:['2027-06-12','2027-02-20','2027-04-10'][index],venue:['A London townhouse','A gallery in Shoreditch','Private residence, Richmond'][index],vision:['An intimate celebration with sculptural ivory flowers, candlelight and a touch of sage. Elegant, personal and warm.','A quiet, architectural world for a new collection. Soft forms, strong silhouettes and space to explore.','A beautiful dinner for family and friends. Layers of flowers, linen and candlelight.'][index],colours:['Ivory','Sage'],customColours:'Champagne accents',pinterest:'',budget:''};
   const p=makeProject(studioId,b,client);p.demo=true;p.status=['Design','Enquiry','Planning'][index];
   if(index===0){p.inspiration.push({id:id(),title:'The atmosphere',url:'',sample:'/assets/candlelit-table.webp',note:'Warm candlelight, ivory flowers and a considered table.',by:'NAY Studio',at:now()});p.designs.push({id:id(),version:1,briefRevision:p.briefRevision,briefSnapshot:structuredClone(p.brief),title:'Ivory, softly',description:'An intimate table beneath sculptural florals. Ivory and sage, warm candlelight, soft champagne fabrics. This is a sample concept for the demo project.',sample:'/assets/blush-celebration.webp',fileId:'',status:'Awaiting approval',at:now(),feedback:''});p.messages.push({id:id(),by:'NAY Studio',role:'owner',text:'Welcome, Amelia. Your first concept is ready to explore in Designs. You can leave feedback or approve it when you are happy.',at:now()});event(p,owner,'Shared design version 1');}
   if(index===0){p.decisions.push({id:id(),title:'Choose the table direction',description:'Which setting feels closer to the celebration you have in mind? We will refine the chosen direction together.',options:[{id:id(),label:'Sculptural ivory',detail:'Architectural florals, candlelight and a restrained palette.',url:''},{id:id(),label:'Soft garden',detail:'Low arrangements, layered greenery and a more relaxed table.',url:''}],status:'Awaiting choice',briefRevision:1,createdAt:now(),by:'NAY Studio'});p.tasks.push({id:id(),title:'Share any important table details',due:'2026-10-12',assignee:'client',completed:false,createdBy:'NAY Studio',at:now()});p.tasks.push({id:id(),title:'Refine the table layout',due:'2026-11-02',assignee:'studio',completed:false,createdBy:'NAY Studio',at:now()});}
   insertProject(db,p);
  }
  bindInvitedContact(db,studioId,client.email,client.id);
 }
 for(const row of db.prepare('SELECT data FROM projects').all()){const p=JSON.parse(row.data);let changed=false;for(const d of p.designs){if(d.briefRevision==null){d.briefRevision=1;d.briefSnapshot=p.briefHistory.find(h=>h.revision===1)?.brief||p.brief;changed=true;}}if(changed)saveProject(db,p);}
 const vite=dev?await (await import('vite')).createServer({configFile:path.join(root,'vite.config.js'),server:{middlewareMode:true},appType:'spa'}):null;
 const server=http.createServer(async(req,res)=>{
  let url,route,body={};
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   try{url=new URL(req.url,origin);route=url.pathname;}catch{fail(400,'Use a valid request address.');}
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
   if(route==='/api/webhooks/stripe'&&req.method==='POST'){
    if(!stripe||!stripeWebhookSecret)fail(503,'Stripe webhook is not configured.');
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576)fail(413,'Stripe webhook is too large.');chunks.push(chunk);}
    const result=transaction(db,()=>{
     const outcome=processStripeWebhook(db,stripe,{rawBody:Buffer.concat(chunks),signature:req.headers['stripe-signature'],webhookSecret:stripeWebhookSecret});
     if(outcome.result==='paid'&&!outcome.duplicate){
      const invoice=db.prepare('SELECT * FROM invoices WHERE id=?').get(outcome.invoiceId);
      const project=invoice&&db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(invoice.project_id,invoice.studio_id);
      if(project){const p=JSON.parse(project.data);event(p,{name:'Stripe'},`Payment confirmed for invoice ${invoice.number}`);saveProject(db,p);}
     }
     return outcome;
    });
    return reply(200,{ok:true,...result});
   }
   if(previewEnabled&&!(route==='/api/health'&&req.method==='GET')&&!previewAuthorized(req.headers.authorization,previewUserDigest,previewPassDigest)){
    res.writeHead(401,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','WWW-Authenticate':'Basic realm="Caleane preview", charset="UTF-8"'});
    return res.end('Preview access required.');
   }
   const publicMatch=route.match(/^\/api\/public\/([a-z0-9-]+)(?:\/(enquiries)|\/forms\/([a-z0-9-]+)(?:\/(enquiries))?)?$/);
   let publicStudio;
   if(publicMatch){publicStudio=db.prepare('SELECT * FROM studios WHERE slug=?').get(publicMatch[1]);if(!publicStudio)fail(404,'Studio not found.');const allowed=[origin,...JSON.parse(publicStudio.origins)];if(req.headers.origin&&!allowed.includes(req.headers.origin))fail(403,'This website is not connected to the studio.');if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}}
   if(route.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)){
    if(!publicMatch&&req.headers.origin!==origin)fail(403,'Please use this workspace to make changes.');
    if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))fail(415,'Use JSON for this request.');
    const isUpload=/^\/api\/(?:projects\/[a-f0-9-]+\/(?:files|drafts\/files)|staff\/projects\/[a-f0-9-]+\/drafts\/files)$/.test(route),limit=(isUpload||/^\/api\/(?:conversations\/[^/]+\/files|task-workspace\/(?:project|crm)\/[^/]+)$/.test(route))?8500000:65536,chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)fail(413,isUpload?'This file is too large. Choose a file below 6 MB.':'This request is too large. Shorten your answers and try again.');chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw 0;}catch{fail(400,'We could not read that request.');}
   }
   if(route==='/api/health'&&req.method==='GET')return reply(200,{ok:true});
   if(route==='/api/info'&&req.method==='GET')return reply(200,{demo,signup:true});
   if(publicMatch&&req.method==='GET'){
    const brand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(publicStudio.id)?.data||'{}'),form=publicForm(db,publicStudio.id,publicMatch[3]||'enquiry');
    if(publicMatch[3]&&!form)fail(404,'Form not found.');
    return reply(200,{enabled:true,studio:{name:publicStudio.name,slug:publicStudio.slug,accent:publicStudio.accent,branding:brand},form,plannerUrl:`${origin}/intake/${publicStudio.slug}${publicMatch[3]?'/'+publicMatch[3]:''}`});
   }
   if(publicMatch&&(publicMatch[2]||publicMatch[4])&&req.method==='POST'){
    const formExists=db.prepare('SELECT 1 FROM enquiry_forms WHERE studio_id=? AND slug=?').get(publicStudio.id,publicMatch[3]||'enquiry');
    if(formExists||publicMatch[3]){rate(req,'intake',30);const result=submitForm(db,{studio:publicStudio,slug:publicMatch[3]||'enquiry',body,key:req.headers['idempotency-key'],buildBrief:brief,legacy:!publicMatch[3],onCreated:projectId=>recordEnquiry(db,{studioId:publicStudio.id,projectId})});return reply(result.status,result.data);}
    rate(req,'intake',30);if(body.website)fail(400,'Please leave the website field empty.');const publicBrand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(publicStudio.id)?.data||'{}');const questions=validateIntakeQuestions(publicBrand.intakeQuestions||[]);const b=brief({...body,workflowType:publicBrand.profession||DEFAULT_WORKFLOW,intakeAnswers:captureIntakeAnswers(body.intakeAnswers,questions)});const key=str(req.headers['idempotency-key']||'',120);if(!key)fail(400,'An enquiry reference is required.');const digest=hash(JSON.stringify(b));const previous=db.prepare('SELECT * FROM receipts WHERE studio_id=? AND key=?').get(publicStudio.id,key);if(previous){if(previous.digest!==digest)fail(409,'This enquiry reference has already been used.');return reply(200,{ok:true,reference:previous.project_id.slice(0,8).toUpperCase()});}
    const p=makeProject(publicStudio.id,b,{name:b.name});db.exec('BEGIN');try{insertProject(db,p);db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(publicStudio.id,key,digest,p.id);recordEnquiry(db,{studioId:publicStudio.id,projectId:p.id});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply(201,{ok:true,reference:p.id.slice(0,8).toUpperCase()});
   }
   const bookingMatch=route.match(/^\/api\/booking\/([a-z0-9-]+)$/);
   if(bookingMatch){
    const bookingStudio=db.prepare('SELECT * FROM studios WHERE slug=?').get(bookingMatch[1]);if(!bookingStudio)fail(404,'Studio not found.');
    if(req.method==='GET')return reply(200,publicBooking(db,bookingStudio));
    if(req.method==='POST'){rate(req,'booking',20);const result=bookConsultation(db,{studio:bookingStudio,body,key:req.headers['idempotency-key']});return reply(result.status,result.data);}
    fail(405,'Method not allowed.');
   }
   function startSession(user){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`studio_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${origin.startsWith('https:')?'; Secure':''}`);}
   const cookie=req.headers.cookie?.match(/(?:^|;\s*)studio_session=([a-f0-9]+)/)?.[1];
   const user=cookie?db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hash(cookie),Date.now()):null;
   if(route==='/api/account/recovery'&&req.method==='POST'){rate(req,'recovery',8);const mail=email(body.email);accountSecurity.enqueue(db.prepare('SELECT * FROM users WHERE email=?').get(mail),'reset');return reply(200,{ok:true,message:'If an account uses that email, a recovery link will be sent.'});}
   if(route==='/api/account/reset'&&req.method==='POST'){rate(req,'reset',12);accountSecurity.consume(body.token,'reset',body.password);res.setHeader('Set-Cookie','studio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(200,{ok:true});}
   if(route==='/api/account/verify'&&req.method==='POST'){rate(req,'verify',12);accountSecurity.consume(body.token,'verify');return reply(200,{ok:true});}
   if(route==='/api/account/security'&&req.method==='GET'){if(!user)fail(401,'Please sign in.');return reply(200,accountSecurity.status(user));}
   if(route==='/api/account/verification'&&req.method==='POST'){if(!user)fail(401,'Please sign in.');rate(req,'verification',8);if(!accountSecurity.status(user).verified)accountSecurity.enqueue(user,'verify');return reply(200,{ok:true,message:'Check your email for a verification link.'});}
   if(route==='/api/login'&&req.method==='POST'){rate(req,'auth',15);const u=db.prepare('SELECT * FROM users WHERE email=?').get(email(body.email));if(!u||!passwordOK(password(body.password),u.password))fail(401,'Email or password is incorrect.');startSession(u);return reply(200,{ok:true});}
   if(route==='/api/signup'&&req.method==='POST'){
    rate(req,'signup',5);const mail=email(body.email),name=str(body.name,120),studioName=str(body.studio,120),slug=str(body.slug,80),pass=password(body.password),profession=body.profession??DEFAULT_WORKFLOW;if(!name||!studioName||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Add your name, studio name and a lowercase studio address.');if(!isWorkflowId(profession))fail(400,'Choose a valid studio practice.');if(db.prepare('SELECT id FROM users WHERE email=?').get(mail)||db.prepare('SELECT id FROM studios WHERE slug=?').get(slug))fail(409,'That email or studio address is already in use.');const u={id:id(),name,email:mail},sid=id();db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(u.id,mail,name,passwordHash(pass));db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(sid,slug,studioName,'#181925',JSON.stringify([origin]));db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(u.id,sid,'owner');db.prepare('INSERT INTO studio_branding VALUES(?,?)').run(sid,JSON.stringify({portalTitle:studioName,welcome:'Your project, thoughtfully brought together.',logoUrl:'',profession,projectTypes:projectTypesFor(profession)}));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}startSession(u);return reply(201,{ok:true});
   }
   if(route==='/api/invite/claim'&&req.method==='POST'){
    rate(req,'invite',15);const token=str(body.token,100);const u=transaction(db,()=>{const invite=db.prepare('SELECT * FROM invitations WHERE token=? AND used=0 AND expires>?').get(hash(token),Date.now());if(!invite)fail(400,'This invitation has expired or has already been used. Ask the studio for a new link.');let account=db.prepare('SELECT * FROM users WHERE email=?').get(invite.email);if(account&&user?.id!==account.id)fail(409,'This email already has an account. Sign in first, then open the invitation again.');if(!account){const name=str(body.name,120);if(!name)fail(400,'Enter your name.');account={id:id(),email:invite.email,name};db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(account.id,account.email,account.name,passwordHash(password(body.password)));}bindInvitedContact(db,invite.studio_id,invite.email,account.id);db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,'client')").run(account.id,invite.studio_id);db.prepare('UPDATE invitations SET used=1 WHERE token=?').run(hash(token));return account;});startSession(u);return reply(200,{ok:true});
   }
   if(route==='/api/staff-invitations/claim'&&req.method==='POST'){
    rate(req,'staff-invite',15);const token=str(body.token,100);
    const account=transaction(db,()=>{
     const invite=db.prepare('SELECT * FROM staff_invitations WHERE token=? AND used=0 AND expires>?').get(hash(token),Date.now());
     if(!invite)fail(400,'This studio invitation has expired or has already been used.');
     let member=db.prepare('SELECT * FROM users WHERE email=?').get(invite.email);
     if(member&&user?.id!==member.id)fail(409,'Sign in with the invited email, then open this link again.');
     if(!member){const name=str(body.name,120);if(!name)fail(400,'Enter your name.');member={id:id(),email:invite.email,name};db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(member.id,member.email,name,passwordHash(password(body.password)));}
     if(db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND studio_id=?').get(member.id,invite.studio_id))fail(409,'This account already has a role in this studio.');
     db.prepare('INSERT OR IGNORE INTO studio_staff VALUES(?,?,?,?)').run(member.id,invite.studio_id,invite.access,now());
     db.prepare('UPDATE staff_invitations SET used=1 WHERE token=?').run(hash(token));return member;
    });startSession(account);return reply(200,{ok:true});
   }
   if(route==='/api/logout'&&req.method==='POST'){if(cookie)db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie));res.setHeader('Set-Cookie','studio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(200,{ok:true});}
   if(route.startsWith('/api/')){
    if(!user)fail(401,'Please sign in.');
    const branding=sid=>JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(sid)?.data||'{}');
    const decorate=p=>{if(staffViewer)return {id:p.id,studioId:p.studioId,title:p.title,status:p.status,accessRole:'Studio viewer',canContribute:!!db.prepare('SELECT 1 FROM studio_project_collaborators WHERE studio_id=? AND project_id=? AND user_id=?').get(p.studioId,p.id,user.id),briefRevision:p.briefRevision,brief:{name:p.brief.name,occasion:p.brief.occasion,date:p.brief.date,venue:p.brief.venue,vision:p.brief.vision,workflowType:p.brief.workflowType},designs:p.designs.map(d=>({id:d.id,version:d.version,title:d.title,status:d.status,at:d.at})),tasks:(p.tasks||[]).map(t=>({id:t.id,title:t.title,due:t.due,assignee:t.assignee,completed:t.completed})),createdAt:p.createdAt,updatedAt:p.updatedAt};const c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id),accessRole=owner?'Owner':projectAccess(db,p.studioId,p.id,user.id),latest=accessRole==='Owner'||accessRole==='Approver'?db.prepare(`SELECT i.* FROM invoices i WHERE i.studio_id=? AND i.project_id=? ORDER BY
     CASE WHEN i.cancelled_at IS NULL AND i.amount_minor>COALESCE((SELECT SUM(ip.amount_minor) FROM invoice_payments ip WHERE ip.studio_id=i.studio_id AND ip.invoice_id=i.id),0) THEN 0 ELSE 1 END,
     i.issued_at DESC,i.number DESC LIMIT 1`).get(p.studioId,p.id):null;const invoice=latest?invoiceDTO(db,latest):null;return {...p,enquiryReviewedAt:owner?db.prepare('SELECT r.reviewed_at FROM crm_enquiry_reviews r JOIN crm_opportunities o ON o.id=r.opportunity_id AND o.studio_id=r.studio_id WHERE o.project_id=? AND o.studio_id=?').get(p.id,p.studioId)?.reviewed_at:undefined,operations:owner?p.operations:undefined,clientId:projectClientId(db,p.studioId,p.id),accessRole,conversationId:c?.id,unreadMessages:c?conversationUnreadCount(db,c,user):0,latestInvoice:invoice?{id:invoice.id,number:invoice.number,kind:invoice.kind,currency:invoice.currency,amountMinor:invoice.amountMinor,paidMinor:invoice.paidMinor,dueDate:invoice.dueDate,status:invoice.status}:null};};
    const memberships=[...db.prepare('SELECT s.*,m.role FROM studios s JOIN memberships m ON m.studio_id=s.id WHERE m.user_id=?').all(user.id),...db.prepare("SELECT s.*,'staff_viewer' AS role FROM studios s JOIN studio_staff st ON st.studio_id=s.id WHERE st.user_id=? AND st.access='viewer'").all(user.id)];
    if(route==='/api/me'&&req.method==='GET')return reply(200,{user:{id:user.id,name:user.name,email:user.email},studios:memberships.map(s=>({...s,origins:JSON.parse(s.origins),branding:branding(s.id)}))});
    if(route==='/api/stripe/connect/refresh'&&req.method==='GET'){
     if(!stripe)fail(503,'Stripe account setup is not configured.');
     const link=await refreshStripeOnboarding(db,stripe,{ownerUserId:user.id,state:url.searchParams.get('state'),appOrigin:origin});
     res.writeHead(303,{Location:link.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();
    }
    if(route==='/api/stripe/connect/return'&&req.method==='GET'){
     if(!stripe)fail(503,'Stripe account setup is not configured.');
     const result=await returnFromStripeOnboarding(db,stripe,{ownerUserId:user.id,state:url.searchParams.get('state')});
     const destination=new URL('/',origin);destination.searchParams.set('view','settings');destination.searchParams.set('studio',result.studioId);destination.searchParams.set('stripe',result.status);
     res.writeHead(303,{Location:destination.toString(),'Cache-Control':'no-store'});return res.end();
    }
    const studio=memberships.find(s=>s.id===url.searchParams.get('studio'));if(!studio)fail(403,'You do not have access to this studio.');const owner=studio.role==='owner',staffViewer=studio.role==='staff_viewer';const requireOwner=()=>{if(!owner)fail(403,'Only the studio can make this change.');};
    if(req.method==='POST'&&((route.startsWith('/api/conversations/')&&route.endsWith('/files'))||(route.startsWith('/api/task-workspace/')&&body.action==='file')))rate(req,'upload',40);
    const formRoute=route.match(/^\/api\/forms(?:\/([a-f0-9-]+)(?:\/(responses|export))?)?$/);
    if(formRoute){requireOwner();const formId=formRoute[1],action=formRoute[2];
     if(req.method==='GET'&&action==='export'){res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename=caleane-form-responses.csv');return res.end(formResponseCSV(db,studio.id,formId));}
     if(req.method==='GET'&&action==='responses')return reply(200,listFormResponses(db,studio.id,formId,Number(url.searchParams.get('offset')||0)));
     if(req.method==='GET'&&!formId)return reply(200,{forms:listForms(db,studio)});
     if(req.method==='POST'&&!action)return reply(formId?200:201,{form:changeForm(db,studio,body,formId)});
     fail(405,'Method not allowed.');
    }
    if(route==='/api/data-governance'){const args={studioId:studio.id,userId:user.id};if(req.method==='GET')return reply(200,dataGovernance(db,args));if(req.method==='POST')return reply(200,changeGovernance(db,args,body));fail(405,'Method not allowed.');}
    if(route==='/api/studio-export'&&req.method==='GET'){const data=exportStudio(db,{studioId:studio.id,userId:user.id},{includeFiles:url.searchParams.get('files')==='1'});res.setHeader('Content-Disposition','attachment; filename=caleane-studio-export.json');return reply(200,data);}
    if(route==='/api/operations'&&req.method==='GET')return reply(200,await operationalReadiness(db,{studioId:studio.id,userId:user.id,backupReceiptPath:process.env.CALEANE_BACKUP_RECEIPT||'',emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM&&process.env.CALEANE_EMAIL_ENABLED==='1'),offsiteBackupsConfigured:false}));
    if(await handleCalendarSync({db,req,url,route,body,user,studio,owner,reply,origin}))return;
    if(handleNotificationFeed({db,req,url,route,body,user,studio,owner,reply}))return;
    if(handleOnboarding({db,req,route,body,user,studio,reply}))return;
    if(await handleTaskCollaboration({db,req,res,url,route,body,user,studio,owner,staffViewer,reply}))return;
    if(await handleConversationFileUpload({db,req,res,url,route,body,user,studio,owner,staffViewer,reply}))return;
    if(await handleConversationOrganiser({db,req,route,body,user,studio,owner,reply}))return;
    if(await handleStudioCommerce({db,req,route,body,studio,owner,reply}))return;
    if(await handleReminders({db,req,route,body,studio,owner,reply,outbox}))return;
    if(await handleConsultations({db,req,route,body,studio,owner,user,reply,origin}))return;
    if(route==='/api/stripe/connect/status'&&req.method==='GET'){
     requireOwner();if(!stripe) return reply(200,{onboarding:{studioId:studio.id,status:'unavailable',chargesEnabled:false,detailsSubmitted:false,payoutsEnabled:false,country:''}});
     return reply(200,{onboarding:await stripeOnboardingStatus(db,stripe,{studioId:studio.id,ownerUserId:user.id})});
    }
    if(route==='/api/stripe/connect/start'&&req.method==='POST'){
     requireOwner();if(!stripe)fail(503,'Stripe account setup is not configured.');rate(req,'stripe-connect',20);
     const onboarding=await startStripeOnboarding(db,stripe,{studioId:studio.id,ownerUserId:user.id,country:body.country,appOrigin:origin});
     return reply(200,{onboarding});
    }
    const createInvitation=mail=>{requireOwner();const linked=db.prepare(`SELECT u.email FROM crm_contacts ct JOIN users u ON u.id=ct.user_id WHERE ct.studio_id=? AND ct.email=?`).get(studio.id,mail);if(linked&&linked.email!==mail)fail(409,'This contact already has a portal login at a different email.');const token=randomBytes(32).toString('hex'),result={url:`${origin}/join#${token}`,email:mail,expiresDays:7,delivery:outbox?'queued':'copy_link'};transaction(db,()=>{db.prepare('UPDATE invitations SET used=1 WHERE studio_id=? AND email=?').run(studio.id,mail);db.prepare('INSERT INTO invitations VALUES(?,?,?,?,0)').run(hash(token),studio.id,mail,Date.now()+7*86400000);if(outbox)outbox.enqueueInvitation({studioId:studio.id,email:mail,inviteUrl:result.url});});return result;};
    const clientDTO=row=>{const organization=db.prepare(`SELECT o.name FROM crm_client_organizations co JOIN crm_organizations o ON o.id=co.organization_id AND o.studio_id=co.studio_id WHERE co.client_id=? AND co.studio_id=?`).get(row.id,studio.id);return {id:row.id,email:row.email,name:row.name,...JSON.parse(row.data),organizationName:organization?.name||''};};
    if(route==='/api/search'&&req.method==='GET'){requireOwner();const query=str(url.searchParams.get('q')||'',80);return reply(200,searchWorkspace(db,studio.id,query,url.searchParams.get('scope')||'all'));}
    if(route==='/api/staff'){
     requireOwner();
     if(req.method==='GET'){
      const members=db.prepare(`SELECT st.user_id AS id,u.name,u.email,st.access,st.joined_at AS joinedAt FROM studio_staff st JOIN users u ON u.id=st.user_id WHERE st.studio_id=? ORDER BY st.joined_at`).all(studio.id).map(member=>({...member,projectIds:db.prepare('SELECT project_id AS projectId FROM studio_project_collaborators WHERE studio_id=? AND user_id=?').all(studio.id,member.id).map(row=>row.projectId)}));
      const pending=db.prepare(`SELECT token AS id,email,access,expires,created_at AS createdAt FROM staff_invitations WHERE studio_id=? AND used=0 AND expires>? ORDER BY created_at DESC`).all(studio.id,Date.now());
      return reply(200,{owner:{id:user.id,name:user.name,email:user.email},members,pending});
     }
     if(req.method==='POST'){
      rate(req,'staff-invite-create',20);const mail=email(body.email);
      if(mail===user.email)fail(409,'You already own this studio.');
      const existing=db.prepare('SELECT id FROM users WHERE email=?').get(mail);
      if(existing&&(db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND studio_id=?').get(existing.id,studio.id)||db.prepare('SELECT 1 FROM studio_staff WHERE user_id=? AND studio_id=?').get(existing.id,studio.id)))fail(409,'This person already has access to this studio.');
      const token=randomBytes(32).toString('hex');transaction(db,()=>{
       db.prepare('UPDATE staff_invitations SET used=1 WHERE studio_id=? AND email=? AND used=0').run(studio.id,mail);
       db.prepare('INSERT INTO staff_invitations VALUES(?,?,?,?,?,0,?)').run(hash(token),studio.id,mail,'viewer',Date.now()+7*86400000,now());
      });
      return reply(201,{url:`${origin}/join-studio#${token}`,email:mail,access:'viewer',expiresDays:7,delivery:'copy_link'});
     }
     fail(405,'Method not allowed.');
    }
    const staffAssignmentMatch=route.match(/^\/api\/staff\/([a-f0-9-]+)\/projects\/([a-f0-9-]+)$/);
    if(staffAssignmentMatch){
     requireOwner();if(req.method!=='PATCH'||typeof body.enabled!=='boolean')fail(400,'Choose whether this member can contribute.');
     const member=db.prepare('SELECT 1 FROM studio_staff WHERE studio_id=? AND user_id=?').get(studio.id,staffAssignmentMatch[1]);
     const project=db.prepare('SELECT id FROM projects WHERE id=? AND studio_id=?').get(staffAssignmentMatch[2],studio.id);
     if(!member||!project)fail(404,'Studio member or project not found.');
     if(body.enabled)db.prepare('INSERT OR IGNORE INTO studio_project_collaborators VALUES(?,?,?,?,?)').run(staffAssignmentMatch[1],studio.id,project.id,now(),user.id);
     else db.prepare('DELETE FROM studio_project_collaborators WHERE user_id=? AND studio_id=? AND project_id=?').run(staffAssignmentMatch[1],studio.id,project.id);
     return reply(200,{ok:true,projectId:project.id,enabled:body.enabled});
    }
    const staffProjectMatch=route.match(/^\/api\/staff\/projects\/([a-f0-9-]+)(?:\/(brief|tasks|messages|references))?$/);
    if(staffProjectMatch){
     if(!staffViewer)fail(403,'This route is for assigned studio contributors.');
     const projectRow=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(staffProjectMatch[1],studio.id);
     const assignment=projectRow&&db.prepare('SELECT 1 FROM studio_project_collaborators WHERE user_id=? AND studio_id=? AND project_id=?').get(user.id,studio.id,staffProjectMatch[1]);
     if(!assignment)fail(404,'Assigned project not found.');
     const project=JSON.parse(projectRow.data),action=staffProjectMatch[2];
     if(!action&&req.method==='GET')return reply(200,{project:staffProjectDTO(project)});
     if(req.method!=='POST')fail(405,'Method not allowed.');
     if(action==='brief'){
      if(project.briefLocked)fail(409,'An approved brief needs an owner-reviewed change request.');
      if(body.revision!==project.briefRevision)fail(409,'The brief changed. Refresh before saving.');
      if(!body.brief||typeof body.brief!=='object'||Array.isArray(body.brief))fail(400,'Check the brief.');
      const next=brief({...project.brief,...body.brief,email:project.clientEmail,budget:project.brief.budget,workflowType:project.brief.workflowType,intakeAnswers:updateIntakeAnswers(project.brief.intakeAnswers,body.brief.intakeAnswers)});
      project.briefHistory.unshift({revision:project.briefRevision,brief:project.brief,at:now(),by:user.name});project.brief=next;project.briefRevision++;event(project,user,'Updated the brief');
     }else if(action==='tasks'){
      project.tasks||=[];
      if(body.taskId){const task=project.tasks.find(item=>item.id===body.taskId);if(!task)fail(404,'Task not found.');if(task.assignee!=='studio'||typeof body.completed!=='boolean')fail(403,'Only studio tasks can be completed here.');task.completed=body.completed;task.completedBy=body.completed?user.name:'';task.completedAt=body.completed?now():'';event(project,user,(task.completed?'Completed':'Reopened')+' task: '+task.title);}
      else{const title=str(body.title,200),due=date(body.due,'due date');if(!title||!['studio','client'].includes(body.assignee))fail(400,'Add a title and assignee.');project.tasks.push({id:id(),title,due,assignee:body.assignee,completed:false,createdBy:user.name,at:now()});event(project,user,'Added a shared project task');}
     }else if(action==='references'){
      const title=str(body.title,200),note=str(body.note||'',3000),link=safeURL(body.url||'');if(!title||(!note&&!link))fail(400,'Add a title and a link or note.');
      project.inspiration.unshift({id:id(),title,note,url:link,category:'',source:'',comments:[],by:user.name,at:now()});event(project,user,'Added a project reference');
     }else if(action==='messages'){
      const text=str(body.text,5000);if(!text)fail(400,'Write a message first.');
      transaction(db,()=>{const messageId=appendConversationMessage(db,materializeProjectConversation(db,project),user,'owner',text,body.clientMessageId?str(body.clientMessageId,120):null);queueProjectEvent(studio.id,project.id,user.id,messageId);});
      return reply(200,{project:staffProjectDTO(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(project.id,studio.id).data))});
     }else fail(404,'Not found.');
     transaction(db,()=>{saveProject(db,project);queueProjectEvent(studio.id,project.id,user.id,project.activity?.[0]?.id);});
     return reply(200,{project:staffProjectDTO(project)});
    }
    const staffDraftFileMatch=route.match(/^\/api\/staff\/projects\/([a-f0-9-]+)\/drafts\/files(?:\/([a-f0-9-]+))?$/);
    const staffDraftMatch=route.match(/^\/api\/staff\/projects\/([a-f0-9-]+)\/drafts(?:\/([a-f0-9-]+))?$/);
    if(staffDraftFileMatch||staffDraftMatch){
     if(!staffViewer)fail(403,'This route is for assigned studio contributors.');
     const projectId=(staffDraftFileMatch||staffDraftMatch)[1];
     const projectRow=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studio.id);
     const assignment=projectRow&&db.prepare('SELECT 1 FROM studio_project_collaborators WHERE user_id=? AND studio_id=? AND project_id=?').get(user.id,studio.id,projectId);
     if(!assignment)fail(404,'Assigned project not found.');
     const project=JSON.parse(projectRow.data);
     if(staffDraftFileMatch){
      const requestedFileId=staffDraftFileMatch[2];
      if(requestedFileId){
       if(req.method!=='GET')fail(405,'Method not allowed.');
       const file=db.prepare('SELECT f.* FROM files f JOIN design_assets a ON a.file_id=f.id WHERE f.id=? AND f.project_id=? AND a.studio_id=? AND a.project_id=? AND a.uploaded_by=?').get(requestedFileId,projectId,studio.id,projectId,user.id);
       if(!file)fail(404,'File not found.');
       res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(file.content));
      }
      if(req.method!=='POST')fail(405,'Method not allowed.');
      rate(req,'staff-design-upload',40);
      const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');
      if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');
      let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');
      const fileId=id();transaction(db,()=>{db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fileId,projectId,name,mime,data);db.prepare('INSERT INTO design_assets VALUES(?,?,?,?,?)').run(fileId,studio.id,projectId,user.id,now());});
      return reply(201,{asset:{fileId,name,mime,size:data.length}});
     }
     const draftId=staffDraftMatch[2];
     const selectedAssets=()=>{const ids=body.assetIds??[];if(!Array.isArray(ids)||ids.length>8||ids.some(value=>typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))||new Set(ids).size!==ids.length)fail(400,'Choose up to eight distinct files you added to this project.');for(const fileId of ids)if(!db.prepare('SELECT 1 FROM design_assets WHERE file_id=? AND studio_id=? AND project_id=? AND uploaded_by=?').get(fileId,studio.id,projectId,user.id))fail(400,'Choose files you added to this project.');return ids;};
     if(!draftId){
      if(req.method==='GET')return reply(200,{drafts:db.prepare("SELECT * FROM design_drafts WHERE studio_id=? AND project_id=? AND created_by=? AND status='private' ORDER BY updated_at DESC").all(studio.id,projectId,user.id).map(row=>designDraftDTO(db,projectId,row))});
      if(req.method!=='POST')fail(405,'Method not allowed.');
      const title=str(body.title||'',200),description=str(body.description||'',5000),ids=selectedAssets();
      if(!title)fail(400,'Give this draft a title.');
      if(body.briefRevision!==project.briefRevision)fail(409,'The brief changed. Review it before saving this draft.');
      const draftId=id(),createdAt=now();
      db.prepare("INSERT INTO design_drafts(id,studio_id,project_id,title,description,asset_ids,brief_revision,revision,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(draftId,studio.id,projectId,title,description,JSON.stringify(ids),project.briefRevision,1,'private',user.id,createdAt,createdAt);
      return reply(201,{draft:designDraftDTO(db,projectId,db.prepare('SELECT * FROM design_drafts WHERE id=?').get(draftId))});
     }
     if(req.method!=='PATCH')fail(405,'Only the owner can share a direction.');
     const row=db.prepare("SELECT * FROM design_drafts WHERE id=? AND studio_id=? AND project_id=? AND created_by=? AND status='private'").get(draftId,studio.id,projectId,user.id);
     if(!row)fail(404,'Private direction not found.');
     if(!Number.isInteger(body.revision)||body.revision!==row.revision)fail(409,'This draft changed. Refresh before continuing.');
     if(body.briefRevision!==project.briefRevision)fail(409,'The brief changed. Review it before updating this draft.');
     const title=str(body.title||'',200),description=str(body.description||'',5000),ids=selectedAssets();
     if(!title)fail(400,'Give this draft a title.');
     const updated=db.prepare("UPDATE design_drafts SET title=?,description=?,asset_ids=?,brief_revision=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND project_id=? AND created_by=? AND status='private' AND revision=?").run(title,description,JSON.stringify(ids),project.briefRevision,now(),draftId,studio.id,projectId,user.id,row.revision);
     if(!updated.changes)fail(409,'This draft changed. Refresh before continuing.');
     return reply(200,{draft:designDraftDTO(db,projectId,db.prepare('SELECT * FROM design_drafts WHERE id=?').get(draftId))});
    }
    const staffMemberMatch=route.match(/^\/api\/staff\/([a-f0-9-]+)$/);
    if(staffMemberMatch){requireOwner();if(req.method!=='PATCH'||body.remove!==true)fail(405,'Method not allowed.');const removed=transaction(db,()=>{db.prepare('DELETE FROM studio_project_collaborators WHERE studio_id=? AND user_id=?').run(studio.id,staffMemberMatch[1]);return db.prepare('DELETE FROM studio_staff WHERE studio_id=? AND user_id=?').run(studio.id,staffMemberMatch[1]);});if(!removed.changes)fail(404,'Studio member not found.');return reply(200,{ok:true});}
    const staffInviteMatch=route.match(/^\/api\/staff-invitations\/([a-f0-9]{64})$/);
    if(staffInviteMatch){requireOwner();if(req.method!=='PATCH'||body.revoke!==true)fail(405,'Method not allowed.');const revoked=db.prepare('UPDATE staff_invitations SET used=1 WHERE studio_id=? AND token=? AND used=0').run(studio.id,staffInviteMatch[1]);if(!revoked.changes)fail(404,'Invitation not found.');return reply(200,{ok:true});}
    if(route==='/api/opportunities'){
     requireOwner();
     if(req.method==='GET')return reply(200,{opportunities:listOpportunities(db,studio.id)});
     if(req.method==='POST')return reply(201,{opportunity:createOpportunity(db,studio.id,user,body)});
     fail(405,'Method not allowed.');
    }
    const opportunityMatch=route.match(/^\/api\/opportunities\/([a-f0-9-]+)(?:\/(activities|project|review|planning))?$/);
    if(opportunityMatch){
     requireOwner();const oid=opportunityMatch[1],opportunity=getOpportunity(db,studio.id,oid);
     if(opportunityMatch[2]==='planning'&&req.method==='POST'){
      if(body.revision!==opportunity.revision)fail(409,'This enquiry changed. Close and reopen it before starting planning.');
      if(!opportunity.projectId)fail(409,'Create a linked project first.');
      if(opportunity.stage==='Lost')fail(409,'Reopen the enquiry before starting planning.');
      if(!opportunity.reviewedAt)fail(409,'Review the request before starting planning.');
      const project=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(opportunity.projectId,studio.id).data);
      if(project.status!=='Enquiry'||body.projectUpdatedAt!==project.updatedAt)fail(409,'The project changed. Close and reopen this enquiry before starting planning.');
      transaction(db,()=>{project.status='Planning';event(project,user,'Started project planning');saveProject(db,project);db.prepare('UPDATE crm_opportunities SET revision=revision+1,updated_at=? WHERE id=? AND studio_id=?').run(now(),oid,studio.id);logActivity(db,studio.id,user,opportunity.clientId,{kind:'Note',title:'Project planning started',detail:'Booking confirmation is recorded separately.'},oid);});
      return reply(200,{project:decorate(project),opportunity:getOpportunity(db,studio.id,oid)});
     }
     if(opportunityMatch[2]==='review'&&req.method==='POST')return reply(200,{opportunity:reviewOpportunity(db,studio.id,user,oid,body)});
     if(opportunityMatch[2]==='activities'&&req.method==='POST')return reply(201,{activities:logActivity(db,studio.id,user,opportunity.clientId,body,oid)});
     if(opportunityMatch[2]==='project'&&req.method==='POST'){
      if(opportunity.projectId)fail(409,'This opportunity already has a project.');
      if(body.revision!==opportunity.revision)fail(409,'This opportunity changed while you were editing. Refresh and try again.');
      const client=db.prepare('SELECT name,email FROM clients WHERE id=? AND studio_id=?').get(opportunity.clientId,studio.id);
      if(!client)fail(404,'Client not found.');
      const p=makeProject(studio.id,brief({...body,name:client.name,email:client.email,workflowType:body.workflowType||branding(studio.id).profession||DEFAULT_WORKFLOW}),user,client.id);
      transaction(db,()=>{
       insertProject(db,p);
       db.prepare('DELETE FROM crm_opportunities WHERE project_id=? AND studio_id=?').run(p.id,studio.id);
       const updated=db.prepare('UPDATE crm_opportunities SET project_id=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND project_id IS NULL AND revision=?').run(p.id,now(),oid,studio.id,body.revision);
       if(!updated.changes)fail(409,'This opportunity changed while you were editing. Refresh and try again.');
       logActivity(db,studio.id,user,opportunity.clientId,{kind:'Note',title:'Project created from opportunity',detail:p.title},oid);
      });
      return reply(201,{project:decorate(p),opportunity:getOpportunity(db,studio.id,oid)});
     }
     if(!opportunityMatch[2]&&req.method==='GET')return reply(200,{opportunity});
     if(!opportunityMatch[2]&&req.method==='PATCH')return reply(200,{opportunity:updateOpportunity(db,studio.id,user,oid,body)});
     fail(405,'Method not allowed.');
    }
    if(route==='/api/crm/tasks'){
     requireOwner();
     if(req.method==='GET')return reply(200,{tasks:listTasks(db,studio.id)});
     if(req.method==='POST')return reply(201,{task:createTask(db,studio.id,user,body)});
     fail(405,'Method not allowed.');
    }
    const crmTaskMatch=route.match(/^\/api\/crm\/tasks\/([a-f0-9-]+)$/);
    if(crmTaskMatch){requireOwner();if(req.method==='PATCH')return reply(200,{task:updateTask(db,studio.id,user,crmTaskMatch[1],body)});fail(405,'Method not allowed.');}
    const crmClientActivitiesMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)\/activities$/);
    if(crmClientActivitiesMatch){
     requireOwner();const cid=crmClientActivitiesMatch[1];
     if(req.method==='GET')return reply(200,{activities:listActivities(db,studio.id,cid)});
     if(req.method==='POST')return reply(201,{activities:logActivity(db,studio.id,user,cid,body)});
     fail(405,'Method not allowed.');
    }
    if(route==='/api/conversations'){
     if(req.method==='GET'){
      const rows=db.prepare('SELECT c.* FROM conversations c WHERE c.studio_id=? ORDER BY c.updated_at DESC,c.id').all(studio.id).filter(c=>owner||conversationAccess(db,c,user.id));
      return reply(200,{conversations:rows.map(c=>conversationDTO(db,c,user))});
     }
     if(req.method==='POST'){
      requireOwner();const clientId=str(body.clientId,100),projectId=body.projectId?str(body.projectId,100):null,subject=str(body.subject,200),text=str(body.text||'',5000);
      if(!subject)fail(400,'Add a conversation subject.');const client=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientId,studio.id);if(!client)fail(404,'Client not found.');
      const project=projectId?db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(projectId,studio.id):null;
      if(projectId&&(!project||projectClientId(db,studio.id,projectId)!==client.id))fail(404,'This project does not belong to this client.');
      let created=false;const conversation=transaction(db,()=>{
       let c=project?materializeProjectConversation(db,JSON.parse(project.data)):null;
       if(!c){created=true;const cid=id(),at=now();db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)').run(cid,studio.id,client.id,null,subject,'Open',at,at);c=db.prepare('SELECT * FROM conversations WHERE id=?').get(cid);}
       if(text){const messageId=appendConversationMessage(db,c,user,studio.role,text);if(c.project_id)queueProjectEvent(studio.id,c.project_id,user.id,messageId);else recordMessage(db,{studioId:studio.id,conversationId:c.id,messageId,actorUserId:user.id});}
       return conversationDTO(db,db.prepare('SELECT * FROM conversations WHERE id=?').get(c.id),user);
      });return reply(created?201:200,{conversation});
     }
     fail(405,'Method not allowed.');
    }
    const conversationMatch=route.match(/^\/api\/conversations\/([a-f0-9-]+)(?:\/(messages|seen|status))?$/);
    if(conversationMatch){
     const c=db.prepare('SELECT * FROM conversations WHERE id=? AND studio_id=?').get(conversationMatch[1],studio.id);
     const accessRole=c&&(owner?'Owner':conversationAccess(db,c,user.id));if(!accessRole)fail(404,'Conversation not found.');const action=conversationMatch[2];
     if(!action&&req.method==='GET')return reply(200,{conversation:conversationDTO(db,c,user)});
     if(req.method!=='POST')fail(405,'Method not allowed.');
     if(action==='messages'){if(accessRole==='Viewer')fail(403,'This participant has view-only access.');const text=str(body.text||'',5000),clientKey=body.clientMessageId?str(body.clientMessageId,120):null;transaction(db,()=>{const messageId=appendConversationMessage(db,c,user,staffViewer?'owner':studio.role,text,clientKey,body);if(c.project_id)queueProjectEvent(studio.id,c.project_id,user.id,messageId);else recordMessage(db,{studioId:studio.id,conversationId:c.id,messageId,actorUserId:user.id});});}
     else if(action==='seen'){if(!markConversationSeen(db,c,user,str(body.lastMessageId,100)))fail(400,'Choose a message in this conversation.');}
     else if(action==='status'){requireOwner();if(!['Open','Waiting','Resolved'].includes(body.status))fail(400,'Choose a conversation status.');setConversationStatus(db,c,user,body.status);}
     else fail(405,'Method not allowed.');
     return reply(200,{conversation:conversationDTO(db,db.prepare('SELECT * FROM conversations WHERE id=?').get(c.id),user)});
    }
    if(route==='/api/organizations'){
     requireOwner();
     if(req.method==='GET')return reply(200,{organizations:db.prepare('SELECT * FROM crm_organizations WHERE studio_id=? ORDER BY name').all(studio.id).map(o=>({id:o.id,name:o.name,website:o.website}))});
     if(req.method==='POST'){const name=str(body.name,200),website=safeURL(body.website||'');if(!name)fail(400,'Add an organisation name.');const organization={id:id(),name,website};db.prepare('INSERT INTO crm_organizations VALUES(?,?,?,?,?,?)').run(organization.id,studio.id,name,website,now(),now());return reply(201,{organization});}
     fail(405,'Method not allowed.');
    }
    const clientContactsMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)\/(contacts|organization)$/);
    if(clientContactsMatch){
     requireOwner();const client=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientContactsMatch[1],studio.id);if(!client)fail(404,'Client not found.');
     if(clientContactsMatch[2]==='organization'){
      if(req.method==='GET'){const o=db.prepare(`SELECT o.id,o.name,o.website FROM crm_client_organizations co JOIN crm_organizations o ON o.id=co.organization_id AND o.studio_id=co.studio_id WHERE co.client_id=? AND co.studio_id=?`).get(client.id,studio.id);return reply(200,{organization:o||null});}
      if(req.method==='PATCH'){const organizationId=body.organizationId?str(body.organizationId,100):null;if(organizationId&&!db.prepare('SELECT id FROM crm_organizations WHERE id=? AND studio_id=?').get(organizationId,studio.id))fail(404,'Organisation not found.');transaction(db,()=>{db.prepare('DELETE FROM crm_client_organizations WHERE client_id=? AND studio_id=?').run(client.id,studio.id);if(organizationId)db.prepare('INSERT INTO crm_client_organizations VALUES(?,?,?)').run(client.id,studio.id,organizationId);});return reply(200,{organization:organizationId?db.prepare('SELECT id,name,website FROM crm_organizations WHERE id=?').get(organizationId):null});}
     }else{
      if(req.method==='GET')return reply(200,{contacts:listClientContacts(db,studio.id,client.id)});
      if(req.method==='POST'){const name=str(body.name,120),mail=email(body.email),phone=str(body.phone||'',60),organizationId=body.organizationId?str(body.organizationId,100):null;if(!name)fail(400,'Add a contact name.');if(organizationId&&!db.prepare('SELECT id FROM crm_organizations WHERE id=? AND studio_id=?').get(organizationId,studio.id))fail(404,'Organisation not found.');let contact=db.prepare('SELECT * FROM crm_contacts WHERE studio_id=? AND email=?').get(studio.id,mail);if(contact&&db.prepare('SELECT 1 FROM crm_client_contacts WHERE client_id=? AND contact_id=?').get(client.id,contact.id))fail(409,'This person is already on the relationship.');transaction(db,()=>{if(!contact){const contactId=id(),created=now();db.prepare(`INSERT INTO crm_contacts(id,studio_id,name,email,phone,organization_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(contactId,studio.id,name,mail,phone,organizationId,created,created);contact=db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(contactId);}db.prepare(`INSERT INTO crm_client_contacts(studio_id,client_id,contact_id,role,primary_contact,account_access) VALUES(?,?,?,'Contact',0,0)`).run(studio.id,client.id,contact.id);});return reply(201,{contact:listClientContacts(db,studio.id,client.id).find(c=>c.id===contact.id)});}
     }
     fail(405,'Method not allowed.');
    }
    const contactMatch=route.match(/^\/api\/contacts\/([a-f0-9-]+)$/);
    if(contactMatch){
     requireOwner();const contact=db.prepare('SELECT * FROM crm_contacts WHERE id=? AND studio_id=?').get(contactMatch[1],studio.id);if(!contact)fail(404,'Contact not found.');if(req.method!=='PATCH')fail(405,'Method not allowed.');
     const name=str(body.name,120),mail=email(body.email),phone=str(body.phone||'',60),organizationId=body.organizationId?str(body.organizationId,100):null;if(!name)fail(400,'Add a contact name.');
     if(organizationId&&!db.prepare('SELECT id FROM crm_organizations WHERE id=? AND studio_id=?').get(organizationId,studio.id))fail(404,'Organisation not found.');
     if(mail!==contact.email&&db.prepare('SELECT id FROM crm_contacts WHERE studio_id=? AND email=?').get(studio.id,mail))fail(409,'Another contact already uses this email.');
     const primaryAccounts=db.prepare('SELECT client_id FROM crm_client_contacts WHERE studio_id=? AND contact_id=? AND primary_contact=1').all(studio.id,contact.id);
     if(primaryAccounts.some(a=>db.prepare('SELECT id FROM clients WHERE studio_id=? AND email=? AND id<>?').get(studio.id,mail,a.client_id)))fail(409,'Another client record already uses this email.');
     transaction(db,()=>{db.prepare('UPDATE crm_contacts SET name=?,email=?,phone=?,organization_id=?,updated_at=? WHERE id=? AND studio_id=?').run(name,mail,phone,organizationId,now(),contact.id,studio.id);for(const a of primaryAccounts){const row=db.prepare('SELECT data FROM clients WHERE id=? AND studio_id=?').get(a.client_id,studio.id),data=JSON.parse(row.data);data.phone=phone;data.updatedAt=now();db.prepare('UPDATE clients SET name=?,email=?,data=? WHERE id=? AND studio_id=?').run(name,mail,JSON.stringify(data),a.client_id,studio.id);}});
     return reply(200,{contact:db.prepare('SELECT id,name,email,phone,organization_id AS organizationId,user_id AS portalUserId FROM crm_contacts WHERE id=?').get(contact.id)});
    }
    const stakeholdersMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/stakeholders(?:\/([a-f0-9-]+)(?:\/(invite))?)?$/);
    if(stakeholdersMatch){
     requireOwner();const projectId=stakeholdersMatch[1],clientId=projectClientId(db,studio.id,projectId);if(!clientId)fail(404,'Project not found.');const contactId=stakeholdersMatch[2],invite=stakeholdersMatch[3];
     if(!contactId&&req.method==='GET')return reply(200,{stakeholders:listStakeholders(db,studio.id,projectId)});
     if(!contactId&&req.method==='POST'){const cid=str(body.contactId,100),role=body.role;if(!['Approver','Collaborator','Viewer'].includes(role))fail(400,'Choose a project role.');const contact=db.prepare(`SELECT ct.id FROM crm_contacts ct JOIN crm_client_contacts cc ON cc.contact_id=ct.id AND cc.studio_id=ct.studio_id WHERE ct.id=? AND ct.studio_id=? AND cc.client_id=?`).get(cid,studio.id,clientId);if(!contact)fail(404,'Choose a contact on this relationship.');if(db.prepare('SELECT 1 FROM crm_project_stakeholders WHERE project_id=? AND contact_id=?').get(projectId,cid))fail(409,'This person is already on the project.');db.prepare('INSERT INTO crm_project_stakeholders VALUES(?,?,?,?,1,0)').run(projectId,studio.id,cid,role);return reply(201,{stakeholders:listStakeholders(db,studio.id,projectId)});}
     const contact=contactId?db.prepare(`SELECT ct.email,ps.primary_contact FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE ps.project_id=? AND ps.studio_id=? AND ps.contact_id=?`).get(projectId,studio.id,contactId):null;
     if(!contact)fail(404,'Project participant not found.');if(invite&&req.method==='POST')return reply(201,createInvitation(contact.email));
     if(!invite&&req.method==='PATCH'){if(contact.primary_contact)fail(403,'The primary project contact cannot be changed here.');if(body.remove===true){db.prepare('DELETE FROM crm_project_stakeholders WHERE project_id=? AND studio_id=? AND contact_id=?').run(projectId,studio.id,contactId);}else{if(!['Approver','Collaborator','Viewer'].includes(body.role))fail(400,'Choose a project role.');db.prepare('UPDATE crm_project_stakeholders SET role=? WHERE project_id=? AND studio_id=? AND contact_id=?').run(body.role,projectId,studio.id,contactId);}return reply(200,{stakeholders:listStakeholders(db,studio.id,projectId)});}
     fail(405,'Method not allowed.');
    }
    if(route==='/api/clients'){
     requireOwner();
     if(req.method==='GET'){const clients=db.prepare('SELECT * FROM clients WHERE studio_id=? ORDER BY name').all(studio.id).map(clientDTO);return reply(200,{clients});}
     if(req.method==='POST'){const name=str(body.name,120),mail=email(body.email);if(!name)fail(400,'Add a client name.');if(db.prepare('SELECT id FROM clients WHERE studio_id=? AND email=?').get(studio.id,mail))fail(409,'This client already has a record.');const client={id:id(),name,email:mail,company:str(body.company||'',200),phone:str(body.phone||'',60),stage:'Lead',source:'Added by studio',tags:[],notes:[],followUp:'',createdAt:now(),updatedAt:now()};const {id:cid,name:cn,email:ce,...data}=client;transaction(db,()=>{db.prepare('INSERT INTO clients VALUES(?,?,?,?,?)').run(cid,studio.id,ce,cn,JSON.stringify(data));ensurePrimaryContact(db,db.prepare('SELECT * FROM clients WHERE id=?').get(cid));});return reply(201,{client});}
     fail(405,'Method not allowed.');
    }
    const clientMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)(?:\/(notes|invite))?$/);
    if(clientMatch){requireOwner();const row=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientMatch[1],studio.id);if(!row)fail(404,'Client not found.');const data=JSON.parse(row.data);let name=row.name;
     if(!clientMatch[2]&&req.method==='GET')return reply(200,{client:clientDTO(row)});
     if(clientMatch[2]==='invite'&&req.method==='POST'){const primary=db.prepare(`SELECT ct.email FROM crm_client_contacts cc JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id WHERE cc.studio_id=? AND cc.client_id=? AND cc.primary_contact=1`).get(studio.id,row.id);return reply(201,createInvitation(primary?.email||row.email));}
     if(clientMatch[2]==='notes'&&req.method==='POST'){const text=str(body.text,5000);if(!text)fail(400,'Write a note first.');data.notes.unshift({id:id(),text,by:user.name,at:now()});}
     else if(!clientMatch[2]&&req.method==='PATCH'){name=str(body.name,120);if(!name||!['Lead','Active','Past client','VIP'].includes(body.stage))fail(400,'Add a client name and relationship stage.');if(!Array.isArray(body.tags)||body.tags.length>20)fail(400,'Use up to 20 tags.');const followUp=date(body.followUp,'follow-up date');Object.assign(data,{company:str(body.company||'',200),phone:str(body.phone||'',60),source:str(body.source||'',200),stage:body.stage,tags:body.tags.map(t=>str(t,50)).filter(Boolean),followUp,followUpNote:str(body.followUpNote||'',500)});}
     else fail(405,'Method not allowed.');data.updatedAt=now();transaction(db,()=>{db.prepare('UPDATE clients SET name=?,data=? WHERE id=? AND studio_id=?').run(name,JSON.stringify(data),row.id,studio.id);const primary=db.prepare('SELECT contact_id FROM crm_client_contacts WHERE studio_id=? AND client_id=? AND primary_contact=1').get(studio.id,row.id);if(primary)db.prepare('UPDATE crm_contacts SET name=?,phone=?,updated_at=? WHERE id=? AND studio_id=?').run(name,data.phone||'',now(),primary.contact_id,studio.id);});return reply(200,{client:clientDTO(db.prepare('SELECT * FROM clients WHERE id=?').get(row.id))});
    }
    if(route==='/api/projects'&&req.method==='GET'){const all=(owner||staffViewer?db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studio.id):db.prepare(`SELECT DISTINCT p.data FROM projects p JOIN crm_project_stakeholders ps ON ps.project_id=p.id AND ps.studio_id=p.studio_id JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE p.studio_id=? AND ps.portal_access=1 AND ct.user_id=?`).all(studio.id,user.id)).map(row=>JSON.parse(row.data));return reply(200,{projects:all.map(decorate).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});}
    if(route==='/api/projects'&&req.method==='POST'){requireOwner();const p=makeProject(studio.id,brief({...body,workflowType:body.workflowType||branding(studio.id).profession||DEFAULT_WORKFLOW}),user,body.clientId?str(body.clientId,100):null);insertProject(db,p);return reply(201,{project:decorate(p)});}
    if(route==='/api/invoices'){
     requireOwner();if(req.method!=='GET')fail(405,'Method not allowed.');return reply(200,{invoices:invoiceRows(db,studio.id).map(row=>invoiceDTO(db,row))});
    }
    if(route===`/api/studios/${studio.id}/stripe-status`&&req.method==='GET'){
     const connected=db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studio.id);
     let chargesEnabled=false;
     if(stripeReady&&connected){try{const account=await stripe.accounts.retrieve(connected.stripe_account_id);chargesEnabled=account.id===connected.stripe_account_id&&account.charges_enabled===true;}catch{/* Provider availability is checked again before Checkout. */}}
     return reply(200,{stripe:{configured:stripeReady,connected:!!connected,chargesEnabled}});
    }
    const engagementMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/engagements(?:\/([a-z-]+))?$/);
    if(engagementMatch){const args={studioId:studio.id,projectId:engagementMatch[1],userId:user.id};if(req.method==='GET'&&!engagementMatch[2])return reply(200,getEngagements(db,args));if(req.method==='POST'&&engagementMatch[2]){const result=changeEngagements(db,{...args,action:engagementMatch[2],body});await syncProjectArchives(db,args);return reply(200,result);}fail(405,'Method not allowed.');}
    const calendarMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/calendar\.ics$/);
    if(calendarMatch&&req.method==='GET'){const calendar=projectCalendar(db,{studioId:studio.id,projectId:calendarMatch[1],userId:user.id});res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="caleane-project.ics"','Cache-Control':'private, no-store'});return res.end(calendar);}
    const documentMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/documents(?:\/([a-f0-9-]+)\/pdf)?$/);
    if(documentMatch){const args={studioId:studio.id,projectId:documentMatch[1],userId:user.id};if(documentMatch[2]&&req.method==='GET'){const file=downloadDocument(db,args,documentMatch[2]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(file.content));}if(!documentMatch[2]&&req.method==='GET')return reply(200,await listDocuments(db,args));if(!documentMatch[2]&&req.method==='POST')return reply(200,await changeDocument(db,args,body));fail(405,'Method not allowed.');}
    const operationsMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/operations(?:\/([a-z-]+))?$/);
    if(operationsMatch){
     const args={studioId:studio.id,projectId:operationsMatch[1],userId:user.id};
     if(req.method==='GET'&&!operationsMatch[2])return reply(200,{operations:getProjectOperations(db,args)});
     if(req.method==='POST'&&operationsMatch[2]){const result=transaction(db,()=>{const changed=changeProjectOperations(db,{...args,action:operationsMatch[2],body});queueProjectEvent(studio.id,changed.project.id,user.id,changed.project.activity?.[0]?.id);return changed;});return reply(200,{project:decorate(result.project),operations:result.operations});}
     fail(405,'Method not allowed.');
    }
    const invoiceMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/invoices(?:\/(plan|[a-f0-9-]+)(?:\/(payments|cancel|credit-notes|refunds|checkout(?:\/expire)?|attempts))?)?$/);
    if(invoiceMatch){
     const projectRow=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(invoiceMatch[1],studio.id);
     const accessRole=projectRow&&(owner?'Owner':projectAccess(db,studio.id,projectRow.id,user.id));
     if(!accessRole)fail(404,'Project not found.');
     if(!owner&&accessRole!=='Approver')fail(403,'Only the project approver can see billing.');
     const project=JSON.parse(projectRow.data),invoiceId=invoiceMatch[2],subaction=invoiceMatch[3];
     const issueInvoice=(project,body,afterInsert)=>{
      const estimate=project.estimates?.find(item=>item.id===body.estimateId);
      if(!estimate||estimate.id!==project.estimates.at(-1)?.id||estimate.status!=='Budget confirmed'||estimate.briefRevision!==project.briefRevision)fail(409,'Ask the client to confirm the latest estimate before issuing an invoice.');
      const existing=db.prepare('SELECT estimate_id,amount_minor,net_minor FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').all(studio.id,project.id);
      if(existing.some(item=>item.estimate_id!==estimate.id))fail(409,'An earlier estimate has active invoices. Review those bills before invoicing a new version.');
      const billedMinor=existing.reduce((sum,item)=>sum+item.amount_minor,0),remainingMinor=estimate.total-billedMinor;
      if(!Number.isSafeInteger(remainingMinor)||remainingMinor<=0)fail(409,'This project has no uninvoiced estimate balance.');
      const kind=body.kind;if(!['Deposit','Balance','Full'].includes(kind))fail(400,'Choose a deposit, balance or full invoice.');const label=str(body.label||'',60);
      if(kind==='Full'&&existing.length)fail(409,'Issue a balance invoice for the remaining amount.');
      if(kind==='Balance'&&!existing.length)fail(409,'Issue a full invoice or a deposit first.');
      let amountMinor=remainingMinor;
      if(kind==='Deposit'){amountMinor=body.amountMinor;if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>=remainingMinor)fail(400,'Enter an amount smaller than the remaining estimate total.');}
      const saved=billingDefaults(db,studio.id),dueDate=date(body.dueDate,'invoice due date'),supplyDate=date(body.supplyDate||project.brief?.date||'','service date'),paymentInstructions=str(body.paymentInstructions||saved.paymentInstructions||'',1000),note=str(body.note||'',3000);
      const sellerAddress=str(body.sellerAddress||saved.sellerAddress||'',500),sellerContact=str(body.sellerContact||saved.sellerContact||'',300),customerAddress=str(body.customerAddress||'',500),taxRegistration=str(body.taxRegistration||saved.taxRegistration||'',100);
      if(!dueDate||!supplyDate||!sellerAddress||!sellerContact||!customerAddress||!paymentInstructions)fail(400,'Add the billing addresses, contact, service date, due date and payment instructions.');
      if(dueDate<now().slice(0,10))fail(400,'Choose an invoice due date today or later.');
      return transaction(db,()=>{
       const year=Number(now().slice(0,4));db.prepare('INSERT OR IGNORE INTO invoice_counters VALUES(?,?,1)').run(studio.id,year);
       const next=db.prepare('SELECT next_number FROM invoice_counters WHERE studio_id=? AND year=?').get(studio.id,year).next_number;
       db.prepare('UPDATE invoice_counters SET next_number=next_number+1 WHERE studio_id=? AND year=?').run(studio.id,year);
       const number=`INV-${year}-${String(next).padStart(4,'0')}`;
       const netMinor=kind==='Balance'?estimate.subtotal-existing.reduce((sum,item)=>sum+item.net_minor,0):kind==='Full'?estimate.subtotal:Math.round(estimate.subtotal*amountMinor/estimate.total);
       const taxMinor=amountMinor-netMinor;
       if(netMinor<0||taxMinor<0)fail(409,'The remaining tax breakdown needs review before invoicing.');
       const snapshot={sellerName:studio.name,sellerAddress,sellerContact,taxRegistration,billToName:project.brief?.name||'',billToEmail:project.clientEmail,customerAddress,supplyDate,projectTitle:project.title,estimate:{id:estimate.id,version:estimate.version,title:estimate.title,note:estimate.note,items:structuredClone(estimate.items),currency:estimate.currency,taxRate:estimate.taxRate,subtotal:estimate.subtotal,tax:estimate.tax,total:estimate.total,briefRevision:estimate.briefRevision,decidedAt:estimate.decidedAt||'',decidedBy:estimate.decidedBy||''}};
       const invoiceId=id(),issuedAt=now();
       db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId,studio.id,project.id,number,estimate.id,estimate.version,kind,estimate.currency,amountMinor,netMinor,taxMinor,estimate.taxRate,dueDate,note,paymentInstructions,JSON.stringify(snapshot),issuedAt,user.name);
       event(project,user,`Issued invoice ${number}`);saveProject(db,project);
       if(label)db.prepare('UPDATE invoices SET label=? WHERE id=? AND studio_id=?').run(label,invoiceId,studio.id);
       afterInsert?.(invoiceId);
       return db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoiceId,studio.id);
      });
     };
     if(invoiceId==='plan'){
      if(subaction)fail(404,'Not found.');
      const view=()=>planView(db,studio.id,project,invoiceRows(db,studio.id,project.id).map(row=>invoiceDTO(db,row)));
      if(req.method==='GET')return reply(200,{plan:view(),defaults:owner?billingDefaults(db,studio.id):undefined});
      if(req.method!=='POST')fail(405,'Method not allowed.');
      requireOwner();
      if(body.action==='create')transaction(db,()=>createPlan(db,{studioId:studio.id,project,body}));
      else if(body.action==='update')transaction(db,()=>updatePlan(db,{studioId:studio.id,project,body}));
      else if(body.action==='delete')transaction(db,()=>deletePlan(db,{studioId:studio.id,project}));
      else if(body.action==='issue'){
       const issued=transaction(db,()=>{const {step,body:planned}=stepInvoice(db,{studioId:studio.id,project,stepId:body.stepId});return issueInvoice(project,{...body,...planned},invoiceId=>markStepInvoiced(db,{studioId:studio.id,projectId:project.id,stepId:step.id,invoiceId}));});
       await syncProjectArchives(db,{studioId:studio.id,projectId:project.id});
       return reply(201,{plan:view(),invoice:invoiceDTO(db,issued)});
      }else fail(400,'Choose a payment plan action.');
      return reply(200,{plan:view()});
     }
     const invoice=invoiceId?db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=? AND project_id=?').get(invoiceId,studio.id,project.id):null;
     if(invoiceId&&!invoice)fail(404,'Invoice not found.');
     if(req.method==='GET'&&!invoiceId)return reply(200,{invoices:invoiceRows(db,studio.id,project.id).map(row=>invoiceDTO(db,row))});
     if(req.method==='GET'&&invoiceId&&!subaction)return reply(200,{invoice:invoiceDTO(db,invoice)});
     if(req.method==='GET'&&subaction==='attempts'){requireOwner();return reply(200,{attempts:listStripeCheckoutAttempts(db,{studioId:studio.id,invoiceId})});}
     if(req.method==='POST'&&subaction==='checkout'){
      if(!stripeReady)fail(503,'Stripe Checkout and its signed webhook must be configured together.');
      const attempt=await createStripeCheckout(db,stripe,{studioId:studio.id,projectId:project.id,invoiceId,accessRole,appOrigin:origin});
      return reply(200,{url:attempt.url,sessionId:attempt.sessionId,attempt});
     }
     if(req.method==='POST'&&subaction==='checkout/expire'){
      requireOwner();if(!stripe)fail(503,'Stripe Checkout is not configured.');
      const attempt=await expireStripeCheckout(db,stripe,{studioId:studio.id,projectId:project.id,invoiceId,ownerUserId:user.id});
      return reply(200,{attempt,invoice:invoiceDTO(db,invoice)});
     }
     if(req.method!=='POST')fail(405,'Method not allowed.');
     requireOwner();
     if(!invoiceId){
      const issued=issueInvoice(project,body);
      await syncProjectArchives(db,{studioId:studio.id,projectId:project.id});return reply(201,{invoice:invoiceDTO(db,issued)});
     }
     if(subaction==='credit-notes'||subaction==='refunds'){
      if(activeStripeCheckout(db,{studioId:studio.id,invoiceId:invoice.id}))fail(409,'Resolve the active Stripe Checkout before adjusting this invoice.');
      const current=invoiceDTO(db,invoice);
      if(subaction==='credit-notes'){const number=issueCreditNote(db,{studioId:studio.id,invoice,user,body});event(project,user,`Issued credit note ${number} against invoice ${invoice.number}`);}
      else if(body.creditNote===true){const number=refundWithCredit(db,{studioId:studio.id,invoice,user,body,grossPaidMinor:current.grossPaidMinor});event(project,user,`Refunded ${invoice.number} and issued credit note ${number}`);}
      else{recordRefund(db,{studioId:studio.id,invoice,user,body,grossPaidMinor:current.grossPaidMinor});event(project,user,`Recorded a refund on invoice ${invoice.number}`);}
      saveProject(db,project);
      return reply(200,{invoice:invoiceDTO(db,db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoice.id,studio.id))});
     }
     if(subaction==='cancel'){
      const reason=str(body.reason||'',1000);if(!reason)fail(400,'Give a reason for cancelling this invoice.');
      const result=transaction(db,()=>{
       if(activeStripeCheckout(db,{studioId:studio.id,invoiceId:invoice.id}))fail(409,'Resolve the active Stripe Checkout before cancelling this invoice.');
       const current=invoiceDTO(db,invoice);if(current.status==='Cancelled')fail(409,'This invoice has already been cancelled.');
       if(current.grossPaidMinor)fail(409,'An invoice with recorded payments needs a credit note and refund instead of cancellation.');
       db.prepare('UPDATE invoices SET cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=? AND studio_id=? AND project_id=? AND cancelled_at IS NULL').run(now(),user.name,reason,invoice.id,studio.id,project.id);
       event(project,user,`Cancelled invoice ${invoice.number}`);saveProject(db,project);
       return db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoice.id,studio.id);
      });
      return reply(200,{invoice:invoiceDTO(db,result)});
     }
     if(subaction==='payments'){
      const amountMinor=body.amountMinor,method=body.method,receivedAt=date(body.receivedAt,'payment date');
      if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)fail(400,'Enter a payment amount.');
      if(!['bank_transfer','paypal_external','stripe_external','other_external'].includes(method))fail(400,'Choose how the payment was received.');
      if(!receivedAt||receivedAt>now().slice(0,10))fail(400,'Choose a payment date no later than today.');
      const reference=str(body.reference||'',160),note=str(body.note||'',1000),clientKey=body.clientPaymentId?str(body.clientPaymentId,120):null;
      if(clientKey&&!/^[a-zA-Z0-9_-]{8,120}$/.test(clientKey))fail(400,'Use a valid payment reference key.');
      const result=transaction(db,()=>{
       if(activeStripeCheckout(db,{studioId:studio.id,invoiceId:invoice.id}))fail(409,'Resolve the active Stripe Checkout before recording an external payment.');
       const current=invoiceDTO(db,invoice);
       if(clientKey){const previous=db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=? AND client_key=?').get(invoice.id,clientKey);if(previous){if(previous.amount_minor!==amountMinor||previous.method!==method||previous.reference!==reference||previous.received_at!==receivedAt||previous.note!==note)fail(409,'This payment key has already been used.');return invoice;}}
       if(current.status==='Cancelled')fail(409,'This invoice has been cancelled.');
       if(amountMinor>current.balanceMinor)fail(409,'The payment exceeds the invoice balance.');
       db.prepare(`INSERT INTO invoice_payments(id,studio_id,invoice_id,amount_minor,method,reference,received_at,note,recorded_at,recorded_by,source,client_key)
        VALUES(?,?,?,?,?,?,?,?,?,?,'owner_recorded',?)`).run(id(),studio.id,invoice.id,amountMinor,method,reference,receivedAt,note,now(),user.name,clientKey);
       event(project,user,`Recorded an external payment for invoice ${invoice.number}`);saveProject(db,project);
       return invoice;
      });
      return reply(200,{invoice:invoiceDTO(db,result)});
     }
     fail(404,'Not found.');
    }
    if(route==='/api/settings'&&req.method==='PATCH'){requireOwner();const name=str(body.name,120),accent=str(body.accent,7);if(!name||!/^#[0-9a-f]{6}$/i.test(accent)||!Array.isArray(body.origins)||body.origins.length>20)fail(400,'Check your studio settings.');const profession=body.profession||branding(studio.id).profession||DEFAULT_WORKFLOW;if(!isWorkflowId(profession))fail(400,'Choose a valid studio practice.');const brand={portalTitle:str(body.portalTitle||name,120),welcome:str(body.welcome||'Your project, thoughtfully brought together.',300),logoUrl:safeURL(body.logoUrl||''),profession,projectTypes:(Array.isArray(body.projectTypes)?body.projectTypes:projectTypesFor(profession)).slice(0,20).map(v=>str(v,120)).filter(Boolean),intakeQuestions:validateIntakeQuestions(body.intakeQuestions===undefined?(branding(studio.id).intakeQuestions||[]):body.intakeQuestions)};const origins=body.origins.map(v=>{const u=new URL(safeURL(v));return u.origin;});db.prepare('UPDATE studios SET name=?,accent=?,origins=? WHERE id=?').run(name,accent,JSON.stringify([...new Set([origin,...origins])]),studio.id);db.prepare('INSERT INTO studio_branding VALUES(?,?) ON CONFLICT(studio_id) DO UPDATE SET data=excluded.data').run(studio.id,JSON.stringify(brand));return reply(200,{ok:true});}
    const draftUploadMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/drafts\/files$/);
    if(draftUploadMatch){
     requireOwner();if(req.method!=='POST')fail(405,'Method not allowed.');
     const projectRow=db.prepare('SELECT id FROM projects WHERE id=? AND studio_id=?').get(draftUploadMatch[1],studio.id);if(!projectRow)fail(404,'Project not found.');
     rate(req,'design-upload',40);const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');
     if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');
     let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');
     const fileId=id();transaction(db,()=>{db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fileId,projectRow.id,name,mime,data);db.prepare('INSERT INTO design_assets VALUES(?,?,?,?,?)').run(fileId,studio.id,projectRow.id,user.id,now());});
     return reply(201,{asset:{fileId,name,mime,size:data.length}});
    }
    const draftMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/drafts(?:\/([a-f0-9-]+)(?:\/(share))?)?$/);
    if(draftMatch){
     requireOwner();const projectRow=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(draftMatch[1],studio.id);if(!projectRow)fail(404,'Project not found.');
     const project=JSON.parse(projectRow.data),draftId=draftMatch[2],operation=draftMatch[3];
     const draftDTO=row=>designDraftDTO(db,project.id,row);
     const assetIds=()=>{const ids=body.assetIds??(body.fileId?[body.fileId]:[]);if(!Array.isArray(ids)||ids.length>8||ids.some(v=>typeof v!=='string'||!/^[a-f0-9-]{36}$/.test(v))||new Set(ids).size!==ids.length)fail(400,'Choose up to eight distinct project files.');for(const fileId of ids)if(!db.prepare('SELECT id FROM files WHERE id=? AND project_id=?').get(fileId,project.id))fail(400,'Choose files from this project.');return ids;};
     const assetSnapshot=ids=>ids.map(fileId=>{const file=db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(fileId,project.id);return {fileId,name:file.name,mime:file.mime,size:file.content.length,sha256:hash(Buffer.from(file.content))};});
     if(!draftId){
      if(req.method==='GET')return reply(200,{drafts:db.prepare('SELECT * FROM design_drafts WHERE studio_id=? AND project_id=? ORDER BY updated_at DESC').all(studio.id,project.id).map(draftDTO)});
      if(req.method!=='POST')fail(405,'Method not allowed.');
      const title=str(body.title||'',200),description=str(body.description||'',5000),ids=assetIds();if(!title)fail(400,'Give this draft a title.');if(body.briefRevision!==project.briefRevision)fail(409,'The brief changed. Review it before saving this draft.');
      const draft={id:id(),title,description,assetIds:ids,briefRevision:project.briefRevision,revision:1,status:'private',createdBy:user.id,createdAt:now(),updatedAt:now()};
      db.prepare("INSERT INTO design_drafts(id,studio_id,project_id,title,description,asset_ids,brief_revision,revision,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(draft.id,studio.id,project.id,title,description,JSON.stringify(ids),draft.briefRevision,1,'private',user.id,draft.createdAt,draft.updatedAt);
      return reply(201,{draft});
     }
     const row=db.prepare('SELECT * FROM design_drafts WHERE id=? AND studio_id=? AND project_id=?').get(draftId,studio.id,project.id);if(!row)fail(404,'Draft not found.');
     if(row.status!=='private')fail(409,'This draft has already been shared. Start another draft for a new direction.');
     if(!Number.isInteger(body.revision)||body.revision!==row.revision)fail(409,'This draft changed. Refresh before continuing.');
     if(operation==='share'){
      if(req.method!=='POST')fail(405,'Method not allowed.');
      if(row.brief_revision!==project.briefRevision)fail(409,'The brief changed after this draft was saved. Update the draft before sharing.');
      if(!row.description)fail(400,'Describe the direction before sharing it.');
      const ids=JSON.parse(row.asset_ids),assets=assetSnapshot(ids),designId=id(),sharedAt=now();
      transaction(db,()=>{
       project.designs.forEach(design=>{if(design.status==='Awaiting approval')design.status='Superseded';});
       project.designs.push({id:designId,version:project.designs.length+1,draftId:row.id,briefRevision:project.briefRevision,briefSnapshot:structuredClone(project.brief),title:row.title,description:row.description,fileId:ids[0]||'',assets,status:'Awaiting approval',at:sharedAt,sharedAt,by:user.name,byUserId:user.id,feedback:''});
       project.status='Design';event(project,user,`Shared design version ${project.designs.length}`);saveProject(db,project);
       db.prepare("UPDATE design_drafts SET status='shared',shared_design_id=?,updated_at=? WHERE id=? AND studio_id=? AND status='private' AND revision=?").run(designId,sharedAt,row.id,studio.id,row.revision);
      });
      return reply(200,{project:decorate(project),designId,draft:draftDTO(db.prepare('SELECT * FROM design_drafts WHERE id=?').get(row.id))});
     }
     if(req.method!=='PATCH')fail(405,'Method not allowed.');
     const title=str(body.title||'',200),description=str(body.description||'',5000),ids=assetIds();if(!title)fail(400,'Give this draft a title.');if(body.briefRevision!==project.briefRevision)fail(409,'The brief changed. Review it before updating this draft.');
     const updated=db.prepare("UPDATE design_drafts SET title=?,description=?,asset_ids=?,brief_revision=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND project_id=? AND status='private' AND revision=?").run(title,description,JSON.stringify(ids),project.briefRevision,now(),row.id,studio.id,project.id,row.revision);
     if(!updated.changes)fail(409,'This draft changed. Refresh before continuing.');
     return reply(200,{draft:draftDTO(db.prepare('SELECT * FROM design_drafts WHERE id=?').get(row.id))});
    }
    const match=route.match(/^\/api\/projects\/([a-f0-9-]+)(?:\/(brief|messages|inspiration|reference-layout|reference-update|reference-comments|designs|approval|changes|status|invite|files|seen|comments|tasks|estimates|estimate-decision|thread-status|decisions|decision-choice|decision-withdraw|proposals|proposal-response|proposal-withdraw)(?:\/([a-f0-9-]+))?)?$/);
    if(!match)fail(404,'Not found.');const row=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(match[1],studio.id);const accessRole=row&&(owner?'Owner':staffViewer?'Studio viewer':projectAccess(db,studio.id,row.id,user.id));if(!accessRole)fail(404,'Project not found.');const p=JSON.parse(row.data),action=match[2];
    if(!action&&req.method==='GET')return reply(200,{project:decorate(p)});
    if(action==='files'&&req.method==='GET'&&match[3]){if(staffViewer)fail(403,'Studio viewers cannot open project files.');const file=db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(match[3],p.id);if(!file)fail(404,'File not found.');const privateAsset=db.prepare('SELECT file_id FROM design_assets WHERE file_id=? AND project_id=? AND studio_id=?').get(file.id,p.id,studio.id);if(privateAsset&&!owner&&!p.designs.some(d=>d.fileId===file.id||d.assets?.some(a=>a.fileId===file.id)))fail(404,'File not found.');res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(file.content));}
    if(!['POST','PATCH'].includes(req.method))fail(405,'Method not allowed.');
    if(staffViewer)fail(403,'Studio viewers have read-only access.');
    if(!owner&&accessRole==='Viewer'&&action!=='seen')fail(403,'This participant has view-only access.');
    if(!owner&&accessRole!=='Approver'&&['approval','estimate-decision','decision-choice','proposal-response'].includes(action))fail(403,'Only a project approver can make this decision.');
    if(action==='seen'){
     const c=materializeProjectConversation(db,p);if(!markConversationSeen(db,c,user,body.lastMessageId))fail(400,'Choose the last message you have read.');return reply(200,{project:decorate(p)});
    }else if(action==='thread-status'){requireOwner();if(!['Open','Waiting','Resolved'].includes(body.status))fail(400,'Choose a conversation status.');setConversationStatus(db,materializeProjectConversation(db,p),user,body.status);return reply(200,{project:decorate(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data))});
    }else if(action==='tasks'){
     p.tasks||=[];
     if(body.taskId){const task=p.tasks.find(t=>t.id===body.taskId);if(!task)fail(404,'Task not found.');if(!owner&&task.assignee!=='client')fail(403,'Only the studio can complete this task.');
      const edits=['title','detail','due','assignee','status'].some(key=>body[key]!==undefined);if(edits){requireOwner();const title=str(body.title??task.title,200),detail=str(body.detail??task.detail??'',2000),due=date(body.due??task.due,'due date'),assignee=body.assignee??task.assignee,status=body.status??task.status??'To do';if(!title||!['studio','client'].includes(assignee)||!['To do','In progress','Completed'].includes(status))fail(400,'Check the task title, responsible party and status.');Object.assign(task,{title,detail,due,assignee,status});}
      if(body.status!==undefined&&body.completed===undefined)body.completed=body.status==='Completed';
      if(body.completed!==undefined){if(typeof body.completed!=='boolean')fail(400,'Choose a completion state.');task.completed=body.completed;task.completedBy=body.completed?user.name:'';task.completedAt=body.completed?now():'';task.status=body.completed?'Completed':body.status==='In progress'?'In progress':'To do';}else if(!edits)fail(400,'Choose a task change.');
      event(p,user,edits?'Updated task: '+task.title:`${task.completed?'Completed':'Reopened'} task: ${task.title}`);}
     else{requireOwner();const title=str(body.title,200),due=date(body.due,'due date'),detail=str(body.detail||'',2000);if(!title||!['studio','client'].includes(body.assignee))fail(400,'Add a title, assignee and valid due date.');p.tasks.push({id:id(),title,detail,due,assignee:body.assignee,status:'To do',completed:false,createdBy:user.name,at:now()});event(p,user,'Added a shared project task');}
    }else if(action==='decisions'){
     requireOwner();const previous=body.replacesId?p.decisions?.find(d=>d.id===body.replacesId):null;if(body.replacesId&&(!previous||previous.status==='Withdrawn'||previous.replacedBy))fail(409,'This choice has already changed. Refresh before revising it.');if(body.briefRevision!==undefined&&body.briefRevision!==p.briefRevision)fail(409,'The brief changed while you were writing. Review it before sharing.');const title=str(body.title,200),description=str(body.description||'',2000);if(!title||!Array.isArray(body.options)||body.options.length<2||body.options.length>4)fail(400,'Add a decision title and two to four choices.');const options=body.options.map(option=>{if(!option||typeof option!=='object'||Array.isArray(option))fail(400,'Check each choice.');const label=str(option.label,160),detail=str(option.detail||'',700),url=safeURL(option.url||'');if(!label)fail(400,'Give every choice a name.');if(option.facts!=null&&(!Array.isArray(option.facts)||option.facts.length>2))fail(400,'Add up to two details for each choice.');const facts=(option.facts||[]).map(fact=>{if(!fact||typeof fact!=='object'||Array.isArray(fact))fail(400,'Check the choice details.');return {label:str(fact.label,80),value:str(fact.value,160)};}).filter(fact=>fact.label&&fact.value);return {id:id(),label,detail,url,facts};});p.decisions||=[];const nextId=id();if(previous){previous.replacedBy=nextId;if(previous.status==='Awaiting choice')previous.status='Superseded';}p.decisions.push({id:nextId,title,description,options,status:'Awaiting choice',briefRevision:p.briefRevision,createdAt:now(),by:user.name,...(previous?{replacesId:previous.id}:{})});event(p,user,(previous?'Revised a project choice: ':'Shared a project choice: ')+title);
    }else if(action==='decision-withdraw'){
     requireOwner();const decision=p.decisions?.find(d=>d.id===body.decisionId);if(!decision||decision.status!=='Awaiting choice'||decision.replacedBy)fail(409,'Only an unanswered choice can be withdrawn.');const reason=str(body.reason||'',2000);if(!reason)fail(400,'Explain why this choice is being withdrawn.');decision.status='Withdrawn';decision.withdrawnBy=user.name;decision.withdrawnAt=now();decision.withdrawalReason=reason;event(p,user,'Withdrew a project choice: '+decision.title);
    }else if(action==='decision-choice'){
     if(owner)fail(403,'The client chooses their preference.');const decision=p.decisions?.find(d=>d.id===body.decisionId);if(!decision||decision.status!=='Awaiting choice'||decision.briefRevision!==p.briefRevision)fail(409,'This choice needs updating before a decision.');const option=decision.options.find(o=>o.id===body.optionId);if(!option)fail(400,'Choose an available option.');decision.status='Preference shared';decision.selectedOptionId=option.id;decision.note=str(body.note||'',2000);decision.decidedBy=user.name;decision.decidedAt=now();event(p,user,'Shared a preference: '+decision.title);
    }else if(action==='proposals'){
     requireOwner();p.proposals||=[];if(body.briefRevision!==p.briefRevision||(body.previousId||null)!==(p.proposals.at(-1)?.id||null))fail(409,'The brief or proposal changed. Refresh before sharing.');
     const estimate=p.estimates?.at(-1);if(!estimate||estimate.id!==body.estimateId||estimate.briefRevision!==p.briefRevision||!['Awaiting review','Budget confirmed'].includes(estimate.status))fail(409,'Create or confirm a current estimate before sharing a proposal.');
     const title=str(body.title,200),scope=str(body.scope,10000),exclusions=str(body.exclusions||'',5000),delivery=str(body.delivery,5000),expiresOn=date(body.expiresOn,'reply date');if(!title||!scope||!delivery||!expiresOn||expiresOn<now().slice(0,10))fail(400,'Add a title, scope, delivery plan and a future reply date.');
     const richDocument=body.documentHtml===undefined?{}:(await import('./engagements.mjs')).agreementDocument({termsHtml:body.documentHtml});
     p.proposals.forEach(q=>{if(q.status==='Awaiting response')q.status='Superseded';});p.proposals.push({id:id(),version:p.proposals.length+1,title,scope,exclusions,delivery,expiresOn,...(richDocument.termsHtml?{documentHtml:richDocument.termsHtml,documentFormat:richDocument.documentFormat}:{}),estimate:structuredClone(estimate),briefRevision:p.briefRevision,status:'Awaiting response',by:user.name,createdAt:now()});event(p,user,'Shared proposal version '+p.proposals.length);
    }else if(action==='proposal-response'){
     if(owner)fail(403,'A client approver responds to the proposal.');const q=p.proposals?.at(-1);if(!q||q.id!==body.proposalId||q.status!=='Awaiting response'||q.briefRevision!==p.briefRevision||q.expiresOn<now().slice(0,10))fail(409,'This proposal changed or expired. Ask the studio for an update.');if(!['accept','changes'].includes(body.decision))fail(400,'Choose accept or request changes.');const feedback=str(body.feedback||'',3000);if(body.decision==='accept'&&body.acknowledged!==true)fail(400,'Confirm that you reviewed the scope and investment.');if(body.decision==='changes'&&!feedback)fail(400,'Describe the changes you need.');q.status=body.decision==='accept'?'Scope accepted':'Changes requested';q.feedback=feedback;q.decidedBy=user.name;q.decidedByUserId=user.id;q.decidedAt=now();event(p,user,q.status+' · proposal version '+q.version);
    }else if(action==='proposal-withdraw'){
     requireOwner();const q=p.proposals?.at(-1);if(!q||q.id!==body.proposalId||q.status!=='Awaiting response')fail(409,'Only the current unanswered proposal can be withdrawn.');q.status='Withdrawn';q.withdrawnBy=user.name;q.withdrawnAt=now();event(p,user,'Withdrew proposal version '+q.version);
    }else if(action==='estimates'){
     requireOwner();p.estimates||=[];if(!Array.isArray(body.items)||body.items.length<1||body.items.length>30||!['GBP','EUR','USD'].includes(body.currency))fail(400,'Add estimate items and a supported currency.');
     const items=body.items.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))fail(400,'Check each estimate item.');const title=str(item.title,200);if(!title||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10000||!Number.isInteger(item.unitAmount)||item.unitAmount<0||item.unitAmount>100000000)fail(400,'Check item descriptions, quantities and amounts.');return {title,quantity:item.quantity,unitAmount:item.unitAmount};});
     const taxRate=body.taxRate??0;if(typeof taxRate!=='number'||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)fail(400,'Tax must be between 0 and 100.');
     const subtotal=items.reduce((sum,i)=>sum+i.quantity*i.unitAmount,0),tax=Math.round(subtotal*taxRate/100);if(subtotal>100000000)fail(400,'The estimate total is too large.');
     p.estimates.forEach(q=>{if(q.status==='Awaiting review')q.status='Superseded';});p.estimates.push({id:id(),version:p.estimates.length+1,briefRevision:p.briefRevision,title:str(body.title||'Project estimate',200),note:str(body.note||'',3000),currency:body.currency,items,taxRate,subtotal,tax,total:subtotal+tax,status:'Awaiting review',at:now(),by:user.name});event(p,user,'Shared a project estimate');
    }else if(action==='estimate-decision'){
     if(owner)fail(403,'The client confirms their budget direction.');const q=p.estimates?.find(q=>q.id===body.estimateId);if(!q||q.id!==p.estimates.at(-1)?.id||q.status!=='Awaiting review'||q.briefRevision!==p.briefRevision)fail(409,'This estimate needs updating before a decision.');if(!['confirm','changes'].includes(body.decision))fail(400,'Choose confirm or request changes.');const feedback=str(body.feedback||'',3000);if(body.decision==='changes'&&!feedback)fail(400,'Tell your studio what needs to change.');q.status=body.decision==='confirm'?'Budget confirmed':'Changes requested';q.feedback=feedback;q.decidedBy=user.name;q.decidedAt=now();event(p,user,q.status+' · estimate version '+q.version);
    }else if(action==='comments'){
     const d=p.designs.find(d=>d.id===body.designId);if(!d)fail(404,'Design version not found.');d.comments||=[];
     if(body.resolve){requireOwner();const c=d.comments.find(c=>c.id===body.commentId);if(!c)fail(404,'Comment not found.');c.resolved=true;c.resolvedBy=user.name;c.resolvedAt=now();event(p,user,'Resolved design feedback');}
     else {const text=str(body.text,3000);if(!text)fail(400,'Write your feedback first.');const primary=d.fileId||'primary';let assetId=body.assetId===undefined?primary:str(body.assetId,80);if(assetId==='primary')assetId=primary;const valid=new Set([primary,...(d.assets||[]).map(a=>a.fileId)]);if(!valid.has(assetId))fail(400,'Choose an asset from this design version.');let parentId=null;if(body.parentId){const parent=d.comments.find(c=>c.id===body.parentId);if(!parent||parent.parentId)fail(400,'Choose a top-level comment in this version.');if((parent.assetId||primary)!==assetId)fail(400,'Replies must stay with the same asset.');parentId=parent.id;}let point=null;if(body.point){if(parentId)fail(400,'Add a pin to a new comment, not a reply.');if(![body.point.x,body.point.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))fail(400,'Choose a point inside the image.');const asset=(d.assets||[]).find(a=>a.fileId===assetId);if(asset&&!asset.mime?.startsWith('image/'))fail(400,'Pins are available on images only.');point={x:body.point.x,y:body.point.y};}d.comments.push({id:id(),text,point,assetId,parentId,by:user.name,role:studio.role,at:now(),resolved:false});event(p,user,`Commented on design version ${d.version}`);}
    }else if(action==='brief'){
     if(body.revision!==p.briefRevision)fail(409,'The brief changed while you were editing. Refresh before saving.');const b=brief({...body.brief,email:p.clientEmail,workflowType:owner?body.brief.workflowType||p.brief.workflowType:p.brief.workflowType,intakeAnswers:updateIntakeAnswers(p.brief.intakeAnswers,body.brief.intakeAnswers)});if(p.briefLocked){p.changeRequests.unshift({id:id(),brief:b,baseRevision:p.briefRevision,note:str(body.note||'Requested an update to the agreed brief.',1000),status:'Pending',by:user.name,at:now()});event(p,user,'Requested a change to the approved brief');}
     else{p.briefHistory.unshift({revision:p.briefRevision,brief:p.brief,at:now(),by:user.name});p.brief=b;p.briefRevision++;event(p,user,'Updated the brief');}
    }else if(action==='messages'){const text=str(body.text,5000);if(!text)fail(400,'Write a message first.');transaction(db,()=>{const messageId=appendConversationMessage(db,materializeProjectConversation(db,p),user,studio.role,text,body.clientMessageId?str(body.clientMessageId,120):null);queueProjectEvent(studio.id,p.id,user.id,messageId);});return reply(200,{project:decorate(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data))});
    }else if(action==='inspiration'){const title=str(body.title,200),note=str(body.note||'',3000),link=safeURL(body.url||'');if(!title)fail(400,'Add a title.');if(!link&&!note)fail(400,'Add a link or a note.');p.inspiration.unshift({id:id(),title,note,url:link,category:str(body.category||'',80),source:str(body.source||'',300),comments:[],by:user.name,at:now()});event(p,user,'Added inspiration');
    }else if(action==='reference-layout'){
     requireOwner();p.referenceLayout=saveReferenceLayout(p,body);event(p,user,'Arranged the reference board');
    }else if(action==='reference-update'){
     requireOwner();const item=p.inspiration.find(ref=>ref.id===body.referenceId);if(!item)fail(404,'Reference not found.');const title=str(body.title,200);if(!title)fail(400,'Add a title.');item.title=title;item.note=str(body.note||'',3000);item.category=str(body.category||'',80);item.source=str(body.source||'',300);event(p,user,'Updated reference details');
    }else if(action==='reference-comments'){
     const item=p.inspiration.find(ref=>ref.id===body.referenceId);if(!item)fail(404,'Reference not found.');const text=str(body.text,3000);if(!text)fail(400,'Write a comment first.');let point=null;if(body.point){if(![body.point.x,body.point.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))fail(400,'Choose a point inside the image.');point={x:body.point.x,y:body.point.y};}item.comments||=[];item.comments.push({id:id(),text,point,by:user.name,role:studio.role,at:now()});event(p,user,'Discussed a project reference');
    }else if(action==='files'){
     rate(req,'upload',40);const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');const fid=id();db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fid,p.id,name,mime,data);p.inspiration.unshift({id:id(),title:str(body.title||name,200),note:str(body.note||'',3000),category:str(body.category||'',80),source:str(body.source||'',300),comments:[],fileId:fid,mime,by:user.name,at:now()});event(p,user,'Added a file');
    }else if(action==='designs'){requireOwner();const title=str(body.title,200),description=str(body.description||'',5000),fileId=str(body.fileId||'',100);if(!title||!description)fail(400,'Add a design title and description.');if(fileId&&!db.prepare('SELECT id FROM files WHERE id=? AND project_id=?').get(fileId,p.id))fail(400,'Choose a file from this project.');p.designs.forEach(d=>{if(d.status==='Awaiting approval')d.status='Superseded';});p.designs.push({id:id(),version:p.designs.length+1,briefRevision:p.briefRevision,briefSnapshot:structuredClone(p.brief),title,description,fileId,status:'Awaiting approval',at:now(),feedback:''});p.status='Design';event(p,user,`Shared design version ${p.designs.length}`);
    }else if(action==='approval'){if(owner)fail(403,'Design approval belongs to the client.');const d=p.designs.find(d=>d.id===body.designId);if(!d||d.id!==p.designs.at(-1)?.id||d.status!=='Awaiting approval')fail(409,'This version is no longer awaiting a decision. Refresh to see the latest design.');if(d.briefRevision!==p.briefRevision)fail(409,'The brief changed after this design was shared. Ask the studio to share a fresh version.');if(!['approve','changes'].includes(body.decision))fail(400,'Choose an approval or request changes.');d.feedback=str(body.feedback||'',3000);if(body.decision==='changes'&&!d.feedback)fail(400,'Tell the studio what you would like changed.');d.status=body.decision==='approve'?'Approved':'Changes requested';d.decidedAt=now();d.decidedBy=user.name;if(body.decision==='approve'){p.briefLocked=true;p.status='Approved';}event(p,user,`${d.status} · design version ${d.version}`);
    }else if(action==='changes'){requireOwner();const change=p.changeRequests.find(c=>c.id===body.changeId);if(!change||change.status!=='Pending')fail(409,'This change has already been reviewed.');if(!['accept','decline'].includes(body.decision))fail(400,'Choose accept or decline.');if(body.decision==='accept'){if(change.baseRevision!==p.briefRevision)fail(409,'A newer brief exists. Review and decline this outdated request.');p.briefHistory.unshift({revision:p.briefRevision,brief:p.brief,at:now(),by:user.name});p.brief=change.brief;p.briefRevision++;p.briefLocked=false;p.status='Design';}change.status=body.decision==='accept'?'Accepted':'Declined';event(p,user,`${change.status} a brief change request`);
    }else if(action==='status'){requireOwner();if(!['Enquiry','Planning','Design','Complete','Archived'].includes(body.status))fail(400,'Choose a valid stage.');p.status=body.status;event(p,user,`Moved project to ${p.status.toLowerCase()}`);
    }else if(action==='invite'){const primary=db.prepare(`SELECT ct.email FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE ps.project_id=? AND ps.studio_id=? AND ps.primary_contact=1`).get(p.id,studio.id);return reply(201,createInvitation(primary?.email||p.clientEmail));
    }else fail(404,'Not found.');
    transaction(db,()=>{saveProject(db,p);queueProjectEvent(studio.id,p.id,user.id,p.activity?.[0]?.id);});if(action==='proposals')await syncProjectArchives(db,{studioId:studio.id,projectId:p.id});return reply(200,{project:decorate(p)});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method not allowed.');
   if(route==='/embed.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');return res.end(await readFile(path.join(root,'public/embed.js')));}
   if(vite){const slug=route.match(/^\/intake\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?$/)?.[1];if(slug){const site=db.prepare('SELECT origins FROM studios WHERE slug=?').get(slug);if(!site)fail(404,'Studio not found.');res.setHeader('Content-Security-Policy',`frame-ancestors 'self' ${JSON.parse(site.origins).join(' ')}`);}else res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});return;}
   const asset=route.match(/^\/(app\.(?:js|css)|favicon\.svg|assets\/(?:identity\/)?[a-zA-Z0-9._-]+)$/);
   if(asset){const file=asset[1];const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain'})[ext]||'application/octet-stream');return res.end(await readFile(path.join(root,'dist',file)));}
   const intakeSlug=route.match(/^\/intake\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?$/)?.[1];
   if(intakeSlug){const s=db.prepare('SELECT origins FROM studios WHERE slug=?').get(intakeSlug);if(!s)fail(404,'Studio not found.');res.setHeader('Content-Security-Policy',`frame-ancestors 'self' ${JSON.parse(s.origins).join(' ')}`);}else res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
   if(!['/','/join','/join-studio','/login','/embed-demo','/recover','/reset-password','/verify-email','/account'].includes(route)&&!intakeSlug&&!/^\/book\/[a-z0-9-]+$/.test(route))fail(404,'Not found.');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(await readFile(path.join(root,'dist/index.html')));
  }catch(error){if(res.headersSent)return res.end();reply(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
 });
 // Reminders run hourly in a long-lived server. The hosted demo and tests pass reminderIntervalMs:0.
 const reminderTimer=reminderIntervalMs>0?setInterval(()=>runAllReminders(db,{outbox}),reminderIntervalMs):null;reminderTimer?.unref();
 server.on('close',()=>{vite?.close();if(reminderTimer)clearInterval(reminderTimer);});
 return {server,db};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4320),host=process.env.HOST||'127.0.0.1';if(host==='0.0.0.0'&&!process.env.APP_ORIGIN)throw new Error('APP_ORIGIN is required when binding publicly.');const {server}=await createWorkspace({origin:process.env.APP_ORIGIN||`http://127.0.0.1:${port}`,demo:process.env.WORKSPACE_DEMO==='1',dev:process.argv.includes('--dev'),dbFile:process.env.DATABASE_PATH||undefined});server.listen(port,host,()=>console.log(`Caleane listening on ${host}:${port}`));}
