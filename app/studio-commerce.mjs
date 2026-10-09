import {id,now,transaction} from './store.mjs';
import {invoiceFonts,invoiceLayouts,normaliseInvoiceDesign} from './src/lib/invoice-design.js';
import {DEFAULT_VAT_RATE,isVatRegistered} from './src/lib/vat.js';
import {CURRENCIES} from './src/lib/currencies.js';
import {PRICE_UNITS} from './src/lib/price-units.js';
import {defaultLateFee,defaultTips,validateLateFee,validateTips} from './invoice-extras.mjs';

// Studio-level libraries the owner reuses across projects: a price list,
// saved message templates and the details printed on every invoice.
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max,label,required=false)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);const result=value.trim();if(required&&!result)fail(400,`Add ${label}.`);return result;};
export const currencies=CURRENCIES;
export const catalogueUnits=PRICE_UNITS;
export const placeholderKeys=['client_first_name','client_name','project_title','project_date','studio_name','booking_link','portal_link'];

export const defaultTemplates=[
 {name:'Enquiry received',category:'Enquiries',body:'Hi {client_first_name},\n\nThank you for getting in touch about {project_title}. We have your details and will come back to you shortly with next steps.\n\nIf it helps to talk it through, you can book a short call here: {booking_link}\n\n{studio_name}'},
 {name:'Proposal shared',category:'Proposals',body:'Hi {client_first_name},\n\nYour proposal for {project_title} is ready to review in your project space. Take your time, and let us know if anything needs adjusting.\n\n{studio_name}'},
 {name:'Final details',category:'Delivery',body:'Hi {client_first_name},\n\nWe are getting close to {project_date}. Could you confirm the final timings, access arrangements and any last changes here?\n\n{studio_name}'},
 {name:'Thank you',category:'Follow-up',body:'Hi {client_first_name},\n\nThank you for trusting us with {project_title}. It was a pleasure working with you. If you have a moment, we would love to hear how you found the experience.\n\n{studio_name}'}
];

export const defaultBillingDefaults={sellerAddress:'',sellerContact:'',taxRegistration:'',vatRegistered:false,paymentInstructions:'',paymentTermsDays:14,currency:'GBP',taxRate:0,lateFee:defaultLateFee,tips:defaultTips,
 plan:[{label:'Deposit',percent:30,due:{type:'on_issue',days:0}},{label:'Balance',percent:70,due:{type:'days_before_event',days:14}}]};

export function installStudioCommerce(db){db.exec(`
 CREATE TABLE IF NOT EXISTS studio_settings_kv(studio_id TEXT NOT NULL REFERENCES studios(id),key TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(studio_id,key));
 CREATE TABLE IF NOT EXISTS service_catalogue(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),position INTEGER NOT NULL,data TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS service_catalogue_studio ON service_catalogue(studio_id,archived,position);
 CREATE TABLE IF NOT EXISTS message_templates(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),position INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS message_templates_studio ON message_templates(studio_id,position);`);}

