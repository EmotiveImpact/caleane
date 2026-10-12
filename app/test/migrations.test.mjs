import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {openStore,saveProject,passwordOK,passwordHash} from '../store.mjs';
import {runMigrations,schemaVersion,MIGRATIONS} from '../migrations.mjs';

test('migrations run once each, in order, and a failed step leaves the version unchanged',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-migrations-')),db=new DatabaseSync(path.join(dir,'m.sqlite'));
 try{
  db.exec('CREATE TABLE log(step TEXT)');const calls=[];
  const steps=[d=>{calls.push(1);d.exec("INSERT INTO log VALUES('one')");},d=>{calls.push(2);d.exec("INSERT INTO log VALUES('two')");}];
  assert.equal(runMigrations(db,steps),2);assert.equal(runMigrations(db,steps),2);assert.deepEqual(calls,[1,2]);
  const broken=[...steps,d=>{d.exec("INSERT INTO log VALUES('three')");throw new Error('stop');}];
  assert.throws(()=>runMigrations(db,broken),/stop/);assert.equal(schemaVersion(db),2);
  assert.deepEqual(db.prepare('SELECT step FROM log').all().map(r=>r.step),['one','two']);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('legacy design revisions are backfilled once at open, not on every start',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-design-backfill-')),file=path.join(dir,'test.sqlite');let db;
 try{
  ({db}=await createWorkspace({dbFile:file,demo:true}));
  assert.equal(schemaVersion(db),MIGRATIONS.length);
  const row=db.prepare("SELECT data FROM projects WHERE json_array_length(data,'$.designs')>0").get(),p=JSON.parse(row.data);
  delete p.designs[0].briefRevision;delete p.designs[0].briefSnapshot;saveProject(db,p);db.exec('PRAGMA user_version=0');db.close();
  db=openStore(file);let design=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data).designs[0];
  assert.equal(design.briefRevision,1);assert.equal(design.briefSnapshot.name,p.brief.name);
  delete p.designs[0].briefRevision;saveProject(db,p);db.close();
  db=openStore(file);design=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(p.id).data).designs[0];
  assert.equal(design.briefRevision,undefined,'the backfill does not repeat once recorded');
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('saving a project does not rewrite its conversation messages and files are indexed by project',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-save-project-')),file=path.join(dir,'test.sqlite');let db;
 try{
  ({db}=await createWorkspace({dbFile:file,demo:true}));
  const c=db.prepare('SELECT c.id,c.project_id FROM conversations c WHERE EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=c.id)').get(),p=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(c.project_id).data);
  assert.equal(p.messages,undefined,'the project record holds no copy of its messages');
  const messages=db.prepare('SELECT id,author_name AS by,role,text,created_at AS at FROM conversation_messages WHERE conversation_id=? ORDER BY seq').all(c.id);
  db.prepare('DELETE FROM conversation_messages WHERE id=?').run(messages[0].id);
  saveProject(db,{...p,messages});db.close();db=openStore(file);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id=?').get(c.id).n,messages.length-1,'saves and restarts leave materialised messages alone');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(c.project_id).data).messages,undefined,'a save never writes messages into the project record');
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='files_project'").get());
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('password checks fail closed for missing accounts while still hashing',()=>{
 const stored=passwordHash('a long enough password');
 assert.equal(passwordOK('a long enough password',stored),true);
 assert.equal(passwordOK('a different password',stored),false);
 assert.equal(passwordOK('a long enough password',undefined),false);
 assert.equal(passwordOK('a long enough password',''),false);
});

test('older databases limited to GBP, EUR and USD are widened once, keeping invoices, payments, costs and receipts',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-currency-widen-')),file=path.join(dir,'test.sqlite');let ws;
 const counts=db=>Object.fromEntries(['invoices','invoice_payments','expenses','expense_receipts'].map(table=>[table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
 try{
  ws=await createWorkspace({dbFile:file,demo:true,showcase:true,reminderIntervalMs:0});
  const expense=ws.db.prepare('SELECT id,studio_id FROM expenses LIMIT 1').get();
  ws.db.prepare('INSERT INTO expense_receipts VALUES(?,?,?,?,?,?)').run(expense.id,expense.studio_id,'receipt.pdf','application/pdf',Buffer.from('%PDF-'),new Date().toISOString());
  const before=counts(ws.db);assert.ok(before.invoices>0&&before.invoice_payments>0&&before.expenses>0);
  ws.db.close();
  // Put the tables back to how older releases created them.
  const old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=OFF');
  for(const table of ['invoices','expenses']){
   const sql=old.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table).sql,indexes=old.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table).map(row=>row.sql);
   old.exec(sql.replace('CHECK(length(currency)=3)',"CHECK(currency IN ('GBP','EUR','USD'))").replace(`CREATE TABLE ${table}`,`CREATE TABLE ${table}_old`));
   old.exec(`INSERT INTO ${table}_old SELECT * FROM ${table};DROP TABLE ${table};ALTER TABLE ${table}_old RENAME TO ${table};`);for(const index of indexes)old.exec(index);
  }
  assert.match(old.prepare("SELECT sql FROM sqlite_master WHERE name='invoices'").get().sql,/'GBP','EUR','USD'/);old.close();
  ws=await createWorkspace({dbFile:file,demo:true,showcase:true,reminderIntervalMs:0});
  for(const table of ['invoices','expenses'])assert.match(ws.db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table).sql,/CHECK\(length\(currency\)=3\)/);
  assert.deepEqual(counts(ws.db),before,'every row survives the rebuild, including receipts that cascade from costs');
  assert.deepEqual(ws.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(ws.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('invoices_tenant_key','invoices_studio_issued','invoices_project','expenses_studio_date','expenses_project')").get().n,5);
  assert.equal(ws.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  const invoice=ws.db.prepare('SELECT * FROM invoices LIMIT 1').get();
  ws.db.prepare('UPDATE invoices SET currency=? WHERE id=?').run('CHF',invoice.id);
  assert.equal(ws.db.prepare('SELECT currency FROM invoices WHERE id=?').get(invoice.id).currency,'CHF');
 }finally{ws?.db.close();await rm(dir,{recursive:true,force:true});}
});
