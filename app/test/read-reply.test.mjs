import test from 'node:test';
import assert from 'node:assert/strict';
import {readReply} from '../src/lib/read-reply.js';

test('public screens show a plain sentence when the server sends a page instead of data',async()=>{
 await assert.rejects(readReply(new Response('<!doctype html><h1>Bad gateway</h1>',{status:502})),{message:'Caleane could not reach the server. Please try again.',status:502});
 await assert.rejects(readReply(new Response('',{status:413})),{message:'That file is too large to upload.'});
 assert.deepEqual(await readReply(new Response(JSON.stringify({error:'This time was just taken.'}),{status:409})),{error:'This time was just taken.'});
});
