import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {autopayChip} from './src/components/PaymentPlan.jsx';",'plan-autopay-ui');
after(async()=>{await remove();dom.window.close();});

test('each plan row says what autopay will do with its invoice',()=>{
 const on={status:'active',charges:[{invoiceId:'i1',status:'paid'},{invoiceId:'i3',status:'failed'},{invoiceId:'i3',status:'processing'}]};
 assert.equal(ui.autopayChip(on,{id:'i1',status:'Paid',balanceMinor:0,dueDate:'2026-10-01'}).label,'Charged by card');
 assert.equal(ui.autopayChip(on,{id:'i2',status:'Issued',balanceMinor:5000,dueDate:'2099-11-04'}).label,'Card charged 4 Nov 2099');
 assert.equal(ui.autopayChip(on,{id:'i2',status:'Issued',balanceMinor:5000,dueDate:'2020-01-01'}).label,'Card charged today');
 assert.equal(ui.autopayChip(on,{id:'i3',status:'Issued',balanceMinor:5000,dueDate:'2026-10-01'}).label,'Card payment processing','the latest charge counts');
 assert.equal(ui.autopayChip(on,{id:'i4',status:'Paid',balanceMinor:0,dueDate:'2099-01-01'}),null,'paid another way');
 assert.equal(ui.autopayChip(on,{id:'i5',status:'Cancelled',balanceMinor:5000,dueDate:'2099-01-01'}),null);
 assert.equal(ui.autopayChip(on,null),null,'not issued yet');
 assert.equal(ui.autopayChip({status:'off',charges:[]},{id:'i2',status:'Issued',balanceMinor:5000,dueDate:'2099-11-04'}),null,'autopay off');
});
