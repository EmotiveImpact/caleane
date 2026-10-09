import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import {createWorkspace} from '../server.mjs';
import {schemaVersion,MIGRATIONS} from '../migrations.mjs';

// fixtures/release-23.sqlite.gz is the sample workspace exactly as the app wrote it at release #23
// (commit 6835d02). An existing studio's database must upgrade to today's schema without losing records.
const tables=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t=>[t.name,db.prepare(`PRAGMA table_info("${t.name}")`).all().map(c=>c.name).sort().join(',')]));
const count=(db,table)=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('a database from an earlier release upgrades to the same schema as a new one and keeps its records',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caleane-upgrade-')),old=path.join(dir,'old.sqlite');
 await writeFile(old,gunzipSync(await readFile(new URL('./fixtures/release-23.sqlite.gz',import.meta.url))));
 const {DatabaseSync}=await import('node:sqlite'),before=new DatabaseSync(old,{readOnly:true});
 const kept=['users','studios','memberships','projects','clients','crm_opportunities'].map(t=>[t,count(before,t)]);before.close();
 let upgraded,fresh;
 try{
  upgraded=(await createWorkspace({dbFile:old,demo:true})).db;
  fresh=(await createWorkspace({dbFile:path.join(dir,'fresh.sqlite'),demo:true})).db;
  assert.deepEqual(tables(upgraded),tables(fresh));
  assert.equal(schemaVersion(upgraded),MIGRATIONS.length);
  for(const [table,n] of kept)assert.equal(count(upgraded,table),n,`${table} keeps its rows`);
  const project=JSON.parse(upgraded.prepare('SELECT data FROM projects LIMIT 1').get().data);
  assert.ok(project.title&&project.brief,'project records still read');
 }finally{upgraded?.close?.();fresh?.close?.();await rm(dir,{recursive:true,force:true});}
});
