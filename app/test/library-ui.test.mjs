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
