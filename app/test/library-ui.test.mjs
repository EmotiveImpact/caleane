import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {Library} from './src/components/Operations.jsx';",'library-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const inspiration=Array.from({length:70},(_,i)=>({id:'r'+i,title:'Reference '+String(i).padStart(2,'0'),url:'https://example.test/'+i,note:i===5?'Hand-dyed silk runners':'',category:i===9?'Stationery':'',at:new Date(Date.UTC(2026,0,1+i)).toISOString()}));
const projects=[{id:'p1',title:'Harbour gala',inspiration}];
const titles=()=>screen.getAllByRole('heading',{level:3}).map(x=>x.textContent);

test('library sorts, searches notes and categories, and pages after sixty items',async()=>{
 const input=user();
 render(h(ui.Library,{projects,studio:{id:'s1'},openProject(){}}));
 assert.equal(titles().length,60);
 assert.equal(titles()[0],'Reference 69');
 assert.ok(screen.getByText('Showing 60 of 70 items'));
 await input.click(screen.getByRole('button',{name:'Show 10 more'}));
 assert.equal(titles().length,70);
 await input.selectOptions(screen.getByRole('combobox',{name:'Sort library'}),'title');
 assert.equal(titles()[0],'Reference 00');
 await input.selectOptions(screen.getByRole('combobox',{name:'Sort library'}),'oldest');
 assert.equal(titles()[0],'Reference 00');assert.equal(titles().length,60);
 const search=screen.getByRole('textbox',{name:'Search library'});
 await input.type(search,'silk');
 assert.deepEqual(titles(),['Reference 05']);
 await input.clear(search);await input.type(search,'stationery');
 assert.deepEqual(titles(),['Reference 09']);
});

test('library gathers design files, task files and letters alongside references',async()=>{
 const input=user();
 const project={id:'p2',title:'Garden party',inspiration:[{id:'r1',title:'Moodboard',url:'https://example.test/m',at:'2026-01-01'}],designs:[{id:'d1',version:2,status:'Awaiting approval',title:'Table plan',fileId:'f1',assets:[{fileId:'f1',name:'Table plan.pdf',mime:'application/pdf'},{fileId:'f2',name:'Detail.jpg',mime:'image/jpeg'}],at:'2026-02-01'}]};
 const request=async()=>({taskFiles:[{id:'t1',name:'Supplier quote.pdf',mime:'application/pdf',projectId:'p2',taskId:'k1',taskTitle:'Confirm the florist',at:'2026-03-01'},{id:'t2',name:'Gone.pdf',projectId:'missing',taskId:'k2',taskTitle:'Old'}],letters:[{id:'l1',projectId:'p2',title:'Welcome letter',status:'Issued',issuedAt:'2026-04-01'},{id:'l2',projectId:'p2',title:'Draft note',status:'Draft',createdAt:'2026-04-02'}]});
 render(h(ui.Library,{projects:[project],studio:{id:'s1'},openProject(){},request}));
 await screen.findAllByText('Supplier quote.pdf');
 assert.deepEqual(titles().sort(),['Detail.jpg','Draft note','Moodboard','Supplier quote.pdf','Table plan.pdf','Welcome letter']);
 await input.click(screen.getByRole('button',{name:/^Designs/}));assert.deepEqual(titles().sort(),['Detail.jpg','Table plan.pdf']);
 await input.click(screen.getByRole('button',{name:/^Letters/}));
 assert.equal(screen.getAllByRole('link',{name:'Open Welcome letter'})[0].getAttribute('href'),'/api/projects/p2/documents/l1/pdf?studio=s1');
 assert.equal(screen.queryAllByRole('link',{name:'Open Draft note'}).length,0,'a draft letter has no PDF yet');
 await input.click(screen.getByRole('button',{name:/^Task files/}));
 assert.match(screen.getByText(/Confirm the florist/).textContent,/From the task/);
});
