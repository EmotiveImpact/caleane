import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// Read-only documents on a phone open as readable text, with the A4 pages one tap away.
const dom=setupDom();
globalThis.DOMParser=dom.window.DOMParser;
let narrow=true;globalThis.matchMedia=dom.window.matchMedia=query=>({matches:query==='(max-width: 720px)'&&narrow,addEventListener(){},removeEventListener(){}});
const {module:ui,remove}=await bundle("export {default as PagedDocument,readableHtml} from './src/components/PagedDocument.jsx';",'document-reflow-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

test('only the allowed document tags and styles survive the readable view',()=>{
 const html=ui.readableHtml('<h2 onclick="x()">Fees</h2><p style="text-align:center;position:fixed">Pay <strong>30%</strong><script>alert(1)</script><img src=x onerror="x()"><a href="javascript:x()">link</a></p><table><tr><td colspan="2" data-x="1">A</td></tr></table>');
 assert.equal(html,'<h2>Fees</h2><p style="text-align:center">Pay <strong>30%</strong>link</p><table><tbody><tr><td colspan="2">A</td></tr></tbody></table>');
});

test('a narrow screen shows the contract as text at body size, and can switch to A4 pages',async()=>{
 narrow=true;
 const {container}=render(h(ui.PagedDocument,{html:'<h3>1. Fees</h3><p>The total fee is £6,732.00.</p>',readOnly:true}));
 const article=container.querySelector('article.doc-reflow');
 assert.ok(article);assert.equal(article.textContent,'1. FeesThe total fee is £6,732.00.');
 assert.equal(screen.getByRole('button',{name:'Text'}).getAttribute('aria-pressed'),'true');
 assert.ok(screen.getByRole('button',{name:'A4 pages'}));
 assert.equal(screen.queryByRole('button',{name:'Fit page'}),null);
});

test('a wide screen keeps the A4 pages by default and editing never reflows',()=>{
 narrow=false;
 render(h(ui.PagedDocument,{html:'<p>Terms</p>',readOnly:true}));
 assert.equal(screen.getByRole('button',{name:'A4 pages'}).getAttribute('aria-pressed'),'true');
 cleanup();narrow=true;
 const {container}=render(h(ui.PagedDocument,{html:'<p>Terms</p>'}));
 assert.equal(container.querySelector('article.doc-reflow'),null);
 assert.equal(screen.queryByRole('button',{name:'Text'}),null);
});
