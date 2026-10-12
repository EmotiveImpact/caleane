import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// The proposal screen as the studio and as the client, with a fake mutate in place of the server.
const dom=setupDom();
const opened=[];globalThis.fetch=async(url,init)=>{opened.push({url,body:JSON.parse(init?.body||'{}')});return {ok:true,json:async()=>({})};};
const {module:ui,remove}=await bundle("export {Proposals} from './src/components/Proposals.jsx';",'proposals-ui');
const {render,screen,cleanup}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>{cleanup();opened.length=0;});
after(async()=>{await remove();dom.window.close();});

const inDays=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const estimate={id:'e1',title:'Wedding styling',currency:'GBP',total:540000,taxRate:20,version:1,items:[{title:'Floral design',quantity:1},{title:'Styling team',quantity:2}]};
const proposal=(extra={})=>({id:'q1',version:1,title:'Wedding styling proposal',scope:'Ceremony and reception flowers.',exclusions:'',delivery:'Install on the morning.',status:'Awaiting response',briefRevision:2,expiresOn:inDays(14),estimate,...extra});
const project=(extra={})=>({id:'p1',studioId:'s1',title:'Amelia and Tom',briefRevision:2,accessRole:'Approver',estimates:[estimate],proposals:[proposal()],...extra});
function harness(props){const calls=[],navigated=[];const mutate=async(action,body)=>{calls.push({action,body});return {};};render(h(ui.Proposals,{owner:false,busy:false,mutate,onNavigate:tab=>navigated.push(tab),...props}));return {calls,navigated};}

test('the client must tick the review box before accepting, then the acceptance is sent',async()=>{
 const input=user(),{calls}=harness({p:project()});
 assert.ok(screen.getByText('Ceremony and reception flowers.'));
 assert.ok(screen.getByText('£5,400.00'));
 await input.click(screen.getByRole('button',{name:'Accept scope'}));
 assert.equal(screen.getByRole('alert').textContent,'Confirm that you have reviewed the scope first.');
 assert.equal(calls.length,0);
 await input.click(screen.getByRole('checkbox',{name:/I have reviewed this scope/}));
 await input.click(screen.getByRole('button',{name:'Accept scope'}));
 assert.deepEqual(calls,[{action:'proposal-response',body:{proposalId:'q1',decision:'accept',feedback:'',acknowledged:true}}]);
 assert.equal(screen.queryByRole('alert'),null);
 assert.deepEqual(opened.map(o=>o.body),[{kind:'proposal',itemId:'q1'}],'the client opening the proposal is recorded once');
});

test('the client can ask for changes with feedback',async()=>{
 const input=user(),{calls}=harness({p:project()});
 await input.type(screen.getByRole('textbox',{name:/Your feedback/}),'Could we add a welcome sign?');
 await input.click(screen.getByRole('button',{name:'Request changes'}));
 assert.equal(calls[0].body.decision,'changes');
 assert.equal(calls[0].body.feedback,'Could we add a welcome sign?');
});

test('an out-of-date or expired proposal cannot be answered',()=>{
 harness({p:project({briefRevision:3})});
 assert.ok(screen.getByText('The brief changed. The studio must share an updated proposal.'));
 assert.equal(screen.queryByRole('button',{name:'Accept scope'}),null);
 cleanup();
 harness({p:project({proposals:[proposal({expiresOn:'2020-01-01'})]})});
 assert.ok(screen.getByText('Expired'));
 assert.equal(screen.queryByRole('button',{name:'Accept scope'}),null);
});

test('a client who is not an approver sees the proposal without the answer form',()=>{
 harness({p:project({accessRole:'Collaborator'})});
 assert.ok(screen.getByText('Wedding styling proposal'));
 assert.equal(screen.queryByRole('button',{name:'Accept scope'}),null);
});

test('the studio can withdraw the latest proposal and is sent to billing once scope is accepted',async()=>{
 const input=user(),first=harness({p:project(),owner:true});
 assert.equal(screen.queryByRole('button',{name:'Accept scope'}),null);
 await input.click(screen.getByRole('button',{name:'Withdraw proposal'}));
 assert.deepEqual(first.calls,[{action:'proposal-withdraw',body:{proposalId:'q1'}}]);
 assert.equal(opened.length,0,'the studio viewing its own proposal is not recorded');
 cleanup();
 const second=harness({p:project({proposals:[proposal({status:'Scope accepted',decidedBy:'Amelia Taylor',decidedAt:'2026-10-01T10:00:00Z'})]}),owner:true});
 assert.ok(screen.getByText(/Scope accepted by Amelia Taylor/));
 await input.click(screen.getByRole('button',{name:'View billing'}));
 assert.deepEqual(second.navigated,['Billing']);
});

test('the studio is asked for an estimate before writing a first proposal',async()=>{
 const input=user(),{navigated}=harness({p:project({estimates:[],proposals:[]}),owner:true});
 assert.ok(screen.getByText('A shared understanding before work begins.'));
 await input.click(screen.getByRole('button',{name:'Create proposal'}));
 assert.ok(await screen.findByText('Create an estimate first so your proposal has a clear price.'));
 await input.click(screen.getByRole('button',{name:'Create estimate'}));
 assert.deepEqual(navigated,['Estimate']);
});

test('the proposed investment prices each line, shows tax and carries the estimate note',()=>{
 const priced={...estimate,subtotal:450000,tax:90000,note:'Includes delivery and collection in central London.',items:[{title:'Floral design',quantity:1,unitAmount:300000},{title:'Styling team',quantity:2,unitAmount:75000,unit:'day'}]};
 harness({p:project({estimates:[priced],proposals:[proposal({estimate:priced})]})});
 const rows=[...document.querySelectorAll('.estimate-table>div:not(.estimate-table-head)')].map(row=>[...row.children].map(cell=>cell.textContent));
 assert.deepEqual(rows,[['Floral design','1','£3,000.00','£3,000.00'],['Styling teamper day','2','£750.00','£1,500.00']]);
 const totals=Object.fromEntries([...document.querySelectorAll('.estimate-totals>div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent]));
 assert.deepEqual(totals,{Subtotal:'£4,500.00','VAT (20%)':'£900.00',Total:'£5,400.00'});
 assert.ok(screen.getByText('Includes delivery and collection in central London.'));
});
