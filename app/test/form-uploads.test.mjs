import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {cleanupUnattachedUploads} from '../uploads.mjs';

// A file question lets a visitor send inspiration with their enquiry; the files land on the new project.
test('file questions carry uploads into the project and nothing else accepts them',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-form-uploads-')),origin='http://127.0.0.1:4320',app=await createWorkspace({dbFile:path.join(dir,'db.sqlite'),origin,demo:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});});
 async function call(route,method='GET',body,{owner=true,headers={}}={}){const r=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(owner&&cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
 await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'});
 const q='?studio='+(await call('/api/me')).data.studios[0].id;
 const base64=bytes=>Buffer.from(bytes).toString('base64'),png=base64([137,80,78,71,13,10,26,10,...Array(40).fill(1)]);
 const definition={...(await call('/api/forms'+q)).data.forms[0].definition,name:'Moodboard enquiry',questions:[{id:'q-moodboard',label:'Share your inspiration',type:'file',required:true,options:[]}]};
 const form=(await call('/api/forms'+q,'POST',{slug:'moodboard',definition})).data.form;
 const upload=body=>call('/api/public/nay-decor/forms/moodboard/uploads','POST',body,{owner:false});
 assert.equal((await upload({name:'early.png',content:png})).status,404,'a draft form takes no files');
 assert.equal((await call('/api/forms/'+form.id+q,'POST',{action:'publish',revision:form.revision})).status,200);
 assert.equal((await call('/api/public/nay-decor/forms/enquiry/uploads','POST',{name:'x.png',content:png},{owner:false})).status,404,'a form without a file question takes no files');
 assert.equal((await upload({name:'notes.txt',content:base64(Buffer.from('just some plain text here'))})).status,400,'only images and PDFs');
 const sent=await upload({name:'table.png',content:png});assert.equal(sent.status,201);assert.equal(sent.data.upload.name,'table.png');
 const enquiry={formVersion:1,name:'File Sender',email:'file-sender@example.test',occasion:definition.projectTypes[0],vision:'Candles',consent:true,intakeAnswers:{'q-moodboard':[sent.data.upload.id]}};
 if(!definition.consentText)delete enquiry.consent;
 assert.equal((await call('/api/public/nay-decor/forms/moodboard/enquiries','POST',{...enquiry,intakeAnswers:{'q-moodboard':[]}},{owner:false,headers:{'Idempotency-Key':'no-file'}})).status,400,'a required file question needs a file');
 assert.equal((await call('/api/public/nay-decor/forms/moodboard/enquiries','POST',{...enquiry,intakeAnswers:{'q-moodboard':['not-an-upload']}},{owner:false,headers:{'Idempotency-Key':'bad-file'}})).status,400);
 const submitted=await call('/api/public/nay-decor/forms/moodboard/enquiries','POST',enquiry,{owner:false,headers:{'Idempotency-Key':'with-file'}});assert.equal(submitted.status,201,JSON.stringify(submitted.data));
 const project=(await call('/api/projects'+q)).data.projects.find(p=>p.brief.email==='file-sender@example.test');
 assert.deepEqual(project.brief.intakeAnswers[0].value,['table.png'],'the brief keeps the file name');
 const reference=project.inspiration.find(item=>item.title==='table.png');assert.ok(reference?.fileId,'the file is a project reference');
 assert.ok(app.db.prepare('SELECT 1 FROM files WHERE id=? AND project_id=?').get(reference.fileId,project.id));
 assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM enquiry_uploads').get().n,0,'the held upload is moved, not copied');
 assert.equal((await upload({name:'later.png',content:png})).status,201);
 assert.equal(cleanupUnattachedUploads(app.db,{clock:()=>Date.now()+2*86400000}),1,'unsent uploads are removed after a day');
});
