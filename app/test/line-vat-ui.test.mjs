import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// A VAT-registered studio sets a line's own rate on estimates and the price list, and documents show VAT at each rate.
const dom=setupDom();
const catalogue=[{id:'c1',name:'Printed menus',unitAmount:300,currency:'GBP',unit:'item',taxRate:0},{id:'c2',name:'Venue hire',unitAmount:13500,currency:'GBP',unit:'each',exempt:true}];
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('billing-defaults')?{defaults:{currency:'GBP',vatRegistered:true,taxRate:20}}:{items:catalogue}});
const {module:ui,remove}=await bundle(`export {Estimates} from './src/components/Estimates.jsx';
export {Proposals} from './src/components/Proposals.jsx';
export {PriceListSettings} from './src/components/StudioCommerceSettings.jsx';
export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';`,'line-vat-ui');
const {render,screen,cleanup,waitFor,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const items=[{title:'Styling',quantity:1,unitAmount:19500},{title:'Printed menus',quantity:100,unitAmount:300,taxRate:0},{title:'Venue hire',quantity:1,unitAmount:13500,exempt:true}];
const estimate={id:'e1',version:1,title:'Wedding styling',status:'Awaiting review',briefRevision:1,currency:'GBP',taxRate:20,vatRegistered:true,subtotal:63000,tax:3900,total:66900,items,at:'2026-10-01T10:00:00Z'};
const studio={id:'s1',name:'NAY DÉCOR'};

test('an estimate line can be zero-rated, and a price list item brings its own rate',async()=>{
 const input=user(),sent=[];
 render(h(ui.Estimates,{p:{id:'p1',briefRevision:1,brief:{name:'Amelia'},estimates:[]},studio,owner:true,busy:false,mutate:async(action,body)=>{sent.push(body);return {};}}));
 await input.click(screen.getByRole('button',{name:'Create estimate'}));
 await input.type(screen.getByLabelText('Item 1'),'Styling');
 await input.type(screen.getByLabelText(/Unit price/),'195');
 await waitFor(()=>assert.equal(screen.getAllByLabelText('VAT').length,1));
 await input.selectOptions(await screen.findByRole('combobox',{name:/Add from your price list/}),'c1');
 await input.selectOptions(screen.getByRole('combobox',{name:/Add from your price list/}),'c2');
 assert.deepEqual(screen.getAllByLabelText('VAT').map(select=>select.value),['','0','exempt']);
 await input.selectOptions(screen.getAllByLabelText('VAT')[0],'5');
 await input.click(screen.getByRole('button',{name:'Share estimate for review'}));
 await waitFor(()=>assert.equal(sent.length,1));
 assert.deepEqual(sent[0].items.map(item=>[item.title,item.taxRate,item.exempt]),[['Styling',5,undefined],['Printed menus',0,undefined],['Venue hire',undefined,true]]);
});

test('an estimate at more than one rate shows each line’s rate and VAT at each rate',()=>{
 const {container}=render(h(ui.Estimates,{p:{id:'p1',briefRevision:1,brief:{name:'Amelia',occasion:'Wedding'},estimates:[estimate]},studio,owner:false,busy:false,mutate:async()=>({})}));
 const document=container.querySelector('.estimate-document');
 assert.ok(within(document).getByText('Zero-rated',{selector:'small'}));
 assert.ok(within(document).getByText('Exempt',{selector:'small'}));
 assert.deepEqual([...document.querySelectorAll('.estimate-totals dt')].map(item=>item.textContent),['Subtotal','VAT at 20% on £195.00','Zero-rated on £300.00','Exempt on £135.00','Estimated total']);
});

test('a proposal’s investment shows VAT at each rate',()=>{
 const p={id:'p1',studioId:'s1',title:'Wedding',briefRevision:1,accessRole:'Approver',estimates:[estimate],proposals:[{id:'q1',version:1,title:'Proposal',scope:'Flowers.',status:'Awaiting response',briefRevision:1,expiresOn:'2099-01-01',estimate}]};
 const {container}=render(h(ui.Proposals,{p,owner:false,busy:false,mutate:async()=>({}),onNavigate(){}}));
 const totals=[...container.querySelectorAll('.estimate-totals dt')].map(item=>item.textContent);
 assert.deepEqual(totals,['Subtotal','VAT at 20% on £195.00','Zero-rated on £300.00','Exempt on £135.00','Total']);
});

test('the price list shows an item’s own rate and keeps it when the item is saved',async()=>{
 const input=user(),posts=[];
 const request=async(url,method,body)=>{if(method==='POST'){posts.push(body);return {items:catalogue};}return {items:catalogue};};
 render(h(ui.WorkspaceUIProvider,null,h(ui.PriceListSettings,{studio,request})));
 assert.ok(await screen.findByText('Zero-rated',{selector:'small'}));assert.ok(screen.getByText('Exempt',{selector:'small'}));
 await input.click(screen.getAllByRole('button',{name:'Edit'})[0]);
 await input.click(screen.getByRole('button',{name:'Save item'}));
 await waitFor(()=>assert.equal(posts.length,1));
 assert.equal(posts[0].item.taxRate,0);assert.equal('vat' in posts[0].item,false);
});
