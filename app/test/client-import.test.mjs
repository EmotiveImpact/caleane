import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {guessMapping,parseCsv,parseNumber,reviewImport,rowToClient} from '../src/lib/client-import.js';
import {importClients} from '../client-import.mjs';

const origin='http://127.0.0.1:4320';
async function workspace(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'client-import-'));
 const {server,db}=await createWorkspace({dbFile:path.join(dir,'test.sqlite'),origin,demo:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const client=()=>{let cookie='';return async function call(route,method='GET',body){const response=await fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json().catch(()=>null)};};};
 return {client,db,close:async()=>{server.close();db.close();await rm(dir,{recursive:true,force:true});}};
}

test('the CSV reader copes with exports from other tools',()=>{
 const csv='\uFEFFFirst Name;Last Name;Email Address;Company Name;Notes\r\nAmelia;Taylor;Amelia@Example.com;"Taylor; Co";"Line one\nline two"\r\n;;;;\r\nBen;;ben@example.com;;"Said ""hello"""\r\n';
 const {headers,rows,lines}=parseCsv(csv);
 assert.deepEqual(headers,['First Name','Last Name','Email Address','Company Name','Notes']);
 assert.deepEqual(rows[0],['Amelia','Taylor','Amelia@Example.com','Taylor; Co','Line one\nline two']);
 assert.equal(rows[1][4],'Said "hello"');
 // The blank row is dropped but row numbers still match the spreadsheet.
 assert.deepEqual(lines,[2,4]);
 assert.deepEqual(parseCsv('Name,Email\tTabbed\n').headers,['Name','Email\tTabbed']);
 assert.deepEqual(parseCsv('Email\tName\na@b.co\tA\n').rows,[['a@b.co','A']]);
 assert.deepEqual(parseCsv('Name,Name\nA,B\n').headers,['Name','Name (2)']);
});

test('columns are matched by name, and every row is checked the same way',()=>{
 const fields=[{id:'f1',label:'Referred by',type:'text'},{id:'f2',label:'Birthday',type:'date'},{id:'f3',label:'Preferred contact',type:'choice',options:['Email','Phone']}];
 const headers=['Client Name','E-mail','Mobile','Tags','Birthday','preferred contact','Referred By'];
 const mapping=guessMapping(headers,fields);
 assert.deepEqual(mapping,{name:'Client Name',email:'E-mail',phone:'Mobile',tags:'Tags','field:f1':'Referred By','field:f2':'Birthday','field:f3':'preferred contact'});
 const rows=[
  ['Amelia Taylor','amelia@example.com','07700','Wedding; 2026, wedding','31/03/1990','phone','Jo'],
  ['Ben','not-an-email','','','','',''],
  ['','cara@example.com','','','','',''],
  ['Dev','dev@example.com','','','next spring','Carrier pigeon',''],
  ['Amelia again','AMELIA@example.com','','','','',''],
  ['Already here','known@example.com','','','','',''],
 ];
 const reviewed=reviewImport(rows.map((r,i)=>rowToClient(headers,r,mapping,i+2)),{existingEmails:['Known@example.com'],customFields:fields});
 assert.deepEqual(reviewed.map(r=>r.problem),['','Email address doesn’t look right','No name','','Same email as row 2','Already one of your clients']);
 assert.deepEqual(reviewed[0].client.tags,['Wedding','2026']);
 assert.deepEqual(reviewed[0].client.fields,{f1:'Jo',f2:'1990-03-31',f3:'Phone'});
 assert.equal(reviewed[3].notes.length,2);
 assert.deepEqual(reviewed[3].client.fields,{});
 const split=guessMapping(['First name','Surname','Email'],[]);
 assert.equal(rowToClient(['First name','Surname','Email'],['Cara','Lee','c@x.co'],split,2).name,'Cara Lee');
});

