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
  const row=db.prepare("SELECT data FROM projects WHERE json_array_length(data,'$.messages')>0").get(),p=JSON.parse(row.data),c=db.prepare('SELECT id FROM conversations WHERE project_id=?').get(p.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id=?').get(c.id).n,p.messages.length);
  db.prepare('DELETE FROM conversation_messages WHERE id=?').run(p.messages[0].id);
  saveProject(db,p);db.close();db=openStore(file);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id=?').get(c.id).n,p.messages.length-1,'saves and restarts leave materialised messages alone');
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
