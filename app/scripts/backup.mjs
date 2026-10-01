#!/usr/bin/env node
import {encryptedBackup,restoreEncryptedBackup} from '../encrypted-backup.mjs';
const [operation,source,destination]=process.argv.slice(2);
if(!['backup','restore'].includes(operation)||!source||!destination){console.error('Usage: node --experimental-sqlite scripts/backup.mjs backup|restore SOURCE NEW_DESTINATION');process.exitCode=2;}
else try{const options={key:process.env.CALEANE_BACKUP_KEY,...(operation==='backup'&&process.env.CALEANE_BACKUP_RECEIPT?{receiptPath:process.env.CALEANE_BACKUP_RECEIPT}:{})};await(operation==='backup'?encryptedBackup(source,destination,options):restoreEncryptedBackup(source,destination,options));console.log(`${operation} completed and integrity verified.`);}catch(error){console.error(`${operation} failed: ${error.message}`);process.exitCode=1;}
