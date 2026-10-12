import test from 'node:test';
import assert from 'node:assert/strict';
import {caleaneEnv} from '../env-names.mjs';

test('settings use the Caleane names and still read the earlier Calenne names',()=>{
 assert.equal(caleaneEnv('NOTIFICATION_KEY',{CALEANE_NOTIFICATION_KEY:'new'}),'new');
 assert.equal(caleaneEnv('NOTIFICATION_KEY',{CALENNE_NOTIFICATION_KEY:'old'}),'old','a server set up before the rename keeps working');
 assert.equal(caleaneEnv('NOTIFICATION_KEY',{CALEANE_NOTIFICATION_KEY:'new',CALENNE_NOTIFICATION_KEY:'old'}),'new','the new name wins');
 assert.equal(caleaneEnv('STRIPE_COLLECTION_ENABLED',{}),'');
});
