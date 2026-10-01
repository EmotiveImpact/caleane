import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,mkdtemp,open,link,rm,stat,rename} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createBackup,restoreBackup} from './data-safety.mjs';
const MAGIC=Buffer.from('CALEANE-BACKUP-1\n');
const HEADER_SIZE=MAGIC.length+12;
function keyBytes(key){const bytes=Buffer.isBuffer(key)?key:typeof key==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(key)?Buffer.from(key,'base64'):null;if(!bytes||bytes.length!==32)throw new Error('Provide a 32-byte backup encryption key in CALEANE_BACKUP_KEY (base64).');return bytes;}
async function newDestination(file){try{await stat(file);throw new Error('Destination already exists. Choose a new path.');}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(path.dirname(file),{recursive:true,mode:0o700});}
async function publish(temp,destination){await link(temp,destination);await rm(temp);}
/** Produces a coherent SQLite snapshot before encrypting. Does not copy to an offsite provider. */
export async function encryptedBackup(source,destination,{key,receiptPath}={}){
 const secret=keyBytes(key);if(receiptPath&&(path.resolve(receiptPath)===path.resolve(destination)||path.resolve(receiptPath)===path.resolve(source)))throw new Error('Receipt must use a separate path.');await newDestination(destination);const temporary=destination+'.partial-'+randomUUID(),dir=await mkdtemp(path.join(path.dirname(destination),'.caleane-backup-'));
 try{const snapshot=path.join(dir,'snapshot.sqlite'),verified=await createBackup(source,snapshot),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv),header=Buffer.concat([MAGIC,iv]);cipher.setAAD(header);
 const handle=await open(temporary,'wx',0o600);await handle.writeFile(header);await handle.close();
 await pipeline(createReadStream(snapshot),cipher,createWriteStream(temporary,{flags:'a',mode:0o600}));const append=await open(temporary,'a');try{await append.writeFile(cipher.getAuthTag());await append.sync();}finally{await append.close();}
 // Authenticate and integrity-check the encrypted result before publishing it.
 await restoreEncryptedBackup(temporary,path.join(dir,'verified.sqlite'),{key:secret});await publish(temporary,destination);
 const receipt={format:'caleane-encrypted-backup-v1',completedAt:new Date().toISOString(),verified:true,encryptedBytes:(await stat(destination)).size};
 if(receiptPath){if(path.resolve(receiptPath)===path.resolve(destination)||path.resolve(receiptPath)===path.resolve(source))throw new Error('Receipt must use a separate path.');await mkdir(path.dirname(receiptPath),{recursive:true,mode:0o700});const tmp=receiptPath+'.partial-'+randomUUID();try{const out=await open(tmp,'wx',0o600);try{await out.writeFile(JSON.stringify(receipt)+'\n');await out.sync();}finally{await out.close();}await rename(tmp,receiptPath);}finally{await rm(tmp,{force:true});}}
 return {...receipt,projects:verified.projects};
 }finally{await rm(temporary,{force:true});await rm(dir,{recursive:true,force:true});}
}
/** Authentication and SQLite integrity must pass before publishing to a new path. Never overwrites a live database. */
export async function restoreEncryptedBackup(source,destination,{key}={}){
 const secret=keyBytes(key);await newDestination(destination);const input=await open(source,'r'),size=(await input.stat()).size;
 let header,tag;try{if(size<=HEADER_SIZE+16)throw new Error('Invalid encrypted backup.');header=Buffer.alloc(HEADER_SIZE);tag=Buffer.alloc(16);await input.read(header,0,HEADER_SIZE,0);await input.read(tag,0,16,size-16);}finally{await input.close();}
 if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Unsupported backup format.');
 const temporary=destination+'.decrypt-'+randomUUID();try{const decipher=createDecipheriv('aes-256-gcm',secret,header.subarray(MAGIC.length));decipher.setAAD(header);decipher.setAuthTag(tag);
 try{await pipeline(createReadStream(source,{start:HEADER_SIZE,end:size-17}),decipher,createWriteStream(temporary,{flags:'wx',mode:0o600}));}catch{throw new Error('Backup authentication failed. Check the key and archive integrity.');}
 return await restoreBackup(temporary,destination);
 }finally{await rm(temporary,{force:true});}
}
