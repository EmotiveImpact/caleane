import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The public booking page a prospective client sees, with a fake server behind fetch.
const dom=setupDom('http://localhost/book/nay-decor');
const {module:ui,remove}=await bundle("export {PublicBooking,PublicBookingManage} from './src/components/PublicBooking.jsx';",'public-booking-ui');
const {render,screen,cleanup,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>{cleanup();history.replaceState(null,'','/book/nay-decor');});
after(async()=>{await remove();dom.window.close();});

const slots=['2027-03-02T10:00:00Z','2027-03-02T14:00:00Z','2027-03-03T09:00:00Z'];
const page=(extra={})=>({studio:{name:'NAY Décor',accent:'#2f4a3a'},booking:{title:'Discovery call',description:'Twenty minutes to talk through your plans.',durationMinutes:30,timezone:'Europe/London',location:{type:'video'},payment:null,...extra},slots});
const reply=(status,body)=>({ok:status<400,status,json:async()=>body});
function server(routes){const calls=[];globalThis.fetch=async(url,init={})=>{calls.push({url,method:init.method||'GET',headers:init.headers||{},body:init.body?JSON.parse(init.body):null});const next=routes(url,init.method||'GET',calls);return next;};return calls;}

async function chooseFirstTime(input){
 await screen.findByRole('heading',{name:'Choose a time'});
 await input.click(screen.getByRole('button',{name:/Wed 3 Mar/}));
 assert.deepEqual([...screen.getByRole('group',{name:/Available times on/}).querySelectorAll('button')].map(b=>b.textContent),['09:00']);
 await input.click(screen.getByRole('button',{name:/Tue 2 Mar/}));
 await input.click(screen.getByRole('button',{name:'10:00'}));
}

test('a visitor picks a day and time, fills in their details and is booked in',async()=>{
 const input=user(),calls=server((url,method)=>method==='POST'?reply(200,{reference:'BK-1042',start:slots[0],location:{detail:'https://meet.example.test/nay'}}):reply(200,page()));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 assert.ok(await screen.findByRole('heading',{name:'Discovery call'}));
 assert.ok(screen.getByText('30 minutes'));
 await chooseFirstTime(input);
 assert.ok(screen.getByRole('heading',{name:/Tuesday,? 2 March 2027, 10:00/}));
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Sophie Clarke');
 await input.type(screen.getByRole('textbox',{name:'Email'}),'sophie@example.test');
 await input.click(screen.getByRole('button',{name:'Confirm booking'}));
 assert.ok(await screen.findByRole('heading',{name:'You’re booked in.'}));
 assert.ok(screen.getByText('BOOKED · BK-1042'));
 assert.equal(screen.getByRole('link',{name:'https://meet.example.test/nay'}).getAttribute('href'),'https://meet.example.test/nay');
 const booking=calls.find(c=>c.method==='POST');
 assert.equal(booking.url,'/api/booking/nay-decor');
 assert.match(booking.headers['Idempotency-Key'],/^[a-f0-9]{32}$/);
 assert.equal(booking.body.start,slots[0]);
 assert.equal(booking.body.name,'Sophie Clarke');
 assert.equal(booking.body.website,'','the hidden spam field is sent empty');
});

test('a time taken by someone else sends the visitor back to the list with fresh times',async()=>{
 const input=user(),calls=server((url,method)=>method==='POST'?reply(409,{error:'That time has just been booked. Please choose another.'}):reply(200,page()));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 await chooseFirstTime(input);
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Sophie Clarke');
 await input.type(screen.getByRole('textbox',{name:'Email'}),'sophie@example.test');
 await input.click(screen.getByRole('button',{name:'Confirm booking'}));
 assert.equal((await screen.findByRole('alert')).textContent,'That time has just been booked. Please choose another.');
 assert.ok(screen.getByRole('heading',{name:'Choose a time'}));
 assert.equal(calls.filter(c=>c.method==='GET').length,2,'the times are loaded again');
});

test('a paid booking only ever leaves for Stripe’s own checkout page',async()=>{
 const input=user();
 server((url,method)=>method==='POST'?reply(200,{checkoutUrl:'https://checkout.evil.test/pay'}):reply(200,page({payment:{amountMinor:5000,currency:'GBP',label:'Deposit'}})));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 assert.ok(await screen.findByText('£50.00 deposit, paid by card when you book'));
 await chooseFirstTime(input);
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Sophie Clarke');
 await input.type(screen.getByRole('textbox',{name:'Email'}),'sophie@example.test');
 await input.click(screen.getByRole('button',{name:'Continue to payment · £50.00'}));
 assert.equal((await screen.findByRole('alert')).textContent,'Stripe did not return a secure payment page.');
 assert.equal(screen.getByRole('button',{name:'Continue to payment · £50.00'}).disabled,false);
});