export function readSetting(db,studioId,key,fallback){const row=db.prepare('SELECT data FROM studio_settings_kv WHERE studio_id=? AND key=?').get(studioId,key);return row?JSON.parse(row.data):structuredClone(fallback);}
export function writeSetting(db,studioId,key,data){db.prepare('INSERT INTO studio_settings_kv VALUES(?,?,?,?) ON CONFLICT(studio_id,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(studioId,key,JSON.stringify(data),now());return data;}

function catalogueItem(input){
 const unitAmount=input.unitAmount;
 if(!Number.isSafeInteger(unitAmount)||unitAmount<0||unitAmount>100000000)fail(400,'Enter a price between zero and one million.');
 const currency=input.currency||'GBP';if(!currencies.includes(currency))fail(400,'Choose a supported currency.');
 const unit=input.unit||'each';if(!catalogueUnits.includes(unit))fail(400,'Choose how this item is priced.');
 return {name:text(input.name,120,'the item name',true),description:text(input.description,500,'the description'),category:text(input.category,60,'the category'),unitAmount,currency,unit};
}
export function listCatalogue(db,studioId,{includeArchived=false}={}){
 return db.prepare(`SELECT * FROM service_catalogue WHERE studio_id=?${includeArchived?'':' AND archived=0'} ORDER BY archived,position,updated_at`).all(studioId).map(row=>({id:row.id,...JSON.parse(row.data),archived:!!row.archived,updatedAt:row.updated_at}));
}
export function changeCatalogue(db,studioId,body){
 return transaction(db,()=>{
  if(body.action==='create'){
   if(db.prepare('SELECT COUNT(*) AS n FROM service_catalogue WHERE studio_id=? AND archived=0').get(studioId).n>=200)fail(409,'Your price list can hold up to 200 active items.');
   const position=(db.prepare('SELECT MAX(position) AS p FROM service_catalogue WHERE studio_id=?').get(studioId).p??-1)+1;
   db.prepare('INSERT INTO service_catalogue VALUES(?,?,?,?,0,?)').run(id(),studioId,position,JSON.stringify(catalogueItem(body.item||{})),now());
  }else{
   const row=db.prepare('SELECT * FROM service_catalogue WHERE id=? AND studio_id=?').get(text(body.id,64,'the item'),studioId);if(!row)fail(404,'Price list item not found.');
   if(body.action==='update')db.prepare('UPDATE service_catalogue SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(catalogueItem(body.item||{})),now(),row.id);
   else if(body.action==='archive'||body.action==='restore')db.prepare('UPDATE service_catalogue SET archived=?,updated_at=? WHERE id=?').run(body.action==='archive'?1:0,now(),row.id);
   else if(body.action==='move'){const list=listCatalogue(db,studioId),index=list.findIndex(item=>item.id===row.id),target=index+(body.direction==='up'?-1:1);if(index<0||target<0||target>=list.length)return listCatalogue(db,studioId,{includeArchived:true});[list[index],list[target]]=[list[target],list[index]];list.forEach((item,position)=>db.prepare('UPDATE service_catalogue SET position=? WHERE id=?').run(position,item.id));}
   else fail(400,'Choose a price list action.');
  }
  return listCatalogue(db,studioId,{includeArchived:true});
 });
}

function template(input){return {name:text(input.name,80,'the template name',true),category:text(input.category,40,'the category'),body:text(input.body,4000,'the message',true)};}
export function listTemplates(db,studioId){
 if(!readSetting(db,studioId,'templates_seeded',false)){
  transaction(db,()=>{defaultTemplates.forEach((item,position)=>db.prepare('INSERT INTO message_templates VALUES(?,?,?,?,?)').run(id(),studioId,position,JSON.stringify(item),now()));writeSetting(db,studioId,'templates_seeded',true);});
 }
 return db.prepare('SELECT * FROM message_templates WHERE studio_id=? ORDER BY position,updated_at').all(studioId).map(row=>({id:row.id,...JSON.parse(row.data),updatedAt:row.updated_at}));
}
export function changeTemplates(db,studioId,body){
 listTemplates(db,studioId);
 return transaction(db,()=>{
  if(body.action==='create'){
   if(db.prepare('SELECT COUNT(*) AS n FROM message_templates WHERE studio_id=?').get(studioId).n>=60)fail(409,'You can save up to 60 templates.');
   const position=(db.prepare('SELECT MAX(position) AS p FROM message_templates WHERE studio_id=?').get(studioId).p??-1)+1;
   db.prepare('INSERT INTO message_templates VALUES(?,?,?,?,?)').run(id(),studioId,position,JSON.stringify(template(body.template||{})),now());
  }else{
   const row=db.prepare('SELECT * FROM message_templates WHERE id=? AND studio_id=?').get(text(body.id,64,'the template'),studioId);if(!row)fail(404,'Template not found.');
   if(body.action==='update')db.prepare('UPDATE message_templates SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(template(body.template||{})),now(),row.id);
   else if(body.action==='delete')db.prepare('DELETE FROM message_templates WHERE id=?').run(row.id);
   else fail(400,'Choose a template action.');
  }
  return listTemplates(db,studioId);
 });
}

export const planDueTypes=['on_issue','days_after_confirm','days_before_event','fixed_date'];
export function validatePlanTemplate(steps){
 if(!Array.isArray(steps)||steps.length<1||steps.length>6)fail(400,'A payment plan needs between one and six payments.');
 const result=steps.map((step,index)=>{
  const percent=step.percent;if(typeof percent!=='number'||!Number.isFinite(percent)||percent<=0||percent>100)fail(400,`Payment ${index+1} needs a percentage above zero.`);
  const type=step.due?.type||'on_issue';if(!planDueTypes.includes(type)||type==='fixed_date')fail(400,`Choose when payment ${index+1} is due.`);
  const days=step.due?.days??0;if(!Number.isInteger(days)||days<0||days>365)fail(400,`Use between 0 and 365 days for payment ${index+1}.`);
  return {label:text(step.label,60,`the name of payment ${index+1}`,true),percent:Math.round(percent*100)/100,due:{type,days}};
 });
 if(Math.abs(result.reduce((sum,step)=>sum+step.percent,0)-100)>0.001)fail(400,'The payments in a plan must add up to 100%.');
 return result;
}
// vatRegistered is worked out for settings saved before the switch existed, so their rate keeps showing.
export function billingDefaults(db,studioId){const saved=readSetting(db,studioId,'billing_defaults',{});return {...structuredClone(defaultBillingDefaults),...saved,vatRegistered:isVatRegistered(saved),lateFee:{...defaultLateFee,...(saved.lateFee||{})},tips:{...defaultTips,...(saved.tips||{})}};}
export function saveBillingDefaults(db,studioId,body){
 const terms=body.paymentTermsDays??14;if(!Number.isInteger(terms)||terms<0||terms>120)fail(400,'Use payment terms between 0 and 120 days.');
 const vatRegistered=typeof body.vatRegistered==='boolean'?body.vatRegistered:isVatRegistered(body);if(body.vatRegistered!=null&&typeof body.vatRegistered!=='boolean')fail(400,'Choose whether the studio is VAT registered.');
 const currency=body.currency??'GBP',taxRate=body.taxRate??(vatRegistered?DEFAULT_VAT_RATE:0);if(!currencies.includes(currency))fail(400,'Choose a supported currency.');if(typeof taxRate!=='number'||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)fail(400,'Tax must be between 0 and 100.');
 return writeSetting(db,studioId,'billing_defaults',{currency,vatRegistered,taxRate,sellerAddress:text(body.sellerAddress,500,'the studio address'),sellerContact:text(body.sellerContact,300,'the studio contact'),taxRegistration:text(body.taxRegistration,100,'the tax registration'),paymentInstructions:text(body.paymentInstructions,1000,'the payment instructions'),paymentTermsDays:terms,plan:validatePlanTemplate(body.plan),lateFee:validateLateFee(body.lateFee),tips:validateTips(body.tips)});
}

export function invoiceDesign(db,studioId){return normaliseInvoiceDesign(readSetting(db,studioId,'invoice_design',{}));}
export function saveInvoiceDesign(db,studioId,body){
 if(!invoiceLayouts.some(([key])=>key===body.layout))fail(400,'Choose an invoice layout.');
 if(!invoiceFonts.some(([key])=>key===body.font))fail(400,'Choose an invoice typeface.');
 if(body.accent&&!/^#[0-9a-f]{6}$/i.test(body.accent))fail(400,'Use a colour like #1f2a24, or leave it blank to use your studio colour.');
 if(typeof body.showLogo!=='boolean')fail(400,'Choose whether to show your logo.');
 if(body.showItems!==undefined&&typeof body.showItems!=='boolean')fail(400,'Choose whether to list the project items.');
 const thankYou=text(body.thankYou,300,'the closing line',false),footer=text(body.footer,500,'the footer',false);
 return writeSetting(db,studioId,'invoice_design',normaliseInvoiceDesign({layout:body.layout,font:body.font,accent:body.accent||'',showLogo:body.showLogo,showItems:body.showItems!==false,thankYou,footer}));
}

export async function handleStudioCommerce({db,req,route,body,studio,owner,reply}){
 if(route==='/api/invoice-design'){
  installStudioCommerce(db);
  if(req.method==='GET')return reply(200,{design:invoiceDesign(db,studio.id)}),true;
  if(req.method==='POST'){if(!owner)fail(403,'Only the studio owner can change the invoice design.');return reply(200,{design:saveInvoiceDesign(db,studio.id,body)}),true;}
  fail(405,'Method not allowed.');
 }
 const routes={'/api/catalogue':1,'/api/message-templates':1,'/api/billing-defaults':1};
 if(!routes[route])return false;
 if(!owner)fail(403,'Only the studio owner can manage these settings.');
 installStudioCommerce(db);
 if(route==='/api/catalogue'){
  if(req.method==='GET')return reply(200,{items:listCatalogue(db,studio.id,{includeArchived:true})}),true;
  if(req.method==='POST')return reply(200,{items:changeCatalogue(db,studio.id,body)}),true;
 }
 if(route==='/api/message-templates'){
  if(req.method==='GET')return reply(200,{templates:listTemplates(db,studio.id),placeholders:placeholderKeys}),true;
  if(req.method==='POST')return reply(200,{templates:changeTemplates(db,studio.id,body)}),true;
 }
 if(route==='/api/billing-defaults'){
  if(req.method==='GET')return reply(200,{defaults:billingDefaults(db,studio.id)}),true;
  if(req.method==='POST')return reply(200,{defaults:saveBillingDefaults(db,studio.id,body)}),true;
 }
 fail(405,'Method not allowed.');
}
