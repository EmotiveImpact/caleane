import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';
import {invoicePageHtml,invoiceLayouts,sampleInvoice} from '../src/lib/invoice-design.js';

// On a phone the invoice reflows to the screen's width, with the A4 page one tap away.
const dom=setupDom();
let narrow=true;globalThis.matchMedia=dom.window.matchMedia=query=>({matches:query==='(max-width: 720px)'&&narrow,addEventListener(){},removeEventListener(){}});
const {module:ui,remove}=await bundle("export {InvoicePreview} from './src/components/InvoiceDocument.jsx';",'invoice-reflow-ui');
const {render,screen,cleanup,fireEvent}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const html='<!doctype html><html><body><main class="page">Invoice</main></body></html>';

test('a phone opens the invoice fitted to the screen, and can switch to the A4 page',()=>{
 narrow=true;
 const {container}=render(h(ui.InvoicePreview,{html,title:'Invoice INV-1'}));
 assert.equal(screen.getByRole('button',{name:'Readable'}).getAttribute('aria-pressed'),'true');
 const box=container.querySelector('.invoice-preview'),frame=screen.getByTitle('Invoice INV-1');
 assert.ok(box.classList.contains('is-readable'));
 assert.equal(frame.style.transform,'');
 fireEvent.click(screen.getByRole('button',{name:'A4 page'}));
 assert.equal(screen.getByRole('button',{name:'A4 page'}).getAttribute('aria-pressed'),'true');
 assert.ok(!container.querySelector('.invoice-preview').classList.contains('is-readable'));
 assert.equal(frame.style.width,'794px');
});

test('a wide screen keeps the A4 page with no view switch',()=>{
 narrow=false;
 const {container}=render(h(ui.InvoicePreview,{html}));
 assert.equal(screen.queryByRole('button',{name:'Readable'}),null);
 assert.ok(!container.querySelector('.invoice-preview').classList.contains('is-readable'));
 assert.equal(screen.getByTitle('Invoice preview').style.width,'794px');
});

test('every invoice layout reflows on a narrow screen and stays A4 in print',()=>{
 const {invoice,estimate}=sampleInvoice({name:'Studio'});
 for(const [layout] of invoiceLayouts){
  const page=invoicePageHtml(invoice,{design:{layout},estimate});
  assert.match(page,/@media screen and \(max-width:793px\)\{\.page\{width:auto;min-height:0/,layout);
  assert.match(page,/@media screen and \(max-width:600px\)\{[^]*\.parties,\.notes\{grid-template-columns:minmax\(0,1fr\)/,layout);
  assert.match(page,/@media print\{\.page\{margin:0;min-height:296\.5mm\}/,layout);
  // Quantity and unit price fold under each line on a phone, so the hidden columns lose nothing.
  assert.match(page,/<small class="each">12 × £85\.00<\/small>/,layout);
 }
});