test('closed bookings point the visitor to the enquiry form instead',async()=>{
 server(()=>reply(404,{error:'Bookings are closed.',studio:{name:'NAY Décor',slug:'nay-decor',accent:'#2f4a3a'}}));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 assert.ok(await screen.findByRole('heading',{name:'Bookings are closed for now.'}));
 assert.equal(screen.getByRole('link',{name:'Send an enquiry'}).getAttribute('href'),'/intake/nay-decor');
});

test('coming back from a cancelled payment releases the held time and says so',async()=>{
 history.replaceState(null,'','/book/nay-decor?booking=b1&payment=cancelled');
 const calls=server((url,method)=>method==='POST'?reply(200,{}):reply(200,page()));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 assert.ok(await screen.findByText('Payment was not completed, so the time has not been booked. You can choose a time again.'));
 const release=calls.find(c=>c.url==='/api/booking/nay-decor/release');
 assert.deepEqual(release.body,{bookingId:'b1'});
 await waitFor(()=>assert.equal(location.search,''));
});

test('the confirmation offers a calendar file and the private reschedule link',async()=>{
 const input=user(),token='t'.repeat(32);
 server((url,method)=>method==='POST'?reply(201,{reference:'BK-1042',bookingId:'b1',status:'Booked',title:'Discovery call',start:slots[0],end:'2027-03-02T10:30:00Z',manageToken:token,location:{type:'video',detail:'https://meet.example.test/nay'}}):reply(200,page()));
 render(h(ui.PublicBooking,{slug:'nay-decor'}));
 await chooseFirstTime(input);
 await input.type(screen.getByRole('textbox',{name:'Your name'}),'Sophie Clarke');
 await input.type(screen.getByRole('textbox',{name:'Email'}),'sophie@example.test');
 await input.click(screen.getByRole('button',{name:'Confirm booking'}));
 await screen.findByRole('heading',{name:'You’re booked in.'});
 assert.ok(screen.getByText(/^Shown in your time zone/));
 const calendar=screen.getByRole('link',{name:'Add to calendar'}),ics=decodeURIComponent(calendar.getAttribute('href').split(',')[1]);
 assert.equal(calendar.getAttribute('download'),'discovery-call.ics');
 assert.match(ics,/DTSTART:20270302T100000Z/);assert.match(ics,/SUMMARY:Discovery call with NAY Décor/);assert.match(ics,/LOCATION:https:\/\/meet\.example\.test\/nay/);
 assert.equal(screen.getByRole('link',{name:'Reschedule or cancel'}).getAttribute('href'),`/book/nay-decor/manage#${token}`);
});

test('the private link lets the client move the booking or cancel it after confirming',async()=>{
 const token='m'.repeat(32),booking=(extra={})=>({studio:{name:'NAY Décor',slug:'nay-decor',accent:'#2f4a3a'},booking:{reference:'BK-1042',bookingId:'b1',status:'Booked',title:'Discovery call',start:slots[0],end:'2027-03-02T10:30:00Z',durationMinutes:30,timezone:'Europe/London',canChange:true,location:{type:'video',detail:'https://meet.example.test/nay'},...extra},slots:slots.slice(1)});
 history.replaceState(null,'','/book/nay-decor/manage#'+token);
 const input=user(),calls=server((url,method,all)=>{const body=all.at(-1).body;return reply(200,body.action==='reschedule'?booking({start:body.start}):body.action==='cancel'?{...booking({status:'Cancelled',canChange:false}),slots:[]}:booking());});
 render(h(ui.PublicBookingManage,{slug:'nay-decor'}));
 assert.ok(await screen.findByRole('heading',{name:'Your booking'}));
 assert.deepEqual(calls[0],{url:'/api/booking/nay-decor/manage',method:'POST',headers:{'Content-Type':'application/json'},body:{token,action:'view'}});
 await input.click(screen.getByRole('button',{name:/Tue 2 Mar/}));
 await input.click(screen.getByRole('button',{name:'14:00'}));
 await input.click(screen.getByRole('button',{name:'Move my booking to Tue 2 Mar, 14:00'}));
 assert.ok(await screen.findByText(/^Moved to Tuesday,? 2 March 2027 at 14:00\.$/));
 assert.deepEqual(calls.at(-1).body,{token,action:'reschedule',start:slots[1]});
 await input.click(screen.getByRole('button',{name:'Cancel this booking'}));
 assert.equal(calls.length,2,'nothing is cancelled until the client confirms');
 await input.click(screen.getByRole('button',{name:'Cancel booking'}));
 assert.ok(await screen.findByRole('heading',{name:'This booking is cancelled.'}));
 assert.deepEqual(calls.at(-1).body,{token,action:'cancel'});
 assert.equal(screen.getByRole('link',{name:'Book another time'}).getAttribute('href'),'/book/nay-decor');
});
