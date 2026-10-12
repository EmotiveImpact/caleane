import {installForms,listForms,changeForm,publicForm,submitForm,listFormResponses,formResponseCSV} from './forms.mjs';
import {installDataGovernance,dataGovernance,changeGovernance,streamStudioExport} from './data-governance.mjs';
import {handleCalendarSync,syncAllCalendars} from './calendar-sync.mjs';
import {handleBookingIntegrations,safeCalendarBusy,completeBookingIntegrations,syncBookingIntegrations} from './booking-integrations.mjs';
import {operationalReadiness} from './operational-readiness.mjs';
import {invoicePdf,pdfFileName} from './invoice-pdf.mjs';
import {installDocuments,listDocuments,changeDocument,downloadDocument,syncProjectArchives} from './documents.mjs';
import {installTaskCollaboration,handleTaskCollaboration} from './task-collaboration.mjs';
import {assertQuota,cleanupUnattachedUploads} from './uploads.mjs';
import {handleConversationFileUpload} from './conversation-features.mjs';
import {createAssistant,handleAssistant} from './ai-helper.mjs';
import {handleConversationOrganiser} from './conversation-organiser.mjs';
import {handleScheduledMessages,sendDueScheduled} from './conversation-scheduled.mjs';
import {createAccountSecurity} from './account-security.mjs';
import {installEngagements,getEngagements,changeEngagements,projectCalendar} from './engagements.mjs';
import {findPlaceholders,placeholderMessage} from './src/lib/merge-fields.js';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import Stripe from 'stripe';
import {caleaneEnv} from './env-names.mjs';
import {openStore,STAFF_ACCESS,id,now,earliestOpenDay,hash,passwordHash,passwordOK,event,makeProject,saveProject,insertProject,transaction,materializeProjectConversation,conversationDTO,conversationUnreadCount,studioUnreadCounts,projectMessages,latestProjectMessage,latestProjectMessages,markConversationSeen,appendConversationMessage,setConversationStatus} from './store.mjs';
import {listOpportunities,getOpportunity,reviewOpportunity,createOpportunity,updateOpportunity,listActivities,logActivity,listTasks,createTask,updateTask,deleteTask} from './crm.mjs';
import {clientErasurePreview,eraseClient} from './client-erasure.mjs';
import {bindInvitedContact,clientShareState,clientShareStates,conversationAccess,ensurePrimaryContact,listClientContacts,listStakeholders,joinStatus,projectAccess,projectClientId,setProjectShared} from './relationships.mjs';
import {installStripePayments,activeStripeCheckout,createStripeCheckout,expireStripeCheckout,verifyStripeEvent,applyInvoiceCheckoutEvent,listStripeCheckoutAttempts} from './stripe-payments.mjs';
import {installBookingPayments,isBookingEvent,applyBookingEvent,startBookingCheckout,releaseBooking} from './booking-payments.mjs';
import {installPlanAutopay,isAutopayEvent,applyAutopayEvent,autopayView,cardPaymentSettings,saveCardPaymentSettings,startAutopaySetup,stopAutopay,runAutopay} from './plan-autopay.mjs';
import {installStripeOnboarding,startStripeOnboarding,refreshStripeOnboarding,returnFromStripeOnboarding,stripeOnboardingStatus} from './stripe-onboarding.mjs';
import {installNotifications,createNotificationOutbox,createResendDelivery,messageEmailEnabled,setMessageEmail} from './notifications.mjs';
import {installOnboarding,handleOnboarding} from './onboarding.mjs';
import {installDocumentOpens,handleDocumentOpens,documentOpens,documentOpensByProject} from './document-opens.mjs';
import {installNotificationFeed,recordProjectEvent,recordMessage,recordEnquiry,recordTeamDraft,handleNotificationFeed} from './notification-feed.mjs';
import {saveReferenceLayout} from './reference-layout.mjs';
import {installRecentlyDeleted,binItem,fileHeldInBin,listBin,restoreItem} from './recently-deleted.mjs';
import {getProjectOperations,changeProjectOperations} from './studio-operations.mjs';
import {MONEY_ACTIVITY} from './src/lib/notifications.js';
import {DEFAULT_WORKFLOW,isWorkflowId,projectTypesFor,briefFieldsFor} from './src/lib/workflows.js';
import {validateIntakeQuestions,captureIntakeAnswers,updateIntakeAnswers,normalizeIntakeAnswers} from './intake-questions.mjs';
import {searchWorkspace} from './workspace-search.mjs';
import {seedShowcase} from './demo-showcase.mjs';
import {defaultTaxRate,isVatDocument,isVatRegistered} from './src/lib/vat.js';
import {installStudioCommerce,handleStudioCommerce,billingDefaults,invoiceDesign} from './studio-commerce.mjs';
import {installBrandKit,handleBrandKit,serveBrandAsset,brandKit} from './brand-kit.mjs';
import {installInvoiceAdjustments,invoiceAdjustments,invoiceCharges,invoiceState,issueCreditNote,recordRefund,refundWithCredit} from './invoice-adjustments.mjs';
import {setTip,waiveLateFee} from './invoice-extras.mjs';
import {discountFor,invoiceFigures} from './src/lib/invoice-charges.js';
import {installReminders,handleReminders,runAllReminders} from './reminders.mjs';
import {handleCustomFields} from './custom-fields.mjs';
import {handlePipeline,syncAllPipelines,syncPipeline,syncProjectPipeline} from './pipeline-automation.mjs';
import {installConsultations,handleConsultations,publicBooking,bookConsultation,bookingSettings,publicBookingStatus,manageBooking,bookingEmail,issueManageToken} from './consultations.mjs';
import {installWebhooks,handleWebhooks,runWebhooks} from './webhooks.mjs';
import {installXero,handleXero,syncAllXero} from './xero.mjs';
import {installFinances,handleFinances} from './finances.mjs';
import {installPaymentPlans,planView,createPlan,updatePlan,deletePlan,stepInvoice,markStepInvoiced,linkIssuedDeposits} from './payment-plans.mjs';
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
function sniffMime(data){if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';if(data.toString('ascii',0,5)==='%PDF-')return 'application/pdf';return '';}
function staffProjectDTO(p){return {id:p.id,title:p.title,status:p.status,briefRevision:p.briefRevision,briefLocked:!!p.briefLocked,brief:{name:p.brief.name,occasion:p.brief.occasion,date:p.brief.date,venue:p.brief.venue,vision:p.brief.vision,colours:p.brief.colours||[],customColours:p.brief.customColours||'',pinterest:p.brief.pinterest||'',workflowType:p.brief.workflowType,details:p.brief.details||{},intakeAnswers:p.brief.intakeAnswers||[]},tasks:(p.tasks||[]).map(task=>({...task})),references:(p.inspiration||[]).map(ref=>({id:ref.id,title:ref.title,note:ref.note||'',url:ref.url||'',category:ref.category||'',source:ref.source||'',fileId:ref.fileId||'',mime:ref.mime||'',sample:ref.sample||'',by:ref.by,at:ref.at})),messages:(p.messages||[]).map(message=>({id:message.id,by:message.by,role:message.role,text:message.text,at:message.at}))};}
function invoiceDTO(db,row){
 const payments=db.prepare('SELECT * FROM invoice_payments WHERE studio_id=? AND invoice_id=? ORDER BY recorded_at,id').all(row.studio_id,row.id).map(payment=>({id:payment.id,amountMinor:payment.amount_minor,method:payment.method,reference:payment.reference,receivedAt:payment.received_at,note:payment.note,recordedAt:payment.recorded_at,recordedBy:payment.recorded_by,source:payment.source}));
 const grossPaidMinor=payments.reduce((sum,payment)=>sum+payment.amountMinor,0),adjustments=invoiceAdjustments(db,row.studio_id,row.id),extras=invoiceCharges(db,row.studio_id,row.id);
 const state=invoiceState({amountMinor:row.amount_minor,chargesMinor:extras.chargesMinor,grossPaidMinor,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,cancelled:!!row.cancelled_at}),paidMinor=state.paidMinor;
 const checkout=activeStripeCheckout(db,{studioId:row.studio_id,invoiceId:row.id});
 return {id:row.id,number:row.number,projectId:row.project_id,estimateId:row.estimate_id,estimateVersion:row.estimate_version,kind:row.kind,label:row.label||'',currency:row.currency,amountMinor:row.amount_minor,netMinor:row.net_minor,taxMinor:row.tax_minor,taxRate:row.tax_rate,discountMinor:row.discount_minor||0,discountNetMinor:row.discount_net_minor||0,discountLabel:row.discount_label||'',shareMinor:row.amount_minor+(row.discount_minor||0),lateFeeRule:row.late_fee_rule?JSON.parse(row.late_fee_rule):null,tipsAllowed:!!row.tips_allowed,charges:extras.charges,lateFeeMinor:extras.lateFeeMinor,tipMinor:extras.tipMinor,chargesMinor:extras.chargesMinor,dueDate:row.due_date,note:row.note,paymentInstructions:row.payment_instructions,snapshot:JSON.parse(row.snapshot),status:state.status,dueMinor:state.dueMinor,balanceMinor:state.balanceMinor,refundDueMinor:state.refundDueMinor,grossPaidMinor,creditedMinor:adjustments.creditedMinor,refundedMinor:adjustments.refundedMinor,credits:adjustments.credits,refunds:adjustments.refunds,issuedAt:row.issued_at,issuedBy:row.issued_by,cancelledAt:row.cancelled_at||'',cancelledBy:row.cancelled_by||'',cancelReason:row.cancel_reason||'',paidMinor,payments,checkout:checkout?{status:checkout.status,url:checkout.checkout_url||null}:null};
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
export async function createWorkspace({dbFile=path.join(root,'data/workspace.sqlite'),origin='http://127.0.0.1:4320',demo=false,showcase=false,dev=false,stripeClient=null,stripeWebhookSecret=process.env.STRIPE_WEBHOOK_SECRET||'',enableStripeCollection=caleaneEnv('STRIPE_COLLECTION_ENABLED')==='1',notificationKey=caleaneEnv('NOTIFICATION_KEY'),accountMailKey=process.env.CALEANE_ACCOUNT_MAIL_KEY||'',disableExternalServices=false,reminderIntervalMs=disableExternalServices?0:3600000,uploadCleanupIntervalMs=reminderIntervalMs,trustProxy=process.env.TRUST_PROXY||0,emailDelivery=null,emailIntervalMs=60000,scheduledIntervalMs=60000,assistant,webhookIntervalMs=disableExternalServices?0:15000,calendarIntervalMs=disableExternalServices?0:300000}={}){
 const helper=disableExternalServices?null:assistant===undefined?createAssistant():assistant;
 const previewUser=disableExternalServices?'':process.env.PREVIEW_ACCESS_USER||'',previewPass=disableExternalServices?'':process.env.PREVIEW_ACCESS_PASS||'';
 if(Boolean(previewUser)!==Boolean(previewPass)||previewUser.includes(':'))throw new Error('Set both valid PREVIEW_ACCESS_USER and PREVIEW_ACCESS_PASS to protect the preview.');
 const previewEnabled=Boolean(previewUser),previewUserDigest=previewEnabled?Buffer.from(hash(previewUser),'hex'):null,previewPassDigest=previewEnabled?Buffer.from(hash(previewPass),'hex'):null;
 await mkdir(path.dirname(dbFile),{recursive:true});const db=openStore(dbFile);installRecentlyDeleted(db);installStripePayments(db);installFinances(db);installStripeOnboarding(db);installNotifications(db);installNotificationFeed(db);installDocumentOpens(db);installOnboarding(db);installEngagements(db);installDocuments(db);installDataGovernance(db);installForms(db);installStudioCommerce(db);installInvoiceAdjustments(db);installPaymentPlans(db);installReminders(db);installConsultations(db);installBookingPayments(db);installPlanAutopay(db);installTaskCollaboration(db);installBrandKit(db);installWebhooks(db);installXero(db);const limits=new Map(),bookingLinks=new Map();
 const stripe=disableExternalServices?null:stripeClient||(process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null);
 const stripeReady=Boolean(enableStripeCollection&&stripe&&stripeWebhookSecret&&(origin.startsWith('https://')||/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)));
 // Payment at booking and plan autopay take money without an invoice being opened, so a live
 // Stripe key also needs CALEANE_STRIPE_ALLOW_LIVE=1. Until then they run in Stripe test mode only.
 const liveStripeKey=/^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY||'');
 const cardPaymentsReady=stripeReady&&(!liveStripeKey||process.env.CALEANE_STRIPE_ALLOW_LIVE==='1');
 const studioConnected=studioId=>Boolean(db.prepare('SELECT 1 FROM stripe_studio_accounts WHERE studio_id=?').get(studioId));
 const takesBookingPayment=studio=>cardPaymentsReady&&studioConnected(studio.id)&&bookingSettings(db,studio.id).payment.required;
 const autopayOffered=studioId=>cardPaymentsReady&&studioConnected(studioId)&&cardPaymentSettings(db,studioId).autopay;
 const projectNote=(studioId,projectId,text)=>{const row=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId);if(row){const p=JSON.parse(row.data);event(p,{name:'Stripe'},text);saveProject(db,p);}};
 const money=(minor,currency)=>{try{return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);}catch{return `${(minor/100).toFixed(2)} ${currency}`;}};
 const autopayHooks={
  onPaid:(charge,invoice)=>{projectNote(charge.studio_id,charge.project_id,`Autopay collected ${money(charge.amount_minor,charge.currency)} for invoice ${invoice.number}`);automate(charge.studio_id,charge.project_id);},
  onFailed:charge=>{const invoice=db.prepare('SELECT number FROM invoices WHERE id=?').get(charge.invoice_id);projectNote(charge.studio_id,charge.project_id,`Autopay could not take ${money(charge.amount_minor,charge.currency)} for invoice ${invoice?.number||''}. The invoice is still open`);},
  onSaved:(row,label)=>projectNote(row.studio_id,row.project_id,`Autopay switched on with ${label}`)};
 const collectAutopay=async()=>{if(!cardPaymentsReady)return [];try{return await runAutopay(db,stripe,autopayHooks);}catch(error){console.error('Autopay run failed:',error?.stack||error);return [];}};
 const outbox=notificationKey?createNotificationOutbox(db,{encryptionKey:notificationKey,origin}):null;
 // Pipeline rules run for a project as soon as something happens on it, not only when Pipeline opens.
 const automate=(studioId,projectId)=>syncProjectPipeline(db,studioId,projectId,{outbox});
 // Account mail has its own key when CALEANE_ACCOUNT_MAIL_KEY is set; the shared notification key still opens older queued mail.
 const accountSecurity=createAccountSecurity(db,{origin,encryptionKey:accountMailKey||notificationKey,previousKeys:[notificationKey]});
 const queueProjectEvent=(studioId,projectId,actorUserId,eventId)=>{if(!eventId)return;recordProjectEvent(db,{studioId,projectId,actorUserId,eventId});if(outbox)outbox.enqueueProjectActivity({studioId,projectId,actorUserId,eventId});};
 // Booking confirmations wait in the outbox like every other email, so nothing is sent until email delivery is switched on.
 const queueBookingEmail=(studio,consultationId,change)=>{if(!outbox||!consultationId)return;try{const row=db.prepare('SELECT data FROM consultations WHERE id=?').get(consultationId),sequence=(JSON.parse(row.data).history||[]).length;const manageUrl=`${origin}/book/${studio.slug}/manage#${issueManageToken(db,consultationId)}`;outbox.enqueueConsultation({studioId:studio.id,consultationId,change,sequence,...bookingEmail(db,{studio,consultationId,change,manageUrl})});}catch(error){console.error('Booking email could not be queued:',error.message);}};
 // Messages reach the bell at once; their email waits in the outbox and is dropped if the message is read first.
 const queueMessage=(studioId,c,actorUserId,messageId)=>{if(!messageId)return;recordMessage(db,{studioId,conversationId:c.id,messageId,actorUserId});if(outbox)try{outbox.enqueueMessage({studioId,conversationId:c.id,messageId,actorUserId});}catch(error){console.error('Message email could not be queued:',error.message);}};
 // With TRUST_PROXY=N, N reverse proxies each append the peer they saw to X-Forwarded-For; the client is the right-most entry they did not add.
 const secureOrigin=origin.startsWith('https://');
 // Production pages only: Vite dev serves inline scripts. 'unsafe-inline' styles cover React style props and the print preview frame.
 const appCSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
 const trustedHops=Math.max(0,Math.floor(Number(trustProxy))||0);
 const clientIP=req=>{const peer=req.socket?.remoteAddress||'';if(!trustedHops)return peer;const hops=String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);return hops[Math.max(0,hops.length-trustedHops)]||peer;};
 function rate(req,bucket,max=30,subject=clientIP(req)){const key=bucket+':'+subject;const time=Date.now();for(const [k,v] of limits)if(v.until<time)limits.delete(k);const v=limits.get(key)||{n:0,until:time+600000};if(++v.n>max)fail(429,'Please wait a few minutes before trying again.');limits.set(key,v);}
 let freshDemo=false;
 if(demo&&!db.prepare('SELECT id FROM studios WHERE slug=?').get('nay-decor')){
  freshDemo=true;
  const studioId=id();db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(studioId,'nay-decor','NAY DÉCOR','#181925',JSON.stringify(['http://127.0.0.1:4318','http://127.0.0.1:4317',origin]));
  const owner={id:id(),name:'NAY Studio',email:'studio@example.test'},client={id:id(),name:'Amelia Taylor',email:'amelia@example.test'};
  for(const [u,role] of [[owner,'owner'],[client,'client']]){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(u.id,u.email,u.name,passwordHash('StudioDemo2026!'));db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(u.id,studioId,role);}
  for(const [index,person] of ['Amelia Taylor','Noah Williams','Olivia Chen'].entries()){
   const b={name:person,email:index===0?client.email:`demo${index}@example.test`,occasion:['Wedding','Brand launch','Private dinner'][index],date:['2027-06-12','2027-02-20','2027-04-10'][index],venue:['A London townhouse','A gallery in Shoreditch','Private residence, Richmond'][index],vision:['An intimate celebration with sculptural ivory flowers, candlelight and a touch of sage. Elegant, personal and warm.','A quiet, architectural world for a new collection. Soft forms, strong silhouettes and space to explore.','A beautiful dinner for family and friends. Layers of flowers, linen and candlelight.'][index],colours:['Ivory','Sage'],customColours:'Champagne accents',pinterest:'',budget:''};
   const p=makeProject(studioId,b,index===0?client:{name:person});p.demo=true;p.status=['Design','Enquiry','Planning'][index];
   if(index===0){p.inspiration.push({id:id(),title:'The atmosphere',url:'',sample:'/assets/sage-blush-florals.webp',note:'Soft roses with ivory and sage, layered and generous.',by:'NAY Studio',at:now()});p.designs.push({id:id(),version:1,briefRevision:p.briefRevision,briefSnapshot:structuredClone(p.brief),title:'Ivory, softly',description:'An intimate table beneath sculptural florals. Ivory and sage, warm candlelight, soft champagne fabrics. This is a sample concept for the demo project.',sample:'/assets/blush-celebration.webp',fileId:'',status:'Awaiting approval',at:now(),feedback:''});p.messages.push({id:id(),by:'NAY Studio',role:'owner',text:'Welcome, Amelia. Your first concept is ready to explore in Designs. You can leave feedback or approve it when you are happy.',at:now()});event(p,owner,'Shared design version 1');}
   if(index===0){p.decisions.push({id:id(),title:'Choose the table direction',description:'Which setting feels closer to the celebration you have in mind? We will refine the chosen direction together.',options:[{id:id(),label:'Sculptural ivory',detail:'Architectural florals, candlelight and a restrained palette.',url:''},{id:id(),label:'Soft garden',detail:'Low arrangements, layered greenery and a more relaxed table.',url:''}],status:'Awaiting choice',briefRevision:1,createdAt:now(),by:'NAY Studio'});p.tasks.push({id:id(),title:'Share any important table details',due:'2026-10-12',assignee:'client',completed:false,createdBy:'NAY Studio',at:now()});p.tasks.push({id:id(),title:'Refine the table layout',due:'2026-11-02',assignee:'studio',completed:false,createdBy:'NAY Studio',at:now()});}
   insertProject(db,p);
  }
  bindInvitedContact(db,studioId,client.email,client.id);
 }
 const vite=dev?await (await import('vite')).createServer({configFile:path.join(root,'vite.config.js'),server:{middlewareMode:true},appType:'spa'}):null;
 const server=http.createServer(async(req,res)=>{
  let url,route,body={};
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   try{url=new URL(req.url,origin);route=url.pathname;}catch{fail(400,'Use a valid request address.');}
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');if(secureOrigin)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
   if(route==='/api/webhooks/stripe'&&req.method==='POST'){
    if(!stripe||!stripeWebhookSecret)fail(503,'Stripe webhook is not configured.');
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576)fail(413,'Stripe webhook is too large.');chunks.push(chunk);}
    const stripeEvent=verifyStripeEvent(stripe,{rawBody:Buffer.concat(chunks),signature:req.headers['stripe-signature'],webhookSecret:stripeWebhookSecret});
    if(isBookingEvent(stripeEvent)){const result=applyBookingEvent(db,stripeEvent);if(result.result==='booked'&&!result.duplicate&&result.bookingId){const bookingStudio=db.prepare('SELECT s.* FROM studios s JOIN consultations c ON c.studio_id=s.id WHERE c.id=?').get(result.bookingId);if(bookingStudio)queueBookingEmail(bookingStudio,result.bookingId,'booked');}return reply(200,{ok:true,...result});}
    if(isAutopayEvent(stripeEvent))return reply(200,{ok:true,...await applyAutopayEvent(db,stripe,stripeEvent,autopayHooks)});
    const result=transaction(db,()=>{
     const outcome=applyInvoiceCheckoutEvent(db,stripeEvent);
     if(outcome.result==='paid'&&!outcome.duplicate){
      const invoice=db.prepare('SELECT * FROM invoices WHERE id=?').get(outcome.invoiceId);
      const project=invoice&&db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(invoice.project_id,invoice.studio_id);
      if(project){const p=JSON.parse(project.data);event(p,{name:'Stripe'},`Payment confirmed for invoice ${invoice.number}`);saveProject(db,p);}
     }
     return outcome;
    });
    if(result.result==='paid'&&!result.duplicate){const paid=db.prepare('SELECT studio_id,project_id FROM invoices WHERE id=?').get(result.invoiceId);if(paid)automate(paid.studio_id,paid.project_id);}
    return reply(200,{ok:true,...result});
   }
   if(previewEnabled&&!(route==='/api/health'&&req.method==='GET')&&!previewAuthorized(req.headers.authorization,previewUserDigest,previewPassDigest)){
    res.writeHead(401,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','WWW-Authenticate':'Basic realm="Caleane preview", charset="UTF-8"'});
    return res.end('Preview access required.');
   }
   const publicMatch=route.match(/^\/api\/public\/([a-z0-9-]+)(?:\/(enquiries)|\/forms\/([a-z0-9-]+)(?:\/(enquiries))?)?$/);
   let publicStudio;
   if(publicMatch){publicStudio=db.prepare('SELECT * FROM studios WHERE slug=?').get(publicMatch[1]);if(!publicStudio)fail(404,'Studio not found.');const allowed=[origin,...JSON.parse(publicStudio.origins)];if(req.headers.origin&&!allowed.includes(req.headers.origin))fail(403,'This website is not connected to the studio.');if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}}
   // Resolve the session before reading a body, so only signed-in people can send upload-sized requests.
   const cookie=req.headers.cookie?.match(/(?:^|;\s*)studio_session=([a-f0-9]+)/)?.[1];
   const user=cookie?db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hash(cookie),Date.now()):null;
   if(route.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)){
    if(!publicMatch&&req.headers.origin!==origin)fail(403,'Please use this workspace to make changes.');
    if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))fail(415,'Use JSON for this request.');
    // Public form and booking submissions are text only and fit the 64 KB limit; uploads require a session.
    const isUpload=/^\/api\/(?:projects\/[a-f0-9-]+\/(?:files|drafts\/files)|staff\/projects\/[a-f0-9-]+\/(?:drafts\/files|references))$/.test(route),large=isUpload||/^\/api\/(?:conversations\/[^/]+\/files|task-workspace\/(?:project|crm)\/[^/]+|expenses)$/.test(route);const limit=large?8500000:route==='/api/brand-kit'?6000000:65536,chunks=[],tooLarge=isUpload?'This file is too large. Choose a file below 6 MB.':'This request is too large. Shorten your answers and try again.';
    // Refusals before the body is read close the connection, so the unread body is discarded rather than parsed as the next request.
    if((large&&!user)||Number(req.headers['content-length']||0)>limit){res.setHeader('Connection','close');fail(large&&!user?401:413,large&&!user?'Please sign in.':tooLarge);}
    await new Promise((resolve,reject)=>{let bytes=0;req.on('data',chunk=>{if(bytes<0)return;bytes+=chunk.length;if(bytes>limit){bytes=-1;res.setHeader('Connection','close');reject(Object.assign(new Error(tooLarge),{status:413}));}else chunks.push(chunk);});req.on('end',resolve);req.on('error',reject);});
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
   // Xero sends people back here; the settings screen finishes the connection with the signed-in session.
   if(route==='/xero/callback'&&req.method==='GET'){const back=new URLSearchParams({view:'settings',settingsTab:'integrations',xero_callback:'1'});for(const key of ['code','state','error'])if(url.searchParams.get(key))back.set(key,url.searchParams.get(key).slice(0,4000));res.writeHead(302,{Location:'/?'+back,'Cache-Control':'no-store'});return res.end();}
   const brandAssetMatch=route.match(/^\/api\/brand-assets\/([a-f0-9-]{36})$/);
   if(brandAssetMatch&&req.method==='GET')return serveBrandAsset(db,res,brandAssetMatch[1]);
   const bookingMatch=route.match(/^\/api\/booking\/([a-z0-9-]+)(?:\/(status|release|manage))?$/);
   if(bookingMatch){
    const bookingStudio=db.prepare('SELECT * FROM studios WHERE slug=?').get(bookingMatch[1]);if(!bookingStudio)fail(404,'Studio not found.');
    // Busy times from the owner's connected calendar, when they have chosen one; never in the hosted sample.
    const busyFor=maxAgeMs=>{if(!calendarIntervalMs)return [];const settings=bookingSettings(db,bookingStudio.id);return settings.enabled?safeCalendarBusy(db,bookingStudio.id,{from:Date.now(),to:Date.now()+(settings.horizonDays+2)*86400000,maxAgeMs}):[];};
    // One run at a time per booking, so a client refreshing the confirmation page never makes two meetings.
    const linkBooking=consultationId=>{if(!calendarIntervalMs||!consultationId)return null;if(!bookingLinks.has(consultationId))bookingLinks.set(consultationId,completeBookingIntegrations(db,consultationId).catch(error=>{console.error('Booking integrations failed:',error?.message||error);return null;}).finally(()=>bookingLinks.delete(consultationId)));return bookingLinks.get(consultationId);};
    if(bookingMatch[2]==='status'&&req.method==='GET'){
     // A paid booking only becomes Booked once Stripe confirms it, so make its video link and calendar event here.
     const status=publicBookingStatus(db,bookingStudio,url.searchParams.get('booking'));
     if(status.status==='Booked'){const meetingUrl=await linkBooking(status.bookingId);if(meetingUrl)status.location={...status.location,detail:meetingUrl};}
     return reply(200,status);
    }
    if(bookingMatch[2]==='release'&&req.method==='POST'){rate(req,'booking',20);if(stripe)await releaseBooking(db,stripe,{studio:bookingStudio,bookingId:body.bookingId});return reply(200,publicBookingStatus(db,bookingStudio,body.bookingId));}
    // The client's private link: view, move or cancel. The token travels in the body, never the URL.
    if(bookingMatch[2]==='manage'&&req.method==='POST'){rate(req,'booking',30);const {changed,...result}=manageBooking(db,{studio:bookingStudio,body,busy:body.action==='view'?await busyFor():await busyFor(30000)});if(changed)queueBookingEmail(bookingStudio,result.bookingId,changed);return reply(200,result);}
    if(bookingMatch[2])fail(405,'Method not allowed.');
    if(req.method==='GET'){try{return reply(200,publicBooking(db,bookingStudio,{busy:await busyFor(),takePayment:takesBookingPayment(bookingStudio)}));}catch(error){if(error.status!==404)throw error;return reply(404,{error:error.message,studio:{name:bookingStudio.name,slug:bookingStudio.slug,accent:bookingStudio.accent}});}}
    if(req.method==='POST'){
     rate(req,'booking',20);const result=bookConsultation(db,{studio:bookingStudio,body,key:req.headers['idempotency-key'],busy:await busyFor(30000),takePayment:takesBookingPayment(bookingStudio)});
     // Make the video link and calendar event now, so the client sees the link on the confirmation screen.
     if(result.status===201&&result.data.status==='Booked')queueBookingEmail(bookingStudio,result.data.bookingId,'booked');
     if(result.status===201&&calendarIntervalMs){const consultationId=db.prepare('SELECT consultation_id FROM consultation_receipts WHERE studio_id=? AND key=?').get(bookingStudio.id,req.headers['idempotency-key'])?.consultation_id;const meetingUrl=await linkBooking(consultationId);if(meetingUrl)result.data.location={...result.data.location,detail:meetingUrl};}
     
     // A held booking (new, or a retried request) goes on to Stripe Checkout.
     if(result.data.status==='Awaiting payment'){
      if(!stripe)fail(503,'Card payment is not available right now.');
      result.data.checkoutUrl=(await startBookingCheckout(db,stripe,{studio:bookingStudio,bookingId:result.data.bookingId,appOrigin:origin})).url;
     }
     return reply(result.status,result.data);
    }
    fail(405,'Method not allowed.');
   }
   function startSession(user){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`studio_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${origin.startsWith('https:')?'; Secure':''}`);}
   if(route==='/api/account/recovery'&&req.method==='POST'){rate(req,'recovery',8);const mail=email(body.email);accountSecurity.enqueue(db.prepare('SELECT * FROM users WHERE email=?').get(mail),'reset');return reply(200,{ok:true,message:'If an account uses that email, a recovery link will be sent.'});}
   if(route==='/api/account/reset'&&req.method==='POST'){rate(req,'reset',12);accountSecurity.consume(body.token,'reset',body.password);res.setHeader('Set-Cookie','studio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(200,{ok:true});}
   if(route==='/api/account/verify'&&req.method==='POST'){rate(req,'verify',12);accountSecurity.consume(body.token,'verify');return reply(200,{ok:true});}
   if(route==='/api/account/security'&&req.method==='GET'){if(!user)fail(401,'Please sign in.');return reply(200,accountSecurity.status(user));}
   if(route==='/api/account/password'&&req.method==='POST'){if(!user)fail(401,'Please sign in.');rate(req,'password-change',8);const stored=db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password;if(typeof body.current!=='string'||!stored||!passwordOK(body.current,stored))fail(400,'Your current password is not correct.');const next=password(body.password);if(next===body.current)fail(400,'Choose a password you have not used here.');transaction(db,()=>{db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(next),user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,hash(cookie));});return reply(200,{ok:true,message:'Password updated. Your other devices have been signed out.'});}
   if(route==='/api/account/sessions'&&req.method==='POST'&&body.action==='sign-out-others'){if(!user)fail(401,'Please sign in.');const result=db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,hash(cookie));return reply(200,{ok:true,signedOut:result.changes,message:result.changes?`Signed out ${result.changes} other ${result.changes===1?'session':'sessions'}.`:'No other sessions were signed in.'});}
   if(route==='/api/account/email'&&req.method==='POST'){if(!user)fail(401,'Please sign in.');rate(req,'email-change',8);const stored=db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password;if(typeof body.current!=='string'||!stored||!passwordOK(body.current,stored))fail(400,'Your current password is not correct.');const next=email(body.email);if(next===user.email)fail(400,'That is already your sign-in email.');accountSecurity.enqueueEmailChange(user,next);return reply(200,{ok:true,message:`Check ${next} for a link to confirm the change. Your sign-in email stays the same until then.`});}
   if(route==='/api/account/confirm-email'&&req.method==='POST'){rate(req,'verify',12);accountSecurity.consume(body.token,'email');return reply(200,{ok:true,message:'Your sign-in email is updated. Use it next time you sign in.'});}
   if(route==='/api/account/profile'&&req.method==='PATCH'){if(!user)fail(401,'Please sign in.');const name=str(body.name,120);if(!name)fail(400,'Add your name.');db.prepare('UPDATE users SET name=? WHERE id=?').run(name,user.id);return reply(200,{ok:true,message:'Your name has been updated.'});}
   if(route==='/api/account/verification'&&req.method==='POST'){if(!user)fail(401,'Please sign in.');rate(req,'verification',8);if(!accountSecurity.status(user).verified)accountSecurity.enqueue(user,'verify');return reply(200,{ok:true,message:'Check your email for a verification link.'});}
   if(route==='/api/login'&&req.method==='POST'){rate(req,'auth',15);const mail=email(body.email);rate(req,'auth-email',10,mail);const u=db.prepare('SELECT * FROM users WHERE email=?').get(mail),ok=passwordOK(password(body.password),u?.password);if(!u||!ok)fail(401,'Email or password is incorrect.');startSession(u);return reply(200,{ok:true});}
   if(route==='/api/signup'&&req.method==='POST'){
    rate(req,'signup',5);const mail=email(body.email),name=str(body.name,120),studioName=str(body.studio,120),slug=str(body.slug,80),pass=password(body.password),profession=body.profession??DEFAULT_WORKFLOW;if(!name||!studioName||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Add your name, studio name and a lowercase studio address.');if(!isWorkflowId(profession))fail(400,'Choose a valid studio practice.');if(db.prepare('SELECT id FROM users WHERE email=?').get(mail)||db.prepare('SELECT id FROM studios WHERE slug=?').get(slug))fail(409,'That email or studio address is already in use.');const u={id:id(),name,email:mail},sid=id();db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(u.id,mail,name,passwordHash(pass));db.prepare('INSERT INTO studios VALUES(?,?,?,?,?)').run(sid,slug,studioName,'#181925',JSON.stringify([origin]));db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(u.id,sid,'owner');db.prepare('INSERT INTO studio_branding VALUES(?,?)').run(sid,JSON.stringify({portalTitle:studioName,welcome:'Your project, thoughtfully brought together.',logoUrl:'',profession,projectTypes:projectTypesFor(profession)}));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}startSession(u);return reply(201,{ok:true});
   }
   if(route==='/api/invite/claim'&&req.method==='POST'){
    rate(req,'invite',15);const token=str(body.token,100);const u=transaction(db,()=>{const invite=db.prepare('SELECT * FROM invitations WHERE token=? AND used=0 AND expires>?').get(hash(token),Date.now());if(!invite)fail(400,'This invitation has expired or has already been used. Ask the studio for a new link.');let account=db.prepare('SELECT * FROM users WHERE email=?').get(invite.email);if(account&&user?.id!==account.id)fail(409,'This email already has an account. Sign in first, then open the invitation again.');if(!account){const name=str(body.name,120);if(!name)fail(400,'Enter your name.');account={id:id(),email:invite.email,name};db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(account.id,account.email,account.name,passwordHash(password(body.password)));}bindInvitedContact(db,invite.studio_id,invite.email,account.id);db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,'client')").run(account.id,invite.studio_id);db.prepare('UPDATE invitations SET used=1 WHERE token=?').run(hash(token));return account;});startSession(u);return reply(200,{ok:true});
   }
   // The join page reads what an invitation grants before anyone accepts it, so it can describe the access truthfully.
   if(route==='/api/staff-invitations/inspect'&&req.method==='POST'){rate(req,'staff-invite-view',30);const invite=db.prepare('SELECT studio_id,access FROM staff_invitations WHERE token=? AND used=0 AND expires>?').get(hash(str(body.token,100)),Date.now());if(!invite)fail(400,'This studio invitation has expired or has already been used.');return reply(200,{access:invite.access,studio:db.prepare('SELECT name FROM studios WHERE id=?').get(invite.studio_id)?.name||''});}
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
    // Each lookup reads one project. The project list swaps in studioLookups, which reads each for the whole studio at once.
    const invoiceOrder=`CASE WHEN i.cancelled_at IS NULL AND i.amount_minor>COALESCE((SELECT SUM(ip.amount_minor) FROM invoice_payments ip WHERE ip.studio_id=i.studio_id AND ip.invoice_id=i.id),0) THEN 0 ELSE 1 END,
     i.issued_at DESC,i.number DESC`;
    const projectLookups={
     conversation:p=>db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id),
     clientId:p=>projectClientId(db,p.studioId,p.id),
     latestInvoice:p=>db.prepare(`SELECT i.* FROM invoices i WHERE i.studio_id=? AND i.project_id=? ORDER BY ${invoiceOrder} LIMIT 1`).get(p.studioId,p.id),
     enquiryReviewedAt:p=>db.prepare('SELECT r.reviewed_at FROM crm_enquiry_reviews r JOIN crm_opportunities o ON o.id=r.opportunity_id AND o.studio_id=r.studio_id WHERE o.project_id=? AND o.studio_id=?').get(p.id,p.studioId)?.reviewed_at,
     documentOpens:p=>documentOpens(db,p.studioId,p.id),
     messages:c=>projectMessages(db,c),
     unread:c=>conversationUnreadCount(db,c,user),
     clientAccess:p=>clientShareState(db,p.studioId,p.id),
     teamDrafts:p=>db.prepare("SELECT COUNT(*) AS n FROM design_drafts d WHERE d.studio_id=? AND d.project_id=? AND d.status='private' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=d.created_by AND m.studio_id=d.studio_id AND m.role='owner')").get(p.studioId,p.id).n,
    };
    const studioLookups=studioId=>{
     const byProject=(rows,value=row=>row)=>{const map=new Map();for(const row of rows)if(!map.has(row.project_id))map.set(row.project_id,value(row));return map;};
     const conversations=byProject(db.prepare('SELECT * FROM conversations WHERE studio_id=? AND project_id IS NOT NULL').all(studioId));
     const clients=byProject(db.prepare('SELECT project_id,client_id FROM crm_project_relationships WHERE studio_id=?').all(studioId),row=>row.client_id);
     const invoices=byProject(db.prepare(`SELECT * FROM (SELECT i.*,ROW_NUMBER() OVER (PARTITION BY i.project_id ORDER BY ${invoiceOrder}) AS list_rank FROM invoices i WHERE i.studio_id=? AND i.project_id IS NOT NULL) WHERE list_rank=1`).all(studioId),({list_rank,...row})=>row);
     const reviews=byProject(db.prepare('SELECT o.project_id,r.reviewed_at FROM crm_enquiry_reviews r JOIN crm_opportunities o ON o.id=r.opportunity_id AND o.studio_id=r.studio_id WHERE o.studio_id=?').all(studioId),row=>row.reviewed_at);
     const opens=documentOpensByProject(db,studioId),latest=latestProjectMessages(db,studioId),unread=studioUnreadCounts(db,studioId,user);
     const shares=clientShareStates(db,studioId),drafts=byProject(db.prepare("SELECT d.project_id,COUNT(*) AS n FROM design_drafts d WHERE d.studio_id=? AND d.status='private' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=d.created_by AND m.studio_id=d.studio_id AND m.role='owner') GROUP BY d.project_id").all(studioId),row=>row.n);
     return {conversation:p=>conversations.get(p.id),clientId:p=>clients.get(p.id)||null,latestInvoice:p=>invoices.get(p.id),enquiryReviewedAt:p=>reviews.get(p.id),documentOpens:p=>opens.get(p.id)||{},messages:c=>c&&latest.get(c.id)||[],unread:c=>unread.get(c.id)||0,clientAccess:p=>shares.get(p.id)||{shared:false,joined:false},teamDrafts:p=>drafts.get(p.id)||0};
    };
    const decorate=(p,lookups=projectLookups)=>{if(bookkeeper)return {id:p.id,studioId:p.studioId,title:p.title,status:p.status,accessRole:'Bookkeeper',brief:{name:p.brief.name,occasion:p.brief.occasion,date:p.brief.date,workflowType:p.brief.workflowType},clientId:lookups.clientId(p),createdAt:p.createdAt,updatedAt:p.updatedAt};if(staffViewer)return {id:p.id,studioId:p.studioId,title:p.title,status:p.status,accessRole:'Studio viewer',canContribute:!!db.prepare('SELECT 1 FROM studio_project_collaborators WHERE studio_id=? AND project_id=? AND user_id=?').get(p.studioId,p.id,user.id),briefRevision:p.briefRevision,brief:{name:p.brief.name,occasion:p.brief.occasion,date:p.brief.date,venue:p.brief.venue,vision:p.brief.vision,workflowType:p.brief.workflowType},designs:p.designs.map(d=>({id:d.id,version:d.version,title:d.title,status:d.status,at:d.at})),tasks:(p.tasks||[]).map(t=>({id:t.id,title:t.title,due:t.due,assignee:t.assignee,completed:t.completed})),createdAt:p.createdAt,updatedAt:p.updatedAt};const c=lookups.conversation(p),accessRole=owner?'Owner':projectAccess(db,p.studioId,p.id,user.id),latest=accessRole==='Owner'||accessRole==='Approver'?lookups.latestInvoice(p):null;const invoice=latest?invoiceDTO(db,latest):null;const moneyHidden=accessRole!=='Owner'&&accessRole!=='Approver';return {...p,...(owner?{}:{tags:undefined,customFields:undefined}),...(moneyHidden?{estimates:[],proposals:[],moneyHidden:true,activity:(p.activity||[]).filter(entry=>!MONEY_ACTIVITY.test(entry.text||entry.title||''))}:{}),viewerId:user.id,enquiryReviewedAt:owner?lookups.enquiryReviewedAt(p):undefined,operations:owner?p.operations:undefined,documentOpens:owner?lookups.documentOpens(p):undefined,waitingToJoin:owner?joinStatus(db,p.studioId,{projectId:p.id}).waiting:undefined,clientAccess:owner&&lookups.clientAccess?lookups.clientAccess(p):undefined,teamDrafts:owner&&lookups.teamDrafts?lookups.teamDrafts(p):undefined,estimateDraft:owner?p.estimateDraft:undefined,clientId:lookups.clientId(p),accessRole,conversationId:c?.id,messages:lookups.messages(c),unreadMessages:c?lookups.unread(c):0,latestInvoice:invoice?{id:invoice.id,number:invoice.number,kind:invoice.kind,currency:invoice.currency,amountMinor:invoice.amountMinor,paidMinor:invoice.paidMinor,dueDate:invoice.dueDate,status:invoice.status}:null};};
    const memberships=[...db.prepare('SELECT s.*,m.role FROM studios s JOIN memberships m ON m.studio_id=s.id WHERE m.user_id=?').all(user.id),...db.prepare("SELECT s.*,CASE st.access WHEN 'bookkeeper' THEN 'staff_bookkeeper' ELSE 'staff_viewer' END AS role FROM studios s JOIN studio_staff st ON st.studio_id=s.id WHERE st.user_id=? AND st.access IN ('viewer','bookkeeper')").all(user.id)];
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
    const studio=memberships.find(s=>s.id===url.searchParams.get('studio'));if(!studio)fail(403,'You do not have access to this studio.');const owner=studio.role==='owner',staffViewer=studio.role==='staff_viewer',bookkeeper=studio.role==='staff_bookkeeper';
    // Bookkeepers read the money and nothing else: no project content, messages, files, settings or changes of any kind.
    if(bookkeeper&&!(req.method==='GET'&&(['/api/invoices','/api/projects',`/api/studios/${studio.id}/stripe-status`,'/api/expenses','/api/finance-report'].includes(route)||/^\/api\/projects\/[a-f0-9-]+\/invoices(?:\/(?:plan|[a-f0-9-]+(?:\/pdf|\/credit-notes\/[a-f0-9-]{36}\/pdf)?))?$/.test(route)||/^\/api\/expenses\/[a-f0-9-]{36}\/receipt$/.test(route))))fail(403,'Bookkeeper access is read-only and limited to finances.');const requireOwner=()=>{if(!owner)fail(403,'Only the studio can make this change.');};
    if(req.method==='POST'&&((route.startsWith('/api/conversations/')&&route.endsWith('/files'))||(route.startsWith('/api/task-workspace/')&&body.action==='file')||(route==='/api/expenses'&&body.receipt)))rate(req,'upload',40);
    const formRoute=route.match(/^\/api\/forms(?:\/([a-f0-9-]+)(?:\/(responses|export))?)?$/);
    if(formRoute){requireOwner();const formId=formRoute[1],action=formRoute[2];
     if(req.method==='GET'&&action==='export'){res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename=caleane-form-responses.csv');return res.end(formResponseCSV(db,studio.id,formId));}
     if(req.method==='GET'&&action==='responses')return reply(200,listFormResponses(db,studio.id,formId,Number(url.searchParams.get('offset')||0)));
     if(req.method==='GET'&&!formId)return reply(200,{forms:listForms(db,studio)});
     if(req.method==='POST'&&!action)return reply(formId?200:201,{form:changeForm(db,studio,body,formId)});
     fail(405,'Method not allowed.');
    }
    if(route==='/api/data-governance'){const args={studioId:studio.id,userId:user.id};if(req.method==='GET')return reply(200,dataGovernance(db,args));if(req.method==='POST')return reply(200,changeGovernance(db,args,body));fail(405,'Method not allowed.');}
    if(route==='/api/studio-export'&&req.method==='GET')return await streamStudioExport(db,{studioId:studio.id,userId:user.id},res,{includeFiles:url.searchParams.get('files')==='1'});
    if(route==='/api/operations'&&req.method==='GET')return reply(200,await operationalReadiness(db,{studioId:studio.id,userId:user.id,backupReceiptPath:process.env.CALEANE_BACKUP_RECEIPT||'',emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM&&process.env.CALEANE_EMAIL_ENABLED==='1'),offsiteBackupsConfigured:false}));
    if(await handleCalendarSync({db,req,url,route,body,user,studio,owner,reply,origin}))return;
    if(route==='/api/notifications/preferences'){
     if(req.method==='POST'){if(typeof body.messageEmail!=='boolean')fail(400,'Choose whether to receive message emails.');setMessageEmail(db,user.id,studio.id,body.messageEmail);}
     else if(req.method!=='GET')fail(405,'Method not allowed.');
     return reply(200,{messageEmail:messageEmailEnabled(db,user.id,studio.id),emailActive:!!deliver});
    }
    if(handleNotificationFeed({db,req,url,route,body,user,studio,owner,reply}))return;
    if(handleDocumentOpens({db,req,route,body,user,studio,owner,staffViewer,reply}))return;
    if(handleOnboarding({db,req,route,body,user,studio,reply}))return;
    if(await handleTaskCollaboration({db,req,res,url,route,body,user,studio,owner,staffViewer,reply}))return;
    if(await handleAssistant({db,req,route,body,studio,owner,reply,assistant:helper,rate}))return;
    if(await handleConversationFileUpload({db,req,res,url,route,body,user,studio,owner,staffViewer,reply}))return;
    if(await handleConversationOrganiser({db,req,route,body,user,studio,owner,reply}))return;
    if(handleScheduledMessages({db,req,route,body,user,studio,owner,reply,afterSend:queueMessage}))return;
    if(await handleStudioCommerce({db,req,route,body,studio,owner,reply}))return;
    if(handleBrandKit({db,req,route,body,studio,owner,reply,origin}))return;
    if(await handleReminders({db,req,route,body,studio,owner,reply,outbox}))return;
    if(await handlePipeline({db,req,route,body,studio,owner,reply,outbox}))return;
    if(await handleConsultations({db,req,route,body,studio,owner,user,reply,origin,paymentsAvailable:cardPaymentsReady&&studioConnected(studio.id)}))return;
    if(await handleBookingIntegrations({db,req,route,body,studio,owner,reply}))return;
    if(await handleXero({db,req,route,body,studio,user,owner,reply,origin,delivery:calendarIntervalMs>0}))return;
    if(await handleWebhooks({db,req,route,body,studio,owner,user,reply,delivery:webhookIntervalMs>0}))return;
    if(await handleFinances({db,req,res,url,route,body,studio,owner,bookkeeper,user,reply,listInvoices:()=>invoiceRows(db,studio.id).map(row=>invoiceDTO(db,row))}))return;
    if(route==='/api/card-payments'){
     requireOwner();const available=cardPaymentsReady&&studioConnected(studio.id);
     if(req.method==='GET')return reply(200,{settings:cardPaymentSettings(db,studio.id),available});
     if(req.method==='POST')return reply(200,{settings:saveCardPaymentSettings(db,studio.id,body,{available}),available});
     fail(405,'Method not allowed.');
    }
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
    if(handleCustomFields({db,req,route,body,studio,owner,reply,clientDTO,decorate}))return;
    if(route==='/api/search'&&req.method==='GET'){requireOwner();const query=str(url.searchParams.get('q')||'',80);return reply(200,searchWorkspace(db,studio.id,query,url.searchParams.get('scope')||'all'));}
    if(route==='/api/staff'){
     requireOwner();
     if(req.method==='GET'){
      const members=db.prepare(`SELECT st.user_id AS id,u.name,u.email,st.access,st.joined_at AS joinedAt FROM studio_staff st JOIN users u ON u.id=st.user_id WHERE st.studio_id=? ORDER BY st.joined_at`).all(studio.id).map(member=>({...member,projectIds:db.prepare('SELECT project_id AS projectId FROM studio_project_collaborators WHERE studio_id=? AND user_id=?').all(studio.id,member.id).map(row=>row.projectId)}));
      const pending=db.prepare(`SELECT token AS id,email,access,expires,created_at AS createdAt FROM staff_invitations WHERE studio_id=? AND used=0 AND expires>? ORDER BY created_at DESC`).all(studio.id,Date.now());
      return reply(200,{owner:{id:user.id,name:user.name,email:user.email},members,pending});
     }
     if(req.method==='POST'){
      rate(req,'staff-invite-create',20);const mail=email(body.email),access=body.access===undefined?'viewer':body.access;if(!STAFF_ACCESS.includes(access))fail(400,'Choose a valid access level.');
      if(mail===user.email)fail(409,'You already own this studio.');
      const existing=db.prepare('SELECT id FROM users WHERE email=?').get(mail);
      if(existing&&(db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND studio_id=?').get(existing.id,studio.id)||db.prepare('SELECT 1 FROM studio_staff WHERE user_id=? AND studio_id=?').get(existing.id,studio.id)))fail(409,'This person already has access to this studio.');
      const token=randomBytes(32).toString('hex');transaction(db,()=>{
       db.prepare('UPDATE staff_invitations SET used=1 WHERE studio_id=? AND email=? AND used=0').run(studio.id,mail);
       db.prepare('INSERT INTO staff_invitations VALUES(?,?,?,?,?,0,?)').run(hash(token),studio.id,mail,access,Date.now()+7*86400000,now());
      });
      return reply(201,{url:`${origin}/join-studio#${token}`,email:mail,access,expiresDays:7,delivery:'copy_link'});
     }
     fail(405,'Method not allowed.');
    }
    const staffAssignmentMatch=route.match(/^\/api\/staff\/([a-f0-9-]+)\/projects\/([a-f0-9-]+)$/);
    if(staffAssignmentMatch){
     requireOwner();if(req.method!=='PATCH'||typeof body.enabled!=='boolean')fail(400,'Choose whether this member can contribute.');
     const member=db.prepare('SELECT access FROM studio_staff WHERE studio_id=? AND user_id=?').get(studio.id,staffAssignmentMatch[1]);
     const project=db.prepare('SELECT id FROM projects WHERE id=? AND studio_id=?').get(staffAssignmentMatch[2],studio.id);
     if(!member||!project)fail(404,'Studio member or project not found.');
     if(body.enabled&&member.access!=='viewer')fail(409,'Bookkeepers see finances only and cannot be given projects.');
     if(body.enabled)db.prepare('INSERT OR IGNORE INTO studio_project_collaborators VALUES(?,?,?,?,?)').run(staffAssignmentMatch[1],studio.id,project.id,now(),user.id);
     else db.prepare('DELETE FROM studio_project_collaborators WHERE user_id=? AND studio_id=? AND project_id=?').run(staffAssignmentMatch[1],studio.id,project.id);
     return reply(200,{ok:true,projectId:project.id,enabled:body.enabled});
    }
    const staffProjectMatch=route.match(/^\/api\/staff\/projects\/([a-f0-9-]+)(?:\/(brief|tasks|messages|references|files)(?:\/([a-f0-9-]+))?)?$/);
    if(staffProjectMatch){
     if(!staffViewer)fail(403,'This route is for assigned studio contributors.');
     const projectRow=db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(staffProjectMatch[1],studio.id);
     const assignment=projectRow&&db.prepare('SELECT 1 FROM studio_project_collaborators WHERE user_id=? AND studio_id=? AND project_id=?').get(user.id,studio.id,staffProjectMatch[1]);
     if(!assignment)fail(404,'Assigned project not found.');
     const project=JSON.parse(projectRow.data),action=staffProjectMatch[2];const staffView=p=>{const c=db.prepare('SELECT * FROM conversations WHERE project_id=?').get(p.id);return {...staffProjectDTO({...p,messages:projectMessages(db,c)}),unreadMessages:c?conversationUnreadCount(db,c,user):0};};
     if(action==='files'){if(req.method!=='GET'||!staffProjectMatch[3])fail(405,'Method not allowed.');const ref=project.inspiration.find(item=>item.fileId===staffProjectMatch[3]);if(!ref)fail(404,'File not found.');const file=db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(ref.fileId,project.id);if(!file)fail(404,'File not found.');res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(file.content));}
     if(!action&&req.method==='GET')return reply(200,{project:staffView(project)});
     if(req.method!=='POST')fail(405,'Method not allowed.');
     if(action==='brief'){
      if(project.briefLocked)fail(409,'An approved brief needs an owner-reviewed change request.');
      if(body.revision!==project.briefRevision)fail(409,'The brief changed. Refresh before saving.');
      if(!body.brief||typeof body.brief!=='object'||Array.isArray(body.brief))fail(400,'Check the brief.');
      const next=brief({...project.brief,...body.brief,email:project.clientEmail,budget:project.brief.budget,workflowType:project.brief.workflowType,intakeAnswers:updateIntakeAnswers(project.brief.intakeAnswers,body.brief.intakeAnswers)});
      project.briefHistory.unshift({revision:project.briefRevision,brief:project.brief,at:now(),by:user.name,author:project.briefAuthor,authoredAt:project.briefAuthoredAt});project.brief=next;project.briefRevision++;project.briefAuthor=user.name;project.briefAuthoredAt=now();event(project,user,'Updated the brief');
     }else if(action==='tasks'){
      project.tasks||=[];
      if(body.taskId){const task=project.tasks.find(item=>item.id===body.taskId);if(!task)fail(404,'Task not found.');if(task.assignee!=='studio'||typeof body.completed!=='boolean')fail(403,'Only studio tasks can be completed here.');task.completed=body.completed;task.completedBy=body.completed?user.name:'';task.completedAt=body.completed?now():'';event(project,user,(task.completed?'Completed':'Reopened')+' task: '+task.title);}
      else{const title=str(body.title,200),due=date(body.due,'due date');if(!title||!['studio','client'].includes(body.assignee))fail(400,'Add a title and assignee.');project.tasks.push({id:id(),title,due,assignee:body.assignee,completed:false,createdBy:user.name,at:now()});event(project,user,'Added a shared project task');}
     }else if(action==='references'){
      const title=str(body.title,200),note=str(body.note||'',3000),link=safeURL(body.url||'');
      if(body.content){rate(req,'upload',40);const data=Buffer.from(str(body.content,8400000),'base64'),name=str(body.name||title,180);if(!title||!name||data.length>6000000||data.length<12)fail(400,'Add a title and a file smaller than 6 MB.');const mime=sniffMime(data);if(!mime)fail(400,'Use a PNG, JPG, WebP or PDF file.');assertQuota(db,studio.id,data.length);const fid=id();db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fid,project.id,name,mime,data);project.inspiration.unshift({id:id(),title,note,url:link,category:'',source:'',comments:[],fileId:fid,mime,by:user.name,byUserId:user.id,at:now()});event(project,user,'Added a project reference');}
      else{if(!title||(!note&&!link))fail(400,'Add a title and a link or note.');
      project.inspiration.unshift({id:id(),title,note,url:link,category:'',source:'',comments:[],by:user.name,byUserId:user.id,at:now()});event(project,user,'Added a project reference');}
     }else if(action==='messages'){
      const text=str(body.text,5000);if(!text)fail(400,'Write a message first.');
      transaction(db,()=>{const messageId=appendConversationMessage(db,materializeProjectConversation(db,project),user,'owner',text,body.clientMessageId?str(body.clientMessageId,120):null);queueProjectEvent(studio.id,project.id,user.id,messageId);});
      return reply(200,{project:staffView(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=? AND studio_id=?').get(project.id,studio.id).data))});
     }else fail(404,'Not found.');
     transaction(db,()=>{saveProject(db,project);queueProjectEvent(studio.id,project.id,user.id,project.activity?.[0]?.id);});
     return reply(200,{project:staffView(project)});
    }
    const privateFileInUse=(project,projectId,fileId,exceptDraftId)=>fileHeldInBin(db,studio.id,fileId)||project.designs.some(d=>d.fileId===fileId||d.assets?.some(a=>a.fileId===fileId))||project.inspiration.some(r=>r.fileId===fileId)||db.prepare('SELECT asset_ids,id FROM design_drafts WHERE studio_id=? AND project_id=?').all(studio.id,projectId).some(d=>d.id!==exceptDraftId&&JSON.parse(d.asset_ids||'[]').includes(fileId));const removePrivateFile=(projectId,fileId)=>{db.prepare('DELETE FROM design_assets WHERE file_id=? AND studio_id=? AND project_id=?').run(fileId,studio.id,projectId);db.prepare('DELETE FROM files WHERE id=? AND project_id=?').run(fileId,projectId);};
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
      if(req.method==='PATCH'&&typeof body.removeFileId==='string'){const asset=db.prepare('SELECT 1 FROM design_assets WHERE file_id=? AND studio_id=? AND project_id=? AND uploaded_by=?').get(body.removeFileId,studio.id,projectId,user.id);if(!asset)fail(404,'File not found.');if(privateFileInUse(project,projectId,body.removeFileId,body.draftId))fail(409,'This file is used by another draft or a shared version.');transaction(db,()=>removePrivateFile(projectId,body.removeFileId));return reply(200,{removed:body.removeFileId});}
      if(req.method!=='POST')fail(405,'Method not allowed.');
      rate(req,'staff-design-upload',40);
      const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');
      if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');
      let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');
      assertQuota(db,studio.id,data.length);const fileId=id();transaction(db,()=>{db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fileId,projectId,name,mime,data);db.prepare('INSERT INTO design_assets VALUES(?,?,?,?,?)').run(fileId,studio.id,projectId,user.id,now());});
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
      transaction(db,()=>{db.prepare("INSERT INTO design_drafts(id,studio_id,project_id,title,description,asset_ids,brief_revision,revision,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(draftId,studio.id,projectId,title,description,JSON.stringify(ids),project.briefRevision,1,'private',user.id,createdAt,createdAt);recordTeamDraft(db,{studioId:studio.id,projectId,draftId,title,actor:user});});
      return reply(201,{draft:designDraftDTO(db,projectId,db.prepare('SELECT * FROM design_drafts WHERE id=?').get(draftId))});
     }
     if(req.method!=='PATCH')fail(405,'Only the owner can share a direction.');
     const row=db.prepare("SELECT * FROM design_drafts WHERE id=? AND studio_id=? AND project_id=? AND created_by=? AND status='private'").get(draftId,studio.id,projectId,user.id);
     if(!row)fail(404,'Private direction not found.');
     if(body.remove===true){const ids=JSON.parse(row.asset_ids||'[]');transaction(db,()=>{db.prepare("DELETE FROM design_drafts WHERE id=? AND studio_id=? AND status='private'").run(row.id,studio.id);binItem(db,{studioId:studio.id,projectId,kind:'draft',label:row.title,payload:{row},fileIds:ids,user});});return reply(200,{removed:row.id});}
     if(!Number.isInteger(body.revision)||body.revision!==row.revision)fail(409,'This draft changed. Refresh before continuing.');
     if(body.briefRevision!==project.briefRevision)fail(409,'The brief changed. Review it before updating this draft.');
     const title=str(body.title||'',200),description=str(body.description||'',5000),ids=selectedAssets();
     if(!title)fail(400,'Give this draft a title.');
     const updated=db.prepare("UPDATE design_drafts SET title=?,description=?,asset_ids=?,brief_revision=?,revision=revision+1,updated_at=? WHERE id=? AND studio_id=? AND project_id=? AND created_by=? AND status='private' AND revision=?").run(title,description,JSON.stringify(ids),project.briefRevision,now(),draftId,studio.id,projectId,user.id,row.revision);
     if(!updated.changes)fail(409,'This draft changed. Refresh before continuing.');
     return reply(200,{draft:designDraftDTO(db,projectId,db.prepare('SELECT * FROM design_drafts WHERE id=?').get(draftId))});
    }
    const staffMemberMatch=route.match(/^\/api\/staff\/([a-f0-9-]+)$/);
    if(staffMemberMatch){requireOwner();if(req.method==='PATCH'&&body.access!==undefined){if(!STAFF_ACCESS.includes(body.access))fail(400,'Choose a valid access level.');const changed=transaction(db,()=>{if(body.access!=='viewer')db.prepare('DELETE FROM studio_project_collaborators WHERE studio_id=? AND user_id=?').run(studio.id,staffMemberMatch[1]);return db.prepare('UPDATE studio_staff SET access=? WHERE studio_id=? AND user_id=?').run(body.access,studio.id,staffMemberMatch[1]);});if(!changed.changes)fail(404,'Studio member not found.');return reply(200,{ok:true,access:body.access});}if(req.method!=='PATCH'||body.remove!==true)fail(405,'Method not allowed.');const removed=transaction(db,()=>{db.prepare('DELETE FROM studio_project_collaborators WHERE studio_id=? AND user_id=?').run(studio.id,staffMemberMatch[1]);return db.prepare('DELETE FROM studio_staff WHERE studio_id=? AND user_id=?').run(studio.id,staffMemberMatch[1]);});if(!removed.changes)fail(404,'Studio member not found.');return reply(200,{ok:true});}
    const staffInviteMatch=route.match(/^\/api\/staff-invitations\/([a-f0-9]{64})$/);
    if(staffInviteMatch){requireOwner();if(req.method!=='PATCH'||body.revoke!==true)fail(405,'Method not allowed.');const revoked=db.prepare('UPDATE staff_invitations SET used=1 WHERE studio_id=? AND token=? AND used=0').run(studio.id,staffInviteMatch[1]);if(!revoked.changes)fail(404,'Invitation not found.');return reply(200,{ok:true});}
    if(route==='/api/opportunities'){
     requireOwner();
     if(req.method==='GET'){syncPipeline(db,studio.id,{outbox});return reply(200,{opportunities:listOpportunities(db,studio.id)});}
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
       insertProject(db,p);setProjectShared(db,studio.id,p.id,false);
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
    if(crmTaskMatch){requireOwner();if(req.method==='PATCH'&&body.remove===true)return reply(200,{deleted:transaction(db,()=>{const row=db.prepare('SELECT * FROM crm_tasks WHERE id=? AND studio_id=?').get(crmTaskMatch[1],studio.id);const deleted=deleteTask(db,studio.id,user,crmTaskMatch[1]);binItem(db,{studioId:studio.id,clientId:row.client_id,kind:'crm-task',label:row.title,payload:{row},user});return deleted;})});if(req.method==='PATCH')return reply(200,{task:updateTask(db,studio.id,user,crmTaskMatch[1],body)});fail(405,'Method not allowed.');}
    const crmClientActivitiesMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)\/activities$/);
    if(crmClientActivitiesMatch){
     requireOwner();const cid=crmClientActivitiesMatch[1];
     if(req.method==='GET')return reply(200,{activities:listActivities(db,studio.id,cid)});
     if(req.method==='POST')return reply(201,{activities:logActivity(db,studio.id,user,cid,body)});
     fail(405,'Method not allowed.');
    }
    if(route==='/api/conversations'){
     if(req.method==='GET'){
      // Hosts that pause between requests may miss the timer, so anything due goes out before the list is read.
      sendDueScheduled(db,{afterSend:queueMessage});
      const rows=db.prepare('SELECT c.* FROM conversations c WHERE c.studio_id=? ORDER BY c.updated_at DESC,c.id').all(studio.id).filter(c=>owner||conversationAccess(db,c,user.id));
      // A tag of the list lets open pages ask "anything new?" and skip downloading an unchanged list.
      const conversations=rows.map(c=>conversationDTO(db,c,user)),tag=createHash('sha256').update(JSON.stringify(conversations)).digest('base64url').slice(0,22);
      if(url.searchParams.get('since')===tag)return reply(200,{unchanged:true,tag});
      return reply(200,{conversations,tag});
     }
     if(req.method==='POST'){
      requireOwner();const clientId=str(body.clientId,100),projectId=body.projectId?str(body.projectId,100):null,subject=str(body.subject,200),text=str(body.text||'',5000);
      if(!subject)fail(400,'Add a conversation subject.');const client=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientId,studio.id);if(!client)fail(404,'Client not found.');
      const project=projectId?db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(projectId,studio.id):null;
      if(projectId&&(!project||projectClientId(db,studio.id,projectId)!==client.id))fail(404,'This project does not belong to this client.');
      let created=false;const conversation=transaction(db,()=>{
       let c=project?materializeProjectConversation(db,JSON.parse(project.data)):null;
       if(!c){created=true;const cid=id(),at=now();db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?)').run(cid,studio.id,client.id,null,subject,'Open',at,at);c=db.prepare('SELECT * FROM conversations WHERE id=?').get(cid);}
       if(text){const messageId=appendConversationMessage(db,c,user,studio.role,text);queueMessage(studio.id,c,user.id,messageId);}
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
     if(action==='messages'){if(accessRole==='Viewer')fail(403,'This participant has view-only access.');const text=str(body.text||'',5000),clientKey=body.clientMessageId?str(body.clientMessageId,120):null;transaction(db,()=>{const messageId=appendConversationMessage(db,c,user,staffViewer?'owner':studio.role,text,clientKey,body);queueMessage(studio.id,c,user.id,messageId);});}
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
     if(body.remove===true){if(db.prepare('SELECT 1 FROM crm_client_contacts WHERE studio_id=? AND contact_id=? AND primary_contact=1 UNION SELECT 1 FROM crm_project_stakeholders WHERE studio_id=? AND contact_id=? AND primary_contact=1').get(studio.id,contact.id,studio.id,contact.id))fail(409,'This is a primary contact. Make someone else the primary contact first.');transaction(db,()=>{db.exec('PRAGMA defer_foreign_keys=ON');db.prepare('DELETE FROM crm_client_contacts WHERE studio_id=? AND contact_id=?').run(studio.id,contact.id);db.prepare('DELETE FROM crm_project_stakeholders WHERE studio_id=? AND contact_id=?').run(studio.id,contact.id);db.prepare('DELETE FROM crm_contacts WHERE id=? AND studio_id=?').run(contact.id,studio.id);});return reply(200,{removed:contact.id});}
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
     if(!contactId&&req.method==='POST'){const cid=str(body.contactId,100),role=body.role;if(!['Approver','Collaborator','Viewer'].includes(role))fail(400,'Choose a project role.');const contact=db.prepare(`SELECT ct.id FROM crm_contacts ct JOIN crm_client_contacts cc ON cc.contact_id=ct.id AND cc.studio_id=ct.studio_id WHERE ct.id=? AND ct.studio_id=? AND cc.client_id=?`).get(cid,studio.id,clientId);if(!contact)fail(404,'Choose a contact on this relationship.');if(db.prepare('SELECT 1 FROM crm_project_stakeholders WHERE project_id=? AND contact_id=?').get(projectId,cid))fail(409,'This person is already on the project.');db.prepare('INSERT INTO crm_project_stakeholders VALUES(?,?,?,?,?,0)').run(projectId,studio.id,cid,role,clientShareState(db,studio.id,projectId).shared?1:0);return reply(201,{stakeholders:listStakeholders(db,studio.id,projectId)});}
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
    const clientMatch=route.match(/^\/api\/clients\/([a-f0-9-]+)(?:\/(notes|invite|erase))?$/);
    if(clientMatch){requireOwner();const row=db.prepare('SELECT * FROM clients WHERE id=? AND studio_id=?').get(clientMatch[1],studio.id);if(!row)fail(404,'Client not found.');const data=JSON.parse(row.data);let name=row.name;
     if(!clientMatch[2]&&req.method==='GET')return reply(200,{client:clientDTO(row)});
     if(clientMatch[2]==='invite'&&req.method==='POST'){const primary=db.prepare(`SELECT ct.email FROM crm_client_contacts cc JOIN crm_contacts ct ON ct.id=cc.contact_id AND ct.studio_id=cc.studio_id WHERE cc.studio_id=? AND cc.client_id=? AND cc.primary_contact=1`).get(studio.id,row.id);return reply(201,createInvitation(primary?.email||row.email));}
     if(clientMatch[2]==='erase'){const preview=clientErasurePreview(db,studio.id,row.id);if(req.method==='GET')return reply(200,{name:row.name,projects:preview.projects.map(p=>({id:p.id,title:p.title})),blocked:preview.blocked});if(req.method==='POST')return reply(200,eraseClient(db,{studioId:studio.id,clientId:row.id,confirmName:body.confirmName}));fail(405,'Method not allowed.');}
     if(clientMatch[2]==='notes'&&req.method==='PATCH'){const note=(data.notes||[]).find(n=>n.id===body.noteId);if(!note)fail(404,'Note not found.');if(body.remove===true)data.notes=data.notes.filter(n=>n.id!==note.id);else{const text=str(body.text,5000);if(!text)fail(400,'Write a note first.');note.text=text;note.editedAt=now();}}
     else if(!clientMatch[2]&&req.method==='PATCH'&&typeof body.archived==='boolean'){data.archived=body.archived;data.archivedAt=body.archived?now():'';}
     else if(clientMatch[2]==='notes'&&req.method==='POST'){const text=str(body.text,5000);if(!text)fail(400,'Write a note first.');data.notes.unshift({id:id(),text,by:user.name,at:now()});}
     else if(!clientMatch[2]&&req.method==='PATCH'){name=str(body.name,120);if(!name||!['Lead','Active','Past client','VIP'].includes(body.stage))fail(400,'Add a client name and relationship stage.');if(!Array.isArray(body.tags)||body.tags.length>20)fail(400,'Use up to 20 tags.');const followUp=date(body.followUp,'follow-up date');Object.assign(data,{company:str(body.company||'',200),phone:str(body.phone||'',60),source:str(body.source||'',200),stage:body.stage,tags:body.tags.map(t=>str(t,50)).filter(Boolean),followUp,followUpNote:str(body.followUpNote||'',500)});}
     else fail(405,'Method not allowed.');data.updatedAt=now();transaction(db,()=>{db.prepare('UPDATE clients SET name=?,data=? WHERE id=? AND studio_id=?').run(name,JSON.stringify(data),row.id,studio.id);const primary=db.prepare('SELECT contact_id FROM crm_client_contacts WHERE studio_id=? AND client_id=? AND primary_contact=1').get(studio.id,row.id);if(primary)db.prepare('UPDATE crm_contacts SET name=?,phone=?,updated_at=? WHERE id=? AND studio_id=?').run(name,data.phone||'',now(),primary.contact_id,studio.id);});return reply(200,{client:clientDTO(db.prepare('SELECT * FROM clients WHERE id=?').get(row.id))});
    }
    if(route==='/api/projects'&&req.method==='GET'){const all=(owner||staffViewer||bookkeeper?db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studio.id):db.prepare(`SELECT DISTINCT p.data FROM projects p JOIN crm_project_stakeholders ps ON ps.project_id=p.id AND ps.studio_id=p.studio_id JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE p.studio_id=? AND ps.portal_access=1 AND ct.user_id=?`).all(studio.id,user.id)).map(row=>JSON.parse(row.data));const lookups=owner||bookkeeper?studioLookups(studio.id):{...projectLookups,messages:c=>latestProjectMessage(db,c)};return reply(200,{projects:all.map(p=>decorate(p,lookups)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});}
    if(route==='/api/projects'&&req.method==='POST'){requireOwner();const p=makeProject(studio.id,brief({...body,workflowType:body.workflowType||branding(studio.id).profession||DEFAULT_WORKFLOW}),user,body.clientId?str(body.clientId,100):null);p.status='Planning';p.activity[0].text='Created the project';transaction(db,()=>{insertProject(db,p);setProjectShared(db,studio.id,p.id,false);});return reply(201,{project:decorate(p)});}
    if(route==='/api/invoices'){
     if(!bookkeeper)requireOwner();if(req.method!=='GET')fail(405,'Method not allowed.');return reply(200,{invoices:invoiceRows(db,studio.id).map(row=>invoiceDTO(db,row))});
    }
    if(route===`/api/studios/${studio.id}/stripe-status`&&req.method==='GET'){
     const connected=db.prepare('SELECT stripe_account_id FROM stripe_studio_accounts WHERE studio_id=?').get(studio.id);
     let chargesEnabled=false;
     if(stripeReady&&connected){try{const account=await stripe.accounts.retrieve(connected.stripe_account_id);chargesEnabled=account.id===connected.stripe_account_id&&account.charges_enabled===true;}catch{/* Provider availability is checked again before Checkout. */}}
     return reply(200,{stripe:{configured:stripeReady,connected:!!connected,chargesEnabled}});
    }
    const engagementMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/engagements(?:\/([a-z-]+))?$/);
    if(engagementMatch){const args={studioId:studio.id,projectId:engagementMatch[1],userId:user.id};if(req.method==='GET'&&!engagementMatch[2])return reply(200,getEngagements(db,args));if(req.method==='POST'&&engagementMatch[2]){const {eventId,...result}=changeEngagements(db,{...args,action:engagementMatch[2],body});queueProjectEvent(studio.id,args.projectId,user.id,eventId);await syncProjectArchives(db,args);automate(studio.id,args.projectId);return reply(200,result);}fail(405,'Method not allowed.');}
    const calendarMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/calendar\.ics$/);
    if(calendarMatch&&req.method==='GET'){const calendar=projectCalendar(db,{studioId:studio.id,projectId:calendarMatch[1],userId:user.id});res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="caleane-project.ics"','Cache-Control':'private, no-store'});return res.end(calendar);}
    // The Library gathers task files and letters from every project; references and design files arrive with the projects themselves.
    if(route==='/api/recently-deleted'&&req.method==='GET'){requireOwner();return reply(200,{items:listBin(db,studio.id)});}
    const restoreMatch=route.match(/^\/api\/recently-deleted\/([a-f0-9-]{36})\/restore$/);
    if(restoreMatch&&req.method==='POST'){requireOwner();return reply(200,{restored:restoreItem(db,studio.id,restoreMatch[1],user),items:listBin(db,studio.id)});}
    if(route==='/api/library'&&req.method==='GET'){requireOwner();
     const tasks=new Map(db.prepare('SELECT id,data FROM projects WHERE studio_id=?').all(studio.id).map(row=>[row.id,new Map((JSON.parse(row.data).tasks||[]).map(t=>[t.id,t.title]))]));
     const taskFiles=[];for(const row of db.prepare("SELECT task_key,data FROM task_collaboration WHERE studio_id=? AND task_key LIKE 'project:%'").all(studio.id)){const [,projectId,taskId]=row.task_key.split(':'),titles=tasks.get(projectId);if(!titles)continue;for(const f of JSON.parse(row.data).files||[])taskFiles.push({id:f.id,name:f.name,mime:f.mime,at:f.at||'',by:f.by||'',projectId,taskId,taskTitle:titles.get(taskId)||'A project task'});}
     const letters=db.prepare("SELECT id,project_id AS projectId,title,status,created_at AS createdAt,issued_at AS issuedAt FROM project_documents WHERE studio_id=? AND kind='Letter' ORDER BY created_at DESC").all(studio.id);
     return reply(200,{taskFiles,letters});}
    const documentMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/documents(?:\/([a-f0-9-]+)\/pdf)?$/);
    if(documentMatch){const args={studioId:studio.id,projectId:documentMatch[1],userId:user.id};if(documentMatch[2]&&req.method==='GET'){const file=downloadDocument(db,args,documentMatch[2]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(file.content));}if(!documentMatch[2]&&req.method==='GET')return reply(200,await listDocuments(db,args));if(!documentMatch[2]&&req.method==='POST')return reply(200,await changeDocument(db,args,body));fail(405,'Method not allowed.');}
    const operationsMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/operations(?:\/([a-z-]+))?$/);
    if(operationsMatch){
     const args={studioId:studio.id,projectId:operationsMatch[1],userId:user.id};
     if(req.method==='GET'&&!operationsMatch[2])return reply(200,{operations:getProjectOperations(db,args)});
     if(req.method==='POST'&&operationsMatch[2]){transaction(db,()=>{const changed=changeProjectOperations(db,{...args,action:operationsMatch[2],body});queueProjectEvent(studio.id,changed.project.id,user.id,changed.project.activity?.[0]?.id);return changed;});automate(studio.id,args.projectId);return reply(200,{project:decorate(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(args.projectId).data)),operations:getProjectOperations(db,args)});}
     fail(405,'Method not allowed.');
    }
    const invoiceMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/invoices(?:\/(plan|[a-f0-9-]+)(?:\/(payments|cancel|credit-notes(?:\/[a-f0-9-]{36}\/pdf)?|refunds|tip|late-fee|checkout(?:\/expire)?|attempts|pdf))?)?$/);
    if(invoiceMatch){
     const projectRow=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(invoiceMatch[1],studio.id);
     const accessRole=projectRow&&(owner?'Owner':bookkeeper?'Bookkeeper':projectAccess(db,studio.id,projectRow.id,user.id));
     if(!accessRole)fail(404,'Project not found.');
     if(!owner&&!bookkeeper&&accessRole!=='Approver')fail(403,'Only the project approver can see billing.');
     const project=JSON.parse(projectRow.data),invoiceId=invoiceMatch[2],subaction=invoiceMatch[3];
     const issueInvoice=(project,body,afterInsert)=>{
      const estimate=project.estimates?.find(item=>item.id===body.estimateId);
      if(!estimate||estimate.id!==project.estimates.at(-1)?.id||estimate.status!=='Budget confirmed'||estimate.briefRevision!==project.briefRevision)fail(409,'Ask the client to confirm the latest estimate before issuing an invoice.');
      // A discounted invoice still covers its full share of the estimate.
      const existing=db.prepare('SELECT estimate_id,amount_minor+discount_minor AS amount_minor,net_minor+discount_net_minor AS net_minor FROM invoices WHERE studio_id=? AND project_id=? AND cancelled_at IS NULL').all(studio.id,project.id);
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
      const missing=[[sellerAddress,'your studio address'],[customerAddress,'the client billing address'],[sellerContact,'your studio contact'],[supplyDate,'the service date'],[dueDate,'the due date'],[paymentInstructions,'payment instructions']].filter(([value])=>!value).map(([,label])=>label);
      if(missing.length)fail(400,`Add ${missing.length>1?missing.slice(0,-1).join(', ')+' and '+missing.at(-1):missing[0]}.`);
      if(dueDate<now().slice(0,10))fail(400,'Choose an invoice due date today or later.');
      return transaction(db,()=>{
       const year=Number(now().slice(0,4));db.prepare('INSERT OR IGNORE INTO invoice_counters VALUES(?,?,1)').run(studio.id,year);
       const next=db.prepare('SELECT next_number FROM invoice_counters WHERE studio_id=? AND year=?').get(studio.id,year).next_number;
       db.prepare('UPDATE invoice_counters SET next_number=next_number+1 WHERE studio_id=? AND year=?').run(studio.id,year);
       const number=`INV-${year}-${String(next).padStart(4,'0')}`;
       const shareMinor=amountMinor,shareNetMinor=kind==='Balance'?estimate.subtotal-existing.reduce((sum,item)=>sum+item.net_minor,0):kind==='Full'?estimate.subtotal:Math.round(estimate.subtotal*amountMinor/estimate.total);
       if(shareNetMinor<0||shareMinor-shareNetMinor<0)fail(409,'The remaining tax breakdown needs review before invoicing.');
       const discount=discountFor(body.discount,{shareMinor,shareNetMinor});
       const figures=invoiceFigures({shareMinor,shareNetMinor,discount});amountMinor=figures.amountMinor;
       const {netMinor,taxMinor}=figures;
       if(netMinor<0||taxMinor<0)fail(409,'The remaining tax breakdown needs review before invoicing.');
       // Late fee terms and tips are fixed on the invoice when it is issued, so the client sees them from the start.
       const lateFeeRule=saved.lateFee?.enabled&&body.lateFee!==false?JSON.stringify({type:saved.lateFee.type,amountMinor:saved.lateFee.amountMinor,percent:saved.lateFee.percent,afterDays:saved.lateFee.afterDays}):'';
       const tipsAllowed=saved.tips?.enabled&&kind!=='Deposit'&&body.tips!==false?1:0;
       const snapshot={sellerName:studio.name,sellerAddress,sellerContact,taxRegistration,vatRegistered:isVatDocument({vatRegistered:estimate.vatRegistered,taxRegistration},estimate.currency),billToName:project.brief?.name||'',billToEmail:project.clientEmail,customerAddress,supplyDate,projectTitle:project.title,estimate:{id:estimate.id,version:estimate.version,title:estimate.title,note:estimate.note,items:structuredClone(estimate.items),currency:estimate.currency,taxRate:estimate.taxRate,vatRegistered:estimate.vatRegistered,subtotal:estimate.subtotal,tax:estimate.tax,total:estimate.total,briefRevision:estimate.briefRevision,decidedAt:estimate.decidedAt||'',decidedBy:estimate.decidedBy||''}};
       const invoiceId=id(),issuedAt=now();
       db.prepare(`INSERT INTO invoices(id,studio_id,project_id,number,estimate_id,estimate_version,kind,currency,amount_minor,net_minor,tax_minor,tax_rate,due_date,note,payment_instructions,snapshot,issued_at,issued_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId,studio.id,project.id,number,estimate.id,estimate.version,kind,estimate.currency,amountMinor,netMinor,taxMinor,estimate.taxRate,dueDate,note,paymentInstructions,JSON.stringify(snapshot),issuedAt,user.name);
       event(project,user,`Issued invoice ${number}`);saveProject(db,project);
       if(label)db.prepare('UPDATE invoices SET label=? WHERE id=? AND studio_id=?').run(label,invoiceId,studio.id);
       db.prepare('UPDATE invoices SET discount_minor=?,discount_net_minor=?,discount_label=?,late_fee_rule=?,tips_allowed=? WHERE id=? AND studio_id=?').run(discount?.grossMinor||0,discount?.netMinor||0,discount?.label||'',lateFeeRule,tipsAllowed,invoiceId,studio.id);
       afterInsert?.(invoiceId);
       return db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoiceId,studio.id);
      });
     };
     if(invoiceId==='plan'){
      if(subaction)fail(404,'Not found.');
      const view=()=>{const plan=planView(db,studio.id,project,invoiceRows(db,studio.id,project.id).map(row=>invoiceDTO(db,row)));return plan&&{...plan,autopay:autopayView(db,studio.id,project.id,{offered:autopayOffered(studio.id)})};};
      if(req.method==='GET')return reply(200,{plan:view(),defaults:owner?billingDefaults(db,studio.id):undefined});
      if(req.method!=='POST')fail(405,'Method not allowed.');
      if(body.action==='autopay-setup'){if(!cardPaymentsReady)fail(503,'Card payments are not available.');return reply(200,await startAutopaySetup(db,stripe,{studioId:studio.id,project,accessRole,user,appOrigin:origin}));}
      if(body.action==='autopay-off'){stopAutopay(db,{studioId:studio.id,projectId:project.id});event(project,user,'Switched off autopay');saveProject(db,project);return reply(200,{plan:view()});}
      requireOwner();
      if(body.action==='create')transaction(db,()=>createPlan(db,{studioId:studio.id,project,body}));
      else if(body.action==='update')transaction(db,()=>updatePlan(db,{studioId:studio.id,project,body}));
      else if(body.action==='delete')transaction(db,()=>deletePlan(db,{studioId:studio.id,project}));
      else if(body.action==='issue'){
       const issued=transaction(db,()=>{const {step,body:planned}=stepInvoice(db,{studioId:studio.id,project,stepId:body.stepId});return issueInvoice(project,{...body,...planned},invoiceId=>markStepInvoiced(db,{studioId:studio.id,projectId:project.id,stepId:step.id,invoiceId}));});
       await syncProjectArchives(db,{studioId:studio.id,projectId:project.id});automate(studio.id,project.id);
       return reply(201,{plan:view(),invoice:invoiceDTO(db,issued)});
      }else fail(400,'Choose a payment plan action.');
      return reply(200,{plan:view()});
     }
     const invoice=invoiceId?db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=? AND project_id=?').get(invoiceId,studio.id,project.id):null;
     if(invoiceId&&!invoice)fail(404,'Invoice not found.');
     if(req.method==='GET'&&!invoiceId)return reply(200,{invoices:invoiceRows(db,studio.id,project.id).map(row=>invoiceDTO(db,row)),design:invoiceDesign(db,studio.id),brandKit:brandKit(db,studio.id)});
     if(req.method==='GET'&&invoiceId&&!subaction)return reply(200,{invoice:invoiceDTO(db,invoice)});
     // A real PDF file of the invoice or one of its credit notes, for the studio, its bookkeeper and the project approver.
     if(req.method==='GET'&&(subaction==='pdf'||subaction?.startsWith('credit-notes/'))){
      const current=invoiceDTO(db,invoice),creditId=subaction==='pdf'?'':subaction.split('/')[1],credit=creditId?current.credits.find(item=>item.id===creditId):null;
      if(creditId&&!credit)fail(404,'Credit note not found.');
      const file=await invoicePdf(current,{db,studio,design:invoiceDesign(db,studio.id),brandKit:brandKit(db,studio.id),estimate:project.estimates?.find(item=>item.id===invoice.estimate_id)||current.snapshot.estimate,creditNote:credit});
      res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${pdfFileName(credit?'Credit note':'Invoice',credit?credit.number:invoice.number)}"`,'Content-Length':file.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
      return res.end(file);
     }
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
     if(req.method==='POST'&&subaction==='tip'){
      // Tips are the client's choice, so only the project approver sets them.
      if(owner)fail(403,'Only the client can add a tip.');
      const previous=setTip(db,{studioId:studio.id,invoice,user,amountMinor:body.amountMinor});
      if(previous!==body.amountMinor){event(project,user,body.amountMinor?`Added a tip to invoice ${invoice.number}`:`Removed the tip from invoice ${invoice.number}`);saveProject(db,project);}
      return reply(200,{invoice:invoiceDTO(db,db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoice.id,studio.id))});
     }
     if(req.method!=='POST')fail(405,'Method not allowed.');
     requireOwner();
     if(subaction==='late-fee'){
      if(body.action!=='waive')fail(400,'Choose a late fee action.');
      transaction(db,()=>{waiveLateFee(db,{studioId:studio.id,invoice,user});event(project,user,`Waived the late fee on invoice ${invoice.number}`);saveProject(db,project);});
      return reply(200,{invoice:invoiceDTO(db,db.prepare('SELECT * FROM invoices WHERE id=? AND studio_id=?').get(invoice.id,studio.id))});
     }
     if(!invoiceId){
      const issued=issueInvoice(project,body,()=>linkIssuedDeposits(db,{studioId:studio.id,projectId:project.id}));
      await syncProjectArchives(db,{studioId:studio.id,projectId:project.id});automate(studio.id,project.id);return reply(201,{invoice:invoiceDTO(db,issued)});
     }
     if(subaction==='credit-notes'||subaction==='refunds'){
      // The adjustment and its project event commit together, or neither does.
      transaction(db,()=>{
      if(activeStripeCheckout(db,{studioId:studio.id,invoiceId:invoice.id}))fail(409,'Resolve the active Stripe Checkout before adjusting this invoice.');
      const current=invoiceDTO(db,invoice);
      if(subaction==='credit-notes'){const number=issueCreditNote(db,{studioId:studio.id,invoice,user,body});event(project,user,`Issued credit note ${number} against invoice ${invoice.number}`);}
      else if(body.creditNote===true){const number=refundWithCredit(db,{studioId:studio.id,invoice,user,body,grossPaidMinor:current.grossPaidMinor});event(project,user,`Refunded ${invoice.number} and issued credit note ${number}`);}
      else{recordRefund(db,{studioId:studio.id,invoice,user,body,grossPaidMinor:current.grossPaidMinor});event(project,user,`Recorded a refund on invoice ${invoice.number}`);}
      saveProject(db,project);
      });
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
      automate(studio.id,project.id);
      return reply(200,{invoice:invoiceDTO(db,result)});
     }
     fail(404,'Not found.');
    }
    if(route==='/api/settings'&&req.method==='PATCH'){requireOwner();const name=str(body.name,120),accent=str(body.accent,7);if(!name||!/^#[0-9a-f]{6}$/i.test(accent)||!Array.isArray(body.origins)||body.origins.length>20)fail(400,'Check your studio settings.');const profession=body.profession||branding(studio.id).profession||DEFAULT_WORKFLOW;if(!isWorkflowId(profession))fail(400,'Choose a valid studio practice.');const brand={portalTitle:str(body.portalTitle||name,120),welcome:str(body.welcome||'Your project, thoughtfully brought together.',300),logoUrl:body.logoUrl===undefined?(branding(studio.id).logoUrl||''):safeURL(body.logoUrl||''),profession,projectTypes:(Array.isArray(body.projectTypes)?body.projectTypes:projectTypesFor(profession)).slice(0,20).map(v=>str(v,120)).filter(Boolean),intakeQuestions:validateIntakeQuestions(body.intakeQuestions===undefined?(branding(studio.id).intakeQuestions||[]):body.intakeQuestions)};const origins=body.origins.map(v=>{const u=new URL(safeURL(v));return u.origin;});db.prepare('UPDATE studios SET name=?,accent=?,origins=? WHERE id=?').run(name,accent,JSON.stringify([...new Set([origin,...origins])]),studio.id);db.prepare('INSERT INTO studio_branding VALUES(?,?) ON CONFLICT(studio_id) DO UPDATE SET data=excluded.data').run(studio.id,JSON.stringify(brand));return reply(200,{ok:true});}
    const draftUploadMatch=route.match(/^\/api\/projects\/([a-f0-9-]+)\/drafts\/files$/);
    if(draftUploadMatch){
     requireOwner();if(!['POST','PATCH'].includes(req.method))fail(405,'Method not allowed.');
     const projectRow=db.prepare('SELECT id,data FROM projects WHERE id=? AND studio_id=?').get(draftUploadMatch[1],studio.id);if(!projectRow)fail(404,'Project not found.');
     if(req.method==='PATCH'){const fileId=str(body.removeFileId||'',100);if(!db.prepare('SELECT 1 FROM design_assets WHERE file_id=? AND studio_id=? AND project_id=?').get(fileId,studio.id,projectRow.id))fail(404,'File not found.');if(privateFileInUse(JSON.parse(projectRow.data),projectRow.id,fileId,body.draftId))fail(409,'This file is used by another draft, a reference or a shared version.');transaction(db,()=>removePrivateFile(projectRow.id,fileId));return reply(200,{removed:fileId});}
     rate(req,'design-upload',40);const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');
     if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');
     let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');
     assertQuota(db,studio.id,data.length);const fileId=id();transaction(db,()=>{db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fileId,projectRow.id,name,mime,data);db.prepare('INSERT INTO design_assets VALUES(?,?,?,?,?)').run(fileId,studio.id,projectRow.id,user.id,now());});
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
     if(!operation&&req.method==='PATCH'&&body.remove===true){const ids=JSON.parse(row.asset_ids||'[]');transaction(db,()=>{db.prepare("DELETE FROM design_drafts WHERE id=? AND studio_id=? AND status='private'").run(row.id,studio.id);binItem(db,{studioId:studio.id,projectId:project.id,kind:'draft',label:row.title,payload:{row},fileIds:ids,user});});return reply(200,{removed:row.id});}
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
    if(!match)fail(404,'Not found.');const row=db.prepare('SELECT * FROM projects WHERE id=? AND studio_id=?').get(match[1],studio.id);const accessRole=row&&(owner?'Owner':staffViewer?'Studio viewer':projectAccess(db,studio.id,row.id,user.id));if(!accessRole)fail(404,'Project not found.');const p=JSON.parse(row.data),action=match[2],binned=[];
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
     if(body.taskId){const task=p.tasks.find(t=>t.id===body.taskId);if(!task)fail(404,'Task not found.');if(body.remove===true){requireOwner();p.tasks=p.tasks.filter(t=>t.id!==task.id);binned.push({kind:'project-task',label:task.title,payload:{task}});event(p,user,'Deleted task: '+task.title);}else{if(!owner&&task.assignee!=='client')fail(403,'Only the studio can complete this task.');
      const edits=['title','detail','due','assignee','status'].some(key=>body[key]!==undefined);if(edits){requireOwner();const title=str(body.title??task.title,200),detail=str(body.detail??task.detail??'',2000),due=date(body.due??task.due,'due date'),assignee=body.assignee??task.assignee,status=body.status??task.status??'To do';if(!title||!['studio','client'].includes(assignee)||!['To do','In progress','Completed'].includes(status))fail(400,'Check the task title, responsible party and status.');Object.assign(task,{title,detail,due,assignee,status});}
      if(body.status!==undefined&&body.completed===undefined)body.completed=body.status==='Completed';
      if(body.completed!==undefined){if(typeof body.completed!=='boolean')fail(400,'Choose a completion state.');task.completed=body.completed;task.completedBy=body.completed?user.name:'';task.completedAt=body.completed?now():'';task.status=body.completed?'Completed':body.status==='In progress'?'In progress':'To do';}else if(!edits)fail(400,'Choose a task change.');
      event(p,user,edits?'Updated task: '+task.title:`${task.completed?'Completed':'Reopened'} task: ${task.title}`);}}
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
     const title=str(body.title,200),scope=str(body.scope,10000),exclusions=str(body.exclusions||'',5000),delivery=str(body.delivery,5000),expiresOn=date(body.expiresOn,'reply date');if(!title||!scope||!delivery||!expiresOn||expiresOn<earliestOpenDay())fail(400,'Add a title, scope, delivery plan and a future reply date.');
     const richDocument=body.documentHtml===undefined?{}:(await import('./engagements.mjs')).agreementDocument({termsHtml:body.documentHtml});
     const gaps=findPlaceholders(title,scope,exclusions,delivery,richDocument.termsHtml||'');if(gaps.length)fail(400,placeholderMessage(gaps,'this proposal'));
     p.proposals.forEach(q=>{if(q.status==='Awaiting response')q.status='Superseded';});p.proposals.push({id:id(),version:p.proposals.length+1,title,scope,exclusions,delivery,expiresOn,...(richDocument.termsHtml?{documentHtml:richDocument.termsHtml,documentFormat:richDocument.documentFormat}:{}),estimate:structuredClone(estimate),briefRevision:p.briefRevision,status:'Awaiting response',by:user.name,createdAt:now()});event(p,user,'Shared proposal version '+p.proposals.length);
    }else if(action==='proposal-response'){
     if(owner)fail(403,'A client approver responds to the proposal.');const q=p.proposals?.at(-1);if(!q||q.id!==body.proposalId||q.status!=='Awaiting response'||q.briefRevision!==p.briefRevision||q.expiresOn<earliestOpenDay())fail(409,'This proposal changed or expired. Ask the studio for an update.');if(!['accept','changes'].includes(body.decision))fail(400,'Choose accept or request changes.');const feedback=str(body.feedback||'',3000);if(body.decision==='accept'&&body.acknowledged!==true)fail(400,'Confirm that you reviewed the scope and investment.');if(body.decision==='changes'&&!feedback)fail(400,'Describe the changes you need.');q.status=body.decision==='accept'?'Scope accepted':'Changes requested';q.feedback=feedback;q.decidedBy=user.name;q.decidedByUserId=user.id;q.decidedAt=now();event(p,user,q.status+' · proposal version '+q.version);
    }else if(action==='proposal-withdraw'){
     requireOwner();const q=p.proposals?.at(-1);if(!q||q.id!==body.proposalId||q.status!=='Awaiting response')fail(409,'Only the current unanswered proposal can be withdrawn.');q.status='Withdrawn';q.withdrawnBy=user.name;q.withdrawnAt=now();event(p,user,'Withdrew proposal version '+q.version);
    }else if(action==='estimates'){
     requireOwner();p.estimates||=[];if(body.discardDraft===true){delete p.estimateDraft;event(p,user,'Discarded an estimate draft');}else{if(!Array.isArray(body.items)||body.items.length<1||body.items.length>30||!['GBP','EUR','USD'].includes(body.currency))fail(400,'Add estimate items and a supported currency.');
     const items=body.items.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))fail(400,'Check each estimate item.');const title=str(item.title,200);if(!title||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10000||!Number.isInteger(item.unitAmount)||item.unitAmount<0||item.unitAmount>100000000)fail(400,'Check item descriptions, quantities and amounts.');return {title,quantity:item.quantity,unitAmount:item.unitAmount};});
     const usual=billingDefaults(db,studio.id),vatRegistered=isVatRegistered(usual),taxRate=body.taxRate??defaultTaxRate(usual);if(typeof taxRate!=='number'||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)fail(400,'Tax must be between 0 and 100.');
     const subtotal=items.reduce((sum,i)=>sum+i.quantity*i.unitAmount,0),tax=Math.round(subtotal*taxRate/100);if(subtotal>100000000)fail(400,'The estimate total is too large.');
     if(body.saveAs==='draft'){p.estimateDraft={title:str(body.title||'Project estimate',200),note:str(body.note||'',3000),currency:body.currency,items,taxRate,vatRegistered,subtotal,tax,total:subtotal+tax,updatedAt:now(),by:user.name};event(p,user,'Saved an estimate draft');}else{p.estimates.forEach(q=>{if(q.status==='Awaiting review')q.status='Superseded';});p.estimates.push({id:id(),version:p.estimates.length+1,briefRevision:p.briefRevision,title:str(body.title||'Project estimate',200),note:str(body.note||'',3000),currency:body.currency,items,taxRate,vatRegistered,subtotal,tax,total:subtotal+tax,status:'Awaiting review',at:now(),by:user.name});delete p.estimateDraft;event(p,user,'Shared a project estimate');}}
    }else if(action==='estimate-decision'){
     if(owner)fail(403,'The client confirms their budget direction.');const q=p.estimates?.find(q=>q.id===body.estimateId);if(!q||q.id!==p.estimates.at(-1)?.id||q.status!=='Awaiting review'||q.briefRevision!==p.briefRevision)fail(409,'This estimate needs updating before a decision.');if(!['confirm','changes'].includes(body.decision))fail(400,'Choose confirm or request changes.');const feedback=str(body.feedback||'',3000);if(body.decision==='changes'&&!feedback)fail(400,'Tell your studio what needs to change.');q.status=body.decision==='confirm'?'Budget confirmed':'Changes requested';q.feedback=feedback;q.decidedBy=user.name;q.decidedAt=now();event(p,user,q.status+' · estimate version '+q.version);
    }else if(action==='comments'){
     const d=p.designs.find(d=>d.id===body.designId);if(!d)fail(404,'Design version not found.');d.comments||=[];
     if(body.resolve){requireOwner();const c=d.comments.find(c=>c.id===body.commentId);if(!c)fail(404,'Comment not found.');c.resolved=true;c.resolvedBy=user.name;c.resolvedAt=now();event(p,user,'Resolved design feedback');}
     else if(body.unresolve){requireOwner();const c=d.comments.find(c=>c.id===body.commentId);if(!c)fail(404,'Comment not found.');c.resolved=false;c.resolvedBy='';c.resolvedAt='';event(p,user,'Reopened design feedback');}
     else if(body.editCommentId||body.removeCommentId){const c=d.comments.find(c=>c.id===(body.editCommentId||body.removeCommentId));if(!c)fail(404,'Comment not found.');const mine=c.byUserId?c.byUserId===user.id:false;if(body.removeCommentId){if(!owner&&!mine)fail(403,'You can only delete your own comments.');binned.push({kind:'design-comment',label:c.text.slice(0,120)||'Design comment',detail:`${c.by||'Someone'} on ${d.title}`,payload:{designId:d.id,comments:d.comments.filter(x=>x.id===c.id||x.parentId===c.id)}});d.comments=d.comments.filter(x=>x.id!==c.id&&x.parentId!==c.id);event(p,user,'Deleted a design comment');}else{if(!mine)fail(403,'You can only edit your own comments.');const text=str(body.text,3000);if(!text)fail(400,'Write your feedback first.');c.text=text;c.editedAt=now();event(p,user,'Edited a design comment');}}
     else {const text=str(body.text,3000);if(!text)fail(400,'Write your feedback first.');const primary=d.fileId||'primary';let assetId=body.assetId===undefined?primary:str(body.assetId,80);if(assetId==='primary')assetId=primary;const valid=new Set([primary,...(d.assets||[]).map(a=>a.fileId)]);if(!valid.has(assetId))fail(400,'Choose an asset from this design version.');let parentId=null;if(body.parentId){const parent=d.comments.find(c=>c.id===body.parentId);if(!parent||parent.parentId)fail(400,'Choose a top-level comment in this version.');if((parent.assetId||primary)!==assetId)fail(400,'Replies must stay with the same asset.');parentId=parent.id;}let point=null;if(body.point){if(parentId)fail(400,'Add a pin to a new comment, not a reply.');if(![body.point.x,body.point.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))fail(400,'Choose a point inside the image.');const asset=(d.assets||[]).find(a=>a.fileId===assetId);if(asset&&!asset.mime?.startsWith('image/'))fail(400,'Pins are available on images only.');point={x:body.point.x,y:body.point.y};}let page=null;if(body.page!=null){if(parentId)fail(400,'Add a page to a new comment, not a reply.');const mime=(d.assets||[]).find(a=>a.fileId===assetId)?.mime||db.prepare('SELECT mime FROM files WHERE id=? AND project_id=?').get(assetId,p.id)?.mime;if(mime!=='application/pdf')fail(400,'Page numbers are for PDF files.');if(!Number.isInteger(body.page)||body.page<1||body.page>2000)fail(400,'Choose a page number.');page=body.page;}d.comments.push({id:id(),text,point,...(page?{page}:{}),assetId,parentId,by:user.name,byUserId:user.id,role:studio.role,at:now(),resolved:false});event(p,user,`Commented on design version ${d.version}`);}
    }else if(action==='brief'){
     if(body.revision!==p.briefRevision)fail(409,'The brief changed while you were editing. Refresh before saving.');const b=brief({...body.brief,email:p.clientEmail,workflowType:owner?body.brief.workflowType||p.brief.workflowType:p.brief.workflowType,intakeAnswers:updateIntakeAnswers(p.brief.intakeAnswers,body.brief.intakeAnswers)});if(p.briefLocked){p.changeRequests.unshift({id:id(),brief:b,baseRevision:p.briefRevision,note:str(body.note||'Requested an update to the agreed brief.',1000),status:'Pending',by:user.name,at:now()});event(p,user,'Requested a change to the approved brief');}
     else{p.briefHistory.unshift({revision:p.briefRevision,brief:p.brief,at:now(),by:user.name,author:p.briefAuthor,authoredAt:p.briefAuthoredAt});p.brief=b;p.briefRevision++;p.briefAuthor=user.name;p.briefAuthoredAt=now();event(p,user,'Updated the brief');}
    }else if(action==='messages'){const text=str(body.text,5000);if(!text)fail(400,'Write a message first.');transaction(db,()=>{const c=materializeProjectConversation(db,p),messageId=appendConversationMessage(db,c,user,studio.role,text,body.clientMessageId?str(body.clientMessageId,120):null);queueMessage(studio.id,c,user.id,messageId);});return reply(200,{project:decorate(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data))});
    }else if(action==='inspiration'){const title=str(body.title,200),note=str(body.note||'',3000),link=safeURL(body.url||'');if(!title)fail(400,'Add a title.');if(!link&&!note)fail(400,'Add a link or a note.');p.inspiration.unshift({id:id(),title,note,url:link,category:str(body.category||'',80),source:str(body.source||'',300),comments:[],by:user.name,byUserId:user.id,at:now()});event(p,user,'Added inspiration');
    }else if(action==='reference-layout'){
     requireOwner();p.referenceLayout=saveReferenceLayout(p,body);event(p,user,'Arranged the reference board');
    }else if(action==='reference-update'){
     const item=p.inspiration.find(ref=>ref.id===body.referenceId);if(!item)fail(404,'Reference not found.');if(body.remove===true){if(!owner&&item.byUserId!==user.id)fail(403,'Only the studio or the person who added this reference can remove it.');binned.push({kind:'reference',label:item.title,detail:item.note||item.url||'',payload:{reference:item,position:p.referenceLayout?.positions?.[item.id]||null},fileIds:item.fileId?[item.fileId]:[]});p.inspiration=p.inspiration.filter(ref=>ref.id!==item.id);if(p.referenceLayout?.positions?.[item.id])delete p.referenceLayout.positions[item.id];event(p,user,'Removed a reference: '+item.title);}else{requireOwner();const title=str(body.title,200);if(!title)fail(400,'Add a title.');item.title=title;item.note=str(body.note||'',3000);item.category=str(body.category||'',80);item.source=str(body.source||'',300);event(p,user,'Updated reference details');}
    }else if(action==='reference-comments'){
     const item=p.inspiration.find(ref=>ref.id===body.referenceId);if(!item)fail(404,'Reference not found.');if(body.removeCommentId){const c=(item.comments||[]).find(c=>c.id===body.removeCommentId);if(!c)fail(404,'Comment not found.');if(!owner&&c.byUserId!==user.id)fail(403,'You can only remove your own comments.');binned.push({kind:'reference-comment',label:c.text.slice(0,120),detail:`${c.by||'Someone'} on ${item.title}`,payload:{referenceId:item.id,comment:c}});item.comments=item.comments.filter(x=>x.id!==c.id);event(p,user,'Removed a reference comment');}else{const text=str(body.text,3000);if(!text)fail(400,'Write a comment first.');let point=null;if(body.point){if(![body.point.x,body.point.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))fail(400,'Choose a point inside the image.');point={x:body.point.x,y:body.point.y};}item.comments||=[];item.comments.push({id:id(),text,point,by:user.name,byUserId:user.id,role:studio.role,at:now()});event(p,user,'Discussed a project reference');}
    }else if(action==='files'){
     rate(req,'upload',40);const name=str(body.name,180),data=Buffer.from(str(body.content,8400000),'base64');if(!name||data.length>6000000||data.length<12)fail(400,'Choose a file smaller than 6 MB.');let mime='';if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';else if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')mime='image/webp';else if(data.toString('ascii',0,5)==='%PDF-')mime='application/pdf';else fail(400,'Use a PNG, JPG, WebP or PDF file.');assertQuota(db,studio.id,data.length);const fid=id();db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(fid,p.id,name,mime,data);p.inspiration.unshift({id:id(),title:str(body.title||name,200),note:str(body.note||'',3000),category:str(body.category||'',80),source:str(body.source||'',300),comments:[],fileId:fid,mime,by:user.name,byUserId:user.id,at:now()});event(p,user,'Added a file');
    }else if(action==='designs'){requireOwner();const title=str(body.title,200),description=str(body.description||'',5000),fileId=str(body.fileId||'',100);if(!title||!description)fail(400,'Add a design title and description.');if(fileId&&!db.prepare('SELECT id FROM files WHERE id=? AND project_id=?').get(fileId,p.id))fail(400,'Choose a file from this project.');p.designs.forEach(d=>{if(d.status==='Awaiting approval')d.status='Superseded';});p.designs.push({id:id(),version:p.designs.length+1,briefRevision:p.briefRevision,briefSnapshot:structuredClone(p.brief),title,description,fileId,status:'Awaiting approval',at:now(),feedback:''});p.status='Design';event(p,user,`Shared design version ${p.designs.length}`);
    }else if(action==='approval'){if(owner)fail(403,'Design approval belongs to the client.');const d=p.designs.find(d=>d.id===body.designId);if(!d||d.id!==p.designs.at(-1)?.id||d.status!=='Awaiting approval')fail(409,'This version is no longer awaiting a decision. Refresh to see the latest design.');if(d.briefRevision!==p.briefRevision)fail(409,'The brief changed after this design was shared. Ask the studio to share a fresh version.');if(!['approve','changes'].includes(body.decision))fail(400,'Choose an approval or request changes.');d.feedback=str(body.feedback||'',3000);if(body.decision==='changes'&&!d.feedback)fail(400,'Tell the studio what you would like changed.');d.status=body.decision==='approve'?'Approved':'Changes requested';d.decidedAt=now();d.decidedBy=user.name;if(body.decision==='approve'){p.briefLocked=true;p.status='Approved';}event(p,user,`${d.status} · design version ${d.version}`);
    }else if(action==='changes'){requireOwner();const change=p.changeRequests.find(c=>c.id===body.changeId);if(!change||change.status!=='Pending')fail(409,'This change has already been reviewed.');if(!['accept','decline'].includes(body.decision))fail(400,'Choose accept or decline.');if(body.decision==='accept'){if(change.baseRevision!==p.briefRevision)fail(409,'A newer brief exists. Review and decline this outdated request.');p.briefHistory.unshift({revision:p.briefRevision,brief:p.brief,at:now(),by:user.name,author:p.briefAuthor,authoredAt:p.briefAuthoredAt});p.brief=change.brief;p.briefRevision++;p.briefAuthor=change.by;p.briefAuthoredAt=now();p.briefLocked=false;p.status='Design';}change.status=body.decision==='accept'?'Accepted':'Declined';change.response=str(body.note||'',1000);change.decidedBy=user.name;change.decidedAt=now();event(p,user,`${change.status} a brief change request`);
    }else if(action==='status'){requireOwner();if(!['Enquiry','Planning','Design','Complete','Archived'].includes(body.status))fail(400,'Choose a valid stage.');p.status=body.status;event(p,user,`Moved project to ${p.status.toLowerCase()}`);
    }else if(action==='invite'){requireOwner();const primary=db.prepare(`SELECT ct.email FROM crm_project_stakeholders ps JOIN crm_contacts ct ON ct.id=ps.contact_id AND ct.studio_id=ps.studio_id WHERE ps.project_id=? AND ps.studio_id=? AND ps.primary_contact=1`).get(p.id,studio.id);const state=clientShareState(db,studio.id,p.id);
     // Inviting shares the project. A client who already has a login sees it at once, so no link is needed.
     if(!state.joined||state.shared){const invitation=transaction(db,()=>{setProjectShared(db,studio.id,p.id,true);return createInvitation(primary?.email||p.clientEmail);});return reply(201,{...invitation,project:decorate(p)});}
     setProjectShared(db,studio.id,p.id,true);event(p,user,'Shared the project with the client');
    }else fail(404,'Not found.');
    transaction(db,()=>{saveProject(db,p);for(const item of binned)binItem(db,{studioId:studio.id,projectId:p.id,user,...item});queueProjectEvent(studio.id,p.id,user.id,p.activity?.[0]?.id);});if(action==='proposals')await syncProjectArchives(db,{studioId:studio.id,projectId:p.id});
    // Answering a quote or proposal, or setting the date, moves the enquiry on at once; the reply carries what the automation changed.
    if(['estimates','estimate-decision','proposals','proposal-response','proposal-withdraw','brief','changes'].includes(action)){automate(studio.id,p.id);return reply(200,{project:decorate(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data))});}
    return reply(200,{project:decorate(p)});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method not allowed.');
   if(route==='/embed.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');return res.end(await readFile(path.join(root,'public/embed.js')));}
   if(vite){const slug=route.match(/^\/intake\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?$/)?.[1];if(slug){const site=db.prepare('SELECT origins FROM studios WHERE slug=?').get(slug);if(!site)fail(404,'Studio not found.');res.setHeader('Content-Security-Policy',`frame-ancestors 'self' ${JSON.parse(site.origins).join(' ')}`);}else res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});return;}
   const asset=route.match(/^\/(app\.(?:js|css)|favicon\.svg|assets\/(?:identity\/)?[a-zA-Z0-9._-]+)$/);
   if(asset){const file=asset[1];const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain'})[ext]||'application/octet-stream');return res.end(await readFile(path.join(root,'dist',file)));}
   const intakeSlug=route.match(/^\/intake\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?$/)?.[1];
   if(intakeSlug){const s=db.prepare('SELECT origins FROM studios WHERE slug=?').get(intakeSlug);if(!s)fail(404,'Studio not found.');res.setHeader('Content-Security-Policy',`${appCSP}; frame-ancestors 'self' ${JSON.parse(s.origins).join(' ')}`);}else res.setHeader('Content-Security-Policy',`${appCSP}; frame-ancestors 'none'`);
   if(!['/','/join','/join-studio','/login','/embed-demo','/recover','/reset-password','/verify-email','/confirm-email','/account'].includes(route)&&!intakeSlug&&!/^\/book\/[a-z0-9-]+(\/manage)?$/.test(route))fail(404,'Not found.');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(await readFile(path.join(root,'dist/index.html')));
  }catch(error){if(!error?.status)console.error(`Unexpected error on ${req.method} ${route??'(invalid address)'}:`,error?.stack||error);if(res.headersSent)return res.end();reply(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
 });
 // Bound slow clients: headers within 20 s, a whole request (including an 8.5 MB upload) within 2 minutes.
 server.headersTimeout=20000;server.requestTimeout=120000;
 // Reminders run hourly in a long-lived server. The hosted demo and tests pass reminderIntervalMs:0.
 // Email stays off until CALEANE_EMAIL_ENABLED=1 and the Resend key and sender are set. The demo never sends.
 let deliver=emailDelivery;
 if(!deliver&&process.env.CALEANE_EMAIL_ENABLED==='1'&&!disableExternalServices&&!demo){
  const missing=[...(caleaneEnv('NOTIFICATION_KEY')?[]:['CALEANE_NOTIFICATION_KEY']),...['RESEND_API_KEY','RESEND_FROM'].filter(key=>!process.env[key])];
  if(missing.length)console.warn('Email is switched on but not configured, so nothing will be sent. Set '+missing.join(', ')+'.');
  else deliver=createResendDelivery({apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM});
 }
 let emailRunning=false;
 async function sendQueuedEmail(){if(emailRunning||!deliver)return;emailRunning=true;try{for(let count=0;count<20;count++){const result=await accountSecurity.dispatchOne(deliver)||(outbox&&await outbox.dispatchOne(deliver));if(!result)break;}}catch(error){console.error('Email delivery run failed:',error.message);}finally{emailRunning=false;}}
 const emailTimer=deliver&&emailIntervalMs>0?setInterval(sendQueuedEmail,emailIntervalMs):null;emailTimer?.unref();
 const scheduledTimer=scheduledIntervalMs>0?setInterval(()=>{try{sendDueScheduled(db,{afterSend:queueMessage});}catch(error){console.error('Scheduled messages could not be sent:',error.message);}},scheduledIntervalMs):null;scheduledTimer?.unref();
 const reminderTimer=reminderIntervalMs>0?setInterval(()=>{runAllReminders(db,{outbox});syncAllPipelines(db,{outbox});collectAutopay();},reminderIntervalMs):null;reminderTimer?.unref();
 // Uploads never attached to a message or task are removed at start-up and then hourly.
 const cleanUploads=()=>{try{cleanupUnattachedUploads(db);}catch(error){console.error('Upload cleanup failed:',error?.stack||error);}};cleanUploads();
 const uploadTimer=uploadCleanupIntervalMs>0?setInterval(cleanUploads,uploadCleanupIntervalMs):null;uploadTimer?.unref();
 // Outgoing webhooks: find new events and send what is due every 15 seconds.
 let webhookRun=null;const tickWebhooks=()=>{if(webhookRun)return;webhookRun=runWebhooks(db).catch(error=>console.error('Webhook delivery failed:',error?.stack||error)).finally(()=>{webhookRun=null;});};
 const webhookTimer=webhookIntervalMs>0?setInterval(tickWebhooks,webhookIntervalMs):null;webhookTimer?.unref();
 // Connected services every five minutes: calendar dates, booking links and events, and Xero.
 let calendarRun=null;const tickCalendars=()=>{if(calendarRun)return;calendarRun=syncAllCalendars(db).then(()=>syncBookingIntegrations(db)).then(()=>syncAllXero(db)).catch(error=>console.error('Calendar sync failed:',error?.stack||error)).finally(()=>{calendarRun=null;});};
 const calendarTimer=calendarIntervalMs>0?setInterval(tickCalendars,calendarIntervalMs):null;calendarTimer?.unref();
  server.on('close',()=>{vite?.close();if(emailTimer)clearInterval(emailTimer);if(scheduledTimer)clearInterval(scheduledTimer);if(reminderTimer)clearInterval(reminderTimer);if(uploadTimer)clearInterval(uploadTimer);if(webhookTimer)clearInterval(webhookTimer);if(calendarTimer)clearInterval(calendarTimer);});
  if(freshDemo&&showcase)await seedShowcase({server,db,origin});
  return {server,db,sendQueuedEmail,collectAutopay};
}
// The demo seeds accounts with a published password, so a production process needs an explicit opt-in to run it.
export function assertSafeStartup(env=process.env){if(env.WORKSPACE_DEMO==='1'&&env.NODE_ENV==='production'&&env.ALLOW_PUBLIC_DEMO!=='1')throw new Error('WORKSPACE_DEMO=1 seeds accounts with a known password. Set ALLOW_PUBLIC_DEMO=1 to run the demo with NODE_ENV=production.');}
if(process.argv[1]===fileURLToPath(import.meta.url)){assertSafeStartup();const port=Number(process.env.PORT||4320),host=process.env.HOST||'127.0.0.1';if(host==='0.0.0.0'&&!process.env.APP_ORIGIN)throw new Error('APP_ORIGIN is required when binding publicly.');const {server}=await createWorkspace({origin:process.env.APP_ORIGIN||`http://127.0.0.1:${port}`,demo:process.env.WORKSPACE_DEMO==='1',showcase:process.env.WORKSPACE_DEMO==='1',dev:process.argv.includes('--dev'),dbFile:process.env.DATABASE_PATH||undefined});server.listen(port,host,()=>console.log(`Caleane listening on ${host}:${port}`));}
