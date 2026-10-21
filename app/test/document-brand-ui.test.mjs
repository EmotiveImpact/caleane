import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The studio's brand kit reaches estimates, proposals, contracts and the client portal, not only invoices.
const dom=setupDom();
globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const {module:ui,remove}=await bundle(`export {DocumentBrandProvider,documentBrand,brandProps} from './src/components/DocumentBrand.jsx';
export {Proposals} from './src/components/Proposals.jsx';
export {agreementPrintHtml} from './src/components/AgreementDocument.jsx';
export {AdminSidebar} from './src/components/workspace/AdminSidebar.jsx';
export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';
export {normaliseBrandKit} from './src/lib/brand-kit.js';`,'document-brand-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const logo='0b5c4a8e-6d0e-4d8a-9b1f-3c2e1a0f9d77',light='1b5c4a8e-6d0e-4d8a-9b1f-3c2e1a0f9d77';
const kit=ui.normaliseBrandKit({logos:{primary:logo},colours:{primary:'#7a3b2e'},fonts:{heading:{type:'preset',preset:'playfair-display'},body:{type:'preset',preset:'inter'}}});
const studio={id:'s1',name:'NAY DÉCOR',accent:'#181925',role:'client',brandKit:kit};
const estimate={id:'e1',title:'Wedding styling',currency:'GBP',subtotal:450000,tax:90000,total:540000,taxRate:20,version:1,items:[{title:'Floral design',quantity:1,unitAmount:450000}]};
const p={id:'p1',studioId:'s1',title:'Amelia and Tom',briefRevision:2,accessRole:'Approver',estimates:[estimate],proposals:[{id:'q1',version:1,title:'Wedding styling proposal',scope:'Ceremony flowers.',status:'Awaiting response',briefRevision:2,expiresOn:'2099-01-01',estimate}]};

test('only the parts of the kit a studio has set change a document',()=>{
 const plain=ui.documentBrand({...studio,brandKit:ui.normaliseBrandKit({})});
 assert.deepEqual([plain.logo,plain.fonts,plain.colour,plain.ink,plain.paper],['',false,false,'','']);
 assert.equal(ui.brandProps(plain).className,'doc-branded');
 const full=ui.documentBrand(studio);
 assert.deepEqual([full.logo,full.fonts,full.colour],[`/api/brand-assets/${logo}`,true,true]);
 assert.equal(ui.brandProps(full).className,'doc-branded doc-brand-fonts doc-brand-colour');
 assert.equal(ui.documentBrand({...studio,brandKit:ui.normaliseBrandKit({colours:{primary:'#f6e7e1'}})}).colour,false,'a pale colour never colours headings');
 assert.equal(ui.documentBrand({name:'No kit'}),null);
});

test('a proposal opens with the studio logo and wears its fonts and colour',()=>{
 const {container}=render(h(ui.DocumentBrandProvider,{studio},h(ui.Proposals,{p,owner:false,busy:false,mutate:async()=>({}),onNavigate(){}})));
 const article=container.querySelector('article.estimate-document');
 assert.match(article.className,/doc-branded doc-brand-fonts doc-brand-colour/);
 assert.equal(article.style.getPropertyValue('--brand-primary'),'#7a3b2e');
 assert.equal(screen.getByAltText('NAY DÉCOR').getAttribute('src'),`/api/brand-assets/${logo}`);
 assert.equal([...container.querySelectorAll('style')].some(style=>style.textContent.includes('Instrument Sans')),false,'only the chosen fonts are loaded');
 assert.match(container.querySelector('link[rel=stylesheet]').getAttribute('href'),/Playfair\+Display/);
});

test('without a logo the studio name heads the document, and nothing is branded with no studio',()=>{
 render(h(ui.DocumentBrandProvider,{studio:{...studio,brandKit:ui.normaliseBrandKit({})}},h(ui.Proposals,{p,owner:false,busy:false,mutate:async()=>({}),onNavigate(){}})));
 assert.equal(document.querySelector('.doc-brand-masthead').textContent,'NAY DÉCOR');
 cleanup();
 render(h(ui.Proposals,{p,owner:false,busy:false,mutate:async()=>({}),onNavigate(){}}));
 assert.equal(document.querySelector('.doc-brand-masthead'),null);
 assert.equal(document.querySelector('article.estimate-document').className,'estimate-document');
});

test('the printed contract carries the letterhead and the brand fonts',()=>{
 const brand=ui.documentBrand(studio);
 const html=ui.agreementPrintHtml({title:'Floral agreement',version:2,status:'Issued',termsHtml:'<h2>Fees</h2><p>£1,000</p>'},brand);
 assert.match(html,new RegExp(`<header class="letterhead"><img src="/api/brand-assets/${logo}" alt="NAY DÉCOR"></header>`));
 assert.match(html,/h1,h2,h3\{color:#7a3b2e\}/);
 assert.match(html,/body\{font-family:'Inter',Arial,sans-serif\}/);
 assert.doesNotMatch(ui.agreementPrintHtml({title:'Plain',version:1,status:'Issued',termsHtml:'<p>x</p>'}),/letterhead/);
});

test('the client portal shows the studio logo instead of Caleane',()=>{
 const session={user:{id:'u1',name:'Amelia Taylor'},studios:[studio]};
 const props={studio,session,owner:false,view:'overview',navigate(){},signOut(){},studioId:'s1',onStudioChange(){}};
 render(h(ui.WorkspaceUIProvider,null,h(ui.AdminSidebar,{...props,brand:ui.documentBrand({...studio,brandKit:{...kit,logos:{...kit.logos,light}}})})));
 const home=screen.getByRole('link',{name:'NAY DÉCOR home'});
 assert.equal(home.querySelector('img.folio-studio-logo').getAttribute('src'),`/api/brand-assets/${light}`);
 assert.equal(home.querySelector('.is-inverted'),null,'the light logo needs no change');
 cleanup();
 render(h(ui.WorkspaceUIProvider,null,h(ui.AdminSidebar,{...props,brand:ui.documentBrand(studio)})));
 assert.ok(screen.getByRole('link',{name:'NAY DÉCOR home'}).querySelector('img.folio-studio-logo.is-inverted'),'the main logo turns white on the dark rail');
 cleanup();
 render(h(ui.WorkspaceUIProvider,null,h(ui.AdminSidebar,{...props,owner:true,brand:null})));
 assert.ok(screen.getByRole('link',{name:'Caleane home'}),'the studio itself still sees Caleane');
});
