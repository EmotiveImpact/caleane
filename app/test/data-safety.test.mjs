import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createBackup,restoreBackup} from '../data-safety.mjs';

test('a WAL database can be backed up, verified and restored only to a new path',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'calenne-backup-'));
 const source=path.join(dir,'live.sqlite'),backup=path.join(dir,'backup.sqlite'),restored=path.join(dir,'restored.sqlite');
 const db=new DatabaseSync(source);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE projects(id TEXT PRIMARY KEY,data TEXT NOT NULL);');
 db.prepare('INSERT INTO projects VALUES(?,?)').run('stable-id','{"title":"Preserved"}');
 try{
  assert.deepEqual(await createBackup(source,backup),{projects:1});
  assert.equal((await stat(backup)).mode&0o077,0);
  assert.deepEqual(await restoreBackup(backup,restored),{projects:1});
  const copy=new DatabaseSync(restored,{readOnly:true});
  assert.equal(copy.prepare('SELECT data FROM projects WHERE id=?').get('stable-id').data,'{"title":"Preserved"}');copy.close();
  await assert.rejects(createBackup(source,backup),/already exists/);
  await assert.rejects(restoreBackup(backup,restored),/already exists/);
  const invalid=path.join(dir,'invalid.sqlite');await writeFile(invalid,'not a database');
  await assert.rejects(restoreBackup(invalid,path.join(dir,'invalid-restore.sqlite')));
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
