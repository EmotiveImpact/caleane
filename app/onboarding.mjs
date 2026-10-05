import {now} from './store.mjs';
import {projectAccess} from './relationships.mjs';

// First-run guidance. Steps are worked out from real records, so nothing is ticked by hand;
// only dismissing the checklist and seeing the client welcome are stored.
const DEFAULT_ACCENT='#181925',DEFAULT_WELCOME='Your project, thoughtfully brought together.';
const KEYS=['studio-setup-dismissed','client-welcome-seen'];

function fail(status,message){throw Object.assign(new Error(message),{status});}
const hasTable=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const exists=(db,sql,...args)=>!!db.prepare(sql).get(...args);

export function installOnboarding(db){
 db.exec(`CREATE TABLE IF NOT EXISTS onboarding_state(user_id TEXT NOT NULL REFERENCES users(id),studio_id TEXT NOT NULL REFERENCES studios(id),
  key TEXT NOT NULL CHECK(key IN (${KEYS.map(key=>`'${key}'`).join(',')})),at TEXT NOT NULL,PRIMARY KEY(user_id,studio_id,key));`);
}

const flag=(db,userId,studioId,key)=>exists(db,'SELECT 1 FROM onboarding_state WHERE user_id=? AND studio_id=? AND key=?',userId,studioId,key);

export function studioSetupSteps(db,studioId){
 const studio=db.prepare('SELECT accent FROM studios WHERE id=?').get(studioId);
 const brand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(studioId)?.data||'{}');
 const steps=[
  {id:'brand',title:'Add your brand',detail:'Your logo, colour and the welcome your clients see.',done:!!brand.logoUrl||(studio?.accent||DEFAULT_ACCENT).toLowerCase()!==DEFAULT_ACCENT||(!!brand.welcome&&brand.welcome!==DEFAULT_WELCOME)},
  {id:'form',title:'Publish your enquiry form',detail:'Share it or add it to your website so new enquiries arrive here.',done:(hasTable(db,'enquiry_forms')&&exists(db,"SELECT 1 FROM enquiry_forms WHERE studio_id=? AND published_version>0",studioId))||exists(db,'SELECT 1 FROM receipts WHERE studio_id=?',studioId)},
  {id:'project',title:'Add your first client and project',detail:'Start from an enquiry or add someone you already work with.',done:exists(db,'SELECT 1 FROM projects WHERE studio_id=?',studioId)},
  {id:'invite',title:'Invite a client to their project',detail:'They get one place for the brief, designs, decisions and messages.',done:exists(db,"SELECT 1 FROM memberships WHERE studio_id=? AND role='client'",studioId)||exists(db,'SELECT 1 FROM invitations WHERE studio_id=?',studioId)},
  {id:'team',title:'Invite your team',detail:'Give a teammate access to the projects they work on.',optional:true,done:exists(db,'SELECT 1 FROM studio_staff WHERE studio_id=?',studioId)||exists(db,'SELECT 1 FROM staff_invitations WHERE studio_id=?',studioId)},
  {id:'calendar',title:'Connect your calendar',detail:'Send project dates and tasks to Google or Outlook.',optional:true,done:hasTable(db,'calendar_connections')&&exists(db,'SELECT 1 FROM calendar_connections WHERE studio_id=?',studioId)},
 ];
 return steps;
}

export function onboardingState(db,{studioId,userId,role}){
 if(role==='owner'){
  const steps=studioSetupSteps(db,studioId),required=steps.filter(step=>!step.optional);
  return {role,studioSetup:{steps,completed:steps.filter(step=>step.done).length,total:steps.length,complete:required.every(step=>step.done),dismissed:flag(db,userId,studioId,'studio-setup-dismissed')}};
 }
 if(role==='client'){
  const projects=db.prepare('SELECT id,data FROM projects WHERE studio_id=?').all(studioId).filter(row=>projectAccess(db,studioId,row.id,userId));
  const brand=JSON.parse(db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(studioId)?.data||'{}'),studio=db.prepare('SELECT name FROM studios WHERE id=?').get(studioId);
  return {role,clientWelcome:{show:!flag(db,userId,studioId,'client-welcome-seen'),studioName:brand.portalTitle||studio?.name||'',welcome:brand.welcome||DEFAULT_WELCOME,logoUrl:brand.logoUrl||'',
   projects:projects.map(row=>{const p=JSON.parse(row.data);return {id:p.id,title:p.title};})}};
 }
 return {role};
}

export function handleOnboarding({db,req,route,body,user,studio,reply}){
 if(route!=='/api/onboarding')return false;
 const args={studioId:studio.id,userId:user.id,role:studio.role};
 if(req.method==='GET'){reply(200,onboardingState(db,args));return true;}
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const actions={'dismiss-setup':['owner','studio-setup-dismissed',true],'restore-setup':['owner','studio-setup-dismissed',false],'welcome-seen':['client','client-welcome-seen',true]};
 const action=actions[body.action];if(!action)fail(400,'Choose an onboarding action.');
 if(action[0]!==studio.role)fail(403,'This step is not part of your workspace.');
 if(action[2])db.prepare('INSERT OR IGNORE INTO onboarding_state VALUES(?,?,?,?)').run(user.id,studio.id,action[1],now());
 else db.prepare('DELETE FROM onboarding_state WHERE user_id=? AND studio_id=? AND key=?').run(user.id,studio.id,action[1]);
 reply(200,onboardingState(db,args));return true;
}
