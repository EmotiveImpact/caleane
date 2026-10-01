import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {installDocuments,listDocuments,changeDocument,downloadDocument,syncProjectArchives} from '../documents.mjs';
import {invoiceDocumentHtml} from '../src/lib/document-format.js';
test('letters remain private until issued, freeze PDF snapshots and enforce tenant access',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-documents-'));const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin:'http://localhost:4320',demo:true});
 try{installDocuments(db);const owner=db.prepare("SELECT id FROM users WHERE email='studio@example.test'").get(),client=db.prepare("SELECT id FROM users WHERE email='amelia@example.test'").get(),p=JSON.parse(db.prepare('SELECT data FROM projects WHERE data LIKE ?').get('%amelia@example.test%').data);const args={studioId:p.studioId,projectId:p.id,userId:owner.id},clientArgs={...args,userId:client.id};
 let result=await changeDocument(db,args,{action:'save',title:'Project confirmation',html:'<h2>Next steps</h2><p><strong>Review the layout</strong></p><script>bad()</script>'});let letter=result.documents.find(x=>x.kind==='Letter');assert.equal(letter.status,'Draft');assert.doesNotMatch(letter.html,/script|bad/);assert.equal((await listDocuments(db,clientArgs)).documents.some(x=>x.id===letter.id),false);
 await assert.rejects(changeDocument(db,clientArgs,{action:'save',title:'No',html:'<p>No</p>'}),e=>e.status===403);
 await assert.rejects(changeDocument(db,args,{id:letter.id,revision:99,action:'save',title:'Stale',html:'<p>Stale</p>'}),e=>e.status===409);
 result=await changeDocument(db,args,{id:letter.id,revision:letter.revision,action:'issue'});letter=result.documents.find(x=>x.id===letter.id);assert.equal(letter.status,'Issued');assert.ok(letter.hasPdf);const pdf=downloadDocument(db,clientArgs,letter.id);assert.equal(Buffer.from(pdf.content).subarray(0,5).toString(),'%PDF-');assert.ok(pdf.content.length>500);
 await assert.rejects(changeDocument(db,args,{id:letter.id,revision:letter.revision,action:'save',title:'Tampered',html:'<p>changed</p>'}),e=>e.status===409);assert.throws(()=>downloadDocument(db,{...args,studioId:'other'},letter.id),e=>e.status===404);
 const proposal={id:'sample-proposal',title:'Versioned scope',version:1,scope:'Original',delivery:'Friday',exclusions:'',createdAt:new Date().toISOString(),expiresOn:'2099-12-31',estimate:{items:[{quantity:1,title:'Design'}],currency:'GBP',total:10000,taxRate:0}};p.proposals=[proposal];db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),p.id);await syncProjectArchives(db,args);const archived=(await listDocuments(db,args)).documents.find(x=>x.kind==='Proposal');assert.ok(archived.hasPdf);p.proposals[0].status='Scope accepted';db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(p),p.id);await syncProjectArchives(db,args);assert.equal((await listDocuments(db,args)).documents.find(x=>x.id===archived.id).digest,archived.digest);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM project_documents WHERE source_key='proposal:sample-proposal'").get().n,1);
 }finally{server.close();db.close();await rm(dir,{recursive:true,force:true});}
});
test('invoice pages use escaped issued snapshot values and stable invoice totals',()=>{const html=invoiceDocumentHtml({number:'INV-1',kind:'Full',currency:'GBP',amountMinor:12000,netMinor:10000,taxMinor:2000,taxRate:20,dueDate:'2026-10-20',issuedAt:'2026-10-01',estimateVersion:2,snapshot:{sellerName:'<script>bad</script>',billToName:'Client',projectTitle:'Project'},paymentInstructions:'Bank transfer'});assert.match(html,/£120.00/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/current payment and cancellation status/);});
