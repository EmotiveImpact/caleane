import {DatabaseSync} from 'node:sqlite';
import {copyFile,mkdir,link,rm,stat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function checkDatabase(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').get();
  if(Object.values(result)[0]!=='ok')throw new Error('Database integrity check failed.');
  const rows=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").all();
  if(!rows.length)throw new Error('This is not a Caleane database.');
  return {projects:db.prepare('SELECT COUNT(*) AS count FROM projects').get().count};
 }finally{db.close();}
}

async function requireNewDestination(destination){
 try{await stat(destination);throw new Error('Destination already exists. Choose a new path.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(path.dirname(destination),{recursive:true});
}

export async function createBackup(source,destination){
 await requireNewDestination(destination);
 const temporary=destination+'.partial-'+randomUUID();
 const db=new DatabaseSync(source,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').get();
  if(Object.values(result)[0]!=='ok')throw new Error('Source database integrity check failed.');
  db.prepare('VACUUM INTO ?').run(temporary);
 }finally{db.close();}
 try{
  await chmod(temporary,0o600);
  const verified=checkDatabase(temporary);
  await link(temporary,destination);
  await rm(temporary);
  return verified;
 }catch(error){await rm(temporary,{force:true});throw error;}
}

export async function restoreBackup(backup,destination){
 const verified=checkDatabase(backup);
 await requireNewDestination(destination);
 const temporary=destination+'.partial-'+randomUUID();
 try{
  await copyFile(backup,temporary);
  await chmod(temporary,0o600);
  checkDatabase(temporary);
  await link(temporary,destination);
  await rm(temporary);
  return verified;
 }catch(error){await rm(temporary,{force:true});throw error;}
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [operation,source,destination]=process.argv.slice(2);
 if(!['backup','restore'].includes(operation)||!source||!destination){
  console.error('Usage: node --experimental-sqlite data-safety.mjs backup|restore SOURCE DESTINATION');
  process.exitCode=2;
 }else{
  try{const result=operation==='backup'?await createBackup(source,destination):await restoreBackup(source,destination);console.log(`${operation} verified: ${result.projects} projects`);}
  catch(error){console.error(error.message);process.exitCode=1;}
 }
}