test('a studio imports a client list, skipping rows it already has, and clients cannot',async()=>{
 const w=await workspace();
 try{
  const call=w.client();
  assert.equal((await call('/api/login','POST',{email:'studio@example.test',password:'StudioDemo2026!'})).status,200);
  const studio=(await call('/api/me')).data.studios[0].id,q='?studio='+studio;
  const {fields}=(await call('/api/custom-fields'+q,'PUT',{client:[{label:'Referred by',type:'text'}],project:[]})).data;
  const before=(await call('/api/clients'+q)).data.clients;
  const known=before[0].email;
  const rows=[
   {row:2,name:'Nadia Okafor',email:'Nadia@Example.com',company:'Okafor Interiors',phone:'07700 900456',tags:'Interiors, Referral',note:'Came from the spring fair.',fields:{[fields.client[0].id]:'Hannah'}},
   {row:3,name:'Known person',email:known},
   {row:5,name:'Twice',email:'nadia@example.com'},
   {row:6,name:'No email'},
  ];
  assert.equal((await call('/api/clients/import'+q,'POST',{rows,stage:'Nowhere'})).status,400);
  assert.equal((await call('/api/clients/import'+q,'POST',{rows:[],stage:'Active'})).status,400);
  assert.equal((await call('/api/clients/import'+q,'POST',{rows:Array.from({length:1001},(_,i)=>({name:'P'+i,email:`p${i}@example.com`})),stage:'Active'})).status,400);
  const result=await call('/api/clients/import'+q,'POST',{rows,stage:'Past client',tag:'HoneyBook',fileName:'contacts.csv'});
  assert.equal(result.status,201);
  assert.equal(result.data.clients.length,1);
  const [nadia]=result.data.clients;
  assert.equal(nadia.email,'nadia@example.com');
  assert.equal(nadia.stage,'Past client');
  assert.equal(nadia.source,'Imported from contacts.csv');
  assert.deepEqual(nadia.tags,['Interiors','Referral','HoneyBook']);
  assert.deepEqual(nadia.customFields,{[fields.client[0].id]:'Hannah'});
  assert.equal(nadia.notes[0].text,'Came from the spring fair.');
  assert.deepEqual(result.data.skipped.map(s=>[s.row,s.reason]),[[3,'Already one of your clients'],[5,'Same email as row 2'],[6,'No email address']]);
  // Imported clients are full records with a primary contact, just like ones added by hand.
  const contacts=(await call(`/api/clients/${nadia.id}/contacts${q}`)).data;
  assert.equal(contacts.contacts.find(c=>c.isPrimary)?.email,'nadia@example.com');
  assert.equal((await call('/api/clients'+q)).data.clients.length,before.length+1);
  // Importing the same file again adds nobody.
  const again=await call('/api/clients/import'+q,'POST',{rows,stage:'Active'});
  assert.equal(again.data.clients.length,0);

  const portal=w.client();
  assert.equal((await portal('/api/login','POST',{email:'amelia@example.test',password:'StudioDemo2026!'})).status,200);
  const clientStudio=(await portal('/api/me')).data.studios[0].id;
  assert.equal((await portal(`/api/clients/import?studio=${clientStudio}`,'POST',{rows,stage:'Active'})).status,403);
 }finally{await w.close();}
});

test('numbers read the same whether written 1,234.56 or 1.234,56',()=>{
 assert.deepEqual(['12,50','1.234,56','1,234.56','1,234','£1 200','-3','.5','12,5,0','abc'].map(parseNumber),[12.5,1234.56,1234.56,1234,1200,-3,0.5,undefined,undefined]);
});

test('the tag for everyone is kept even when a row already has twenty tags',async()=>{
 const w=await workspace();
 try{
  const studio=w.db.prepare('SELECT id FROM studios LIMIT 1').get().id;
  const tags=Array.from({length:20},(_,i)=>'T'+i).join(',');
  const {created}=importClients(w.db,{studioId:studio,rows:[{name:'Full Tags',email:'full@example.com',tags}],stage:'Active',tag:'HoneyBook'});
  const data=JSON.parse(w.db.prepare('SELECT data FROM clients WHERE id=?').get(created[0]).data);
  assert.equal(data.tags.length,20);
  assert.equal(data.tags.at(-1),'HoneyBook');
 }finally{await w.close();}
});
