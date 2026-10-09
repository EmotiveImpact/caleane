import test from 'node:test';
import assert from 'node:assert/strict';
import {clientProjectTitle,fillTemplate} from '../src/lib/message-templates.js';

test('project titles drop the client name when written to that client',()=>{
 assert.equal(clientProjectTitle('Private celebration · Sophie Clarke','Sophie Clarke'),'Private celebration');
 assert.equal(clientProjectTitle('Sophie’s wedding','Sophie Clarke'),'Sophie’s wedding');
 assert.equal(clientProjectTitle('Launch · Studio North','Sophie Clarke'),'Launch · Studio North','another name stays');
 assert.equal(clientProjectTitle('Spring launch',''),'Spring launch');
});

test('templates leave out the booking link when booking is off, keeping the rest of the paragraph',()=>{
 const values={client_first_name:'Sophie',project_title:'Private celebration',booking_link:''};
 assert.equal(fillTemplate('Hi {client_first_name},\n\nThank you for getting in touch about {project_title}.\n\nIf it helps to talk it through, you can book a short call here: {booking_link}\n\nStudio',values),'Hi Sophie,\n\nThank you for getting in touch about Private celebration.\n\nStudio');
 assert.equal(fillTemplate('Have a look when you can. We can talk it through on a call if that is easier: {booking_link}\n\nStudio',values),'Have a look when you can.\n\nStudio');
 assert.equal(fillTemplate('Book here: {booking_link}',{booking_link:'https://caleane.com/book/x'}),'Book here: https://caleane.com/book/x');
});
