import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The price list shortcut on estimates and quick invoices offers only the document's currency.
const dom=setupDom();
const items=[{id:'i1',name:'Floral installation',unitAmount:50000,currency:'GBP',unit:'each'},{id:'i2',name:'Styling hours',unitAmount:8000,currency:'EUR',unit:'hour'},{id:'i3',name:'Linen hire',unitAmount:1200,currency:'GBP',unit:'person'}];
globalThis.fetch=async()=>({ok:true,json:async()=>({items})});
const {module:ui,remove}=await bundle("export {PriceListPicker} from './src/components/Estimates.jsx';",'estimate-price-list');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

test('only items in the estimate currency are offered, each with how it is priced',async()=>{
 const picked=[];
 render(h(ui.PriceListPicker,{studio:{id:'s1'},currency:'GBP',onPick:item=>picked.push(item)}));
 const select=await screen.findByRole('combobox',{name:/Add from your price list/});
 assert.deepEqual([...select.options].map(option=>option.textContent),['Choose a service…','Floral installation · £500.00','Linen hire · £12.00 per person']);
 assert.ok(screen.getByText('1 item is priced in another currency and not shown.'));
 await userEvent.setup({document:dom.window.document}).selectOptions(select,'i3');
 assert.equal(picked[0].unit,'person');
});

test('a currency with nothing on the price list says so',async()=>{
 render(h(ui.PriceListPicker,{studio:{id:'s1'},currency:'USD',onPick(){}}));
 assert.ok(await screen.findByText('None of your price list is priced in USD.'));
});
