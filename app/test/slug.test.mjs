import test from 'node:test';
import assert from 'node:assert/strict';
import {slugFrom} from '../src/lib/slug.js';

test('names become web address parts that the sign-up and form address rules accept',()=>{
 assert.equal(slugFrom('Okafor Photo'),'okafor-photo');
 assert.equal(slugFrom('  Ãtelier Noël & Co. '),'atelier-noel-and-co');
 assert.equal(slugFrom('Wedding enquiry (2027)'),'wedding-enquiry-2027');
 assert.equal(slugFrom('!!!'),'');
 const long=slugFrom('a'.repeat(59)+' bc');assert.ok(long.length<=60);assert.match(long,/^[a-z0-9]+(-[a-z0-9]+)*$/);
});
