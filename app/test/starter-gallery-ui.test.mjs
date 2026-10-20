import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {StarterGallery} from './src/components/StarterGallery.jsx';\nexport {starterKit} from './src/lib/starter-gallery.js';",'starter-gallery-ui');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

test('starters the studio already has show a disabled Added, and Add all counts only the rest',async()=>{
 const studio={id:'studio-test',name:'Test studio',branding:{profession:'events'}};
 const kit=ui.starterKit('events');
 const first=kit.messages[0].name,price=kit.prices[1].name;
 const request=async path=>{
  if(path.startsWith('/api/message-templates'))return {templates:[{id:'t1',name:`  ${first.toUpperCase().replace(/ /g,'  ')} `}]};
  if(path.startsWith('/api/catalogue'))return {items:[{id:'i1',name:price.toLowerCase()},{id:'i2',name:kit.prices[0].name,archived:true}]};
  return {forms:[]};
 };
 render(h(ui.StarterGallery,{studio,request}));
 const messages=await screen.findByRole('article',{name:'Messages'});
 const added=await within(messages).findByRole('button',{name:'Added'});
 assert.equal(added.disabled,true);
 assert.ok(within(messages).getByRole('button',{name:`Add all ${kit.messages.length-1}`}));
 const prices=screen.getByRole('article',{name:'Price list'});
 assert.equal(within(prices).getAllByRole('button',{name:'Added'}).length,1,'an archived price is offered again');
 assert.ok(within(prices).getByRole('button',{name:`Add all ${kit.prices.length-1}`}));
});

test('starter prices show and save in the studio billing currency',async()=>{
 const studio={id:'studio-test',name:'Test studio',branding:{profession:'events'}};
 const kit=ui.starterKit('events'),posted=[];
 const request=async(path,method,body)=>{
  if(method==='POST'){posted.push(body);return {items:[]};}
  if(path.startsWith('/api/message-templates'))return {templates:[]};
  if(path.startsWith('/api/catalogue'))return {items:[]};
  if(path.startsWith('/api/billing-defaults'))return {defaults:{currency:'EUR'}};
  return {forms:[]};
 };
 render(h(ui.StarterGallery,{studio,request}));
 const prices=await screen.findByRole('article',{name:'Price list'});
 await within(prices).findAllByText(/€/);
 assert.equal(within(prices).queryAllByText(/£/).length,0,'no pound prices for a euro studio');
 within(prices).getAllByRole('button',{name:'Add'})[0].click();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(posted[0].item.name,kit.prices[0].name);assert.equal(posted[0].item.currency,'EUR');
});
