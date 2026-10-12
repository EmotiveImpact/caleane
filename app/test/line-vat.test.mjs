import test from 'node:test';
import assert from 'node:assert/strict';
import {LINE_VAT,cleanLineVat,lineVatChoice,shareVatGroups,splitsVat,taxRows,vatGroups,vatTotal,withLineVat} from '../src/lib/vat.js';

// A line can carry its own VAT rate, or be exempt, and tax is worked out once per rate.
const money=minor=>`£${(minor/100).toFixed(2)}`;
const lines=[{title:'Styling',quantity:1,unitAmount:19500},{title:'Menus',quantity:100,unitAmount:300,taxRate:0},{title:'Venue',quantity:1,unitAmount:13500,exempt:true},{title:'Fuel',quantity:3,unitAmount:1000,taxRate:5}];

test('lines are grouped by rate, with exempt lines last',()=>{
 const groups=vatGroups(lines,20);
 assert.deepEqual(groups,[{rate:20,exempt:false,netMinor:19500,taxMinor:3900},{rate:5,exempt:false,netMinor:3000,taxMinor:150},{rate:0,exempt:false,netMinor:30000,taxMinor:0},{rate:0,exempt:true,netMinor:13500,taxMinor:0}]);
 assert.equal(vatTotal(groups),4050);
 assert.ok(splitsVat(groups,20));
 assert.ok(!splitsVat(vatGroups([lines[0]],20),20),'one line at the usual rate is the usual single VAT line');
 assert.ok(splitsVat(vatGroups([lines[1]],20),20),'a document all zero-rated says so rather than VAT (20%)');
 assert.ok(!splitsVat(vatGroups([{quantity:1,unitAmount:100,taxRate:20}],20),20),'a line set to the usual rate joins the usual group');
});

test('an invoice share is split across the rates and adds up exactly',()=>{
 const parts=shareVatGroups(vatGroups(lines,20),{netMinor:18843,taxMinor:1157});
 assert.equal(parts.reduce((sum,part)=>sum+part.netMinor,0),18843);
 assert.equal(parts.reduce((sum,part)=>sum+part.taxMinor,0),1157);
 assert.deepEqual(parts.map(part=>part.taxMinor>0),[true,true,false,false],'zero-rated and exempt parts carry no tax');
});

test('tax lines under a subtotal name each rate only when they differ',()=>{
 assert.deepEqual(taxRows({items:lines,taxRate:20,tax:4050,vatRegistered:true},money),[['VAT at 20% on £195.00',3900],['VAT at 5% on £30.00',150],['Zero-rated on £300.00',0],['Exempt on £135.00',0]]);
 assert.deepEqual(taxRows({items:[lines[0]],taxRate:20,tax:3900,vatRegistered:true},money),[['VAT (20%)',3900]]);
 assert.deepEqual(taxRows({items:[lines[0]],taxRate:0,tax:0,vatRegistered:false},money),[]);
});

test('the VAT choice on a form round-trips, and the server keeps only a valid rate',()=>{
 assert.deepEqual(LINE_VAT.map(([value])=>value),['','5','0','exempt']);
 for(const [choice] of LINE_VAT)assert.equal(lineVatChoice(withLineVat({title:'Line',taxRate:20},choice)),choice);
 assert.deepEqual(withLineVat({title:'Line',exempt:true},''),{title:'Line'});
 const fail=(status,message)=>{throw new Error(message);};
 assert.deepEqual(cleanLineVat({exempt:true,taxRate:5},fail),{exempt:true});
 assert.deepEqual(cleanLineVat({taxRate:5.555},fail),{taxRate:5.56});
 assert.deepEqual(cleanLineVat({exempt:'yes'},fail),{});
 assert.throws(()=>cleanLineVat({taxRate:-1},fail),/VAT rate/);
 assert.throws(()=>cleanLineVat({taxRate:'5'},fail),/VAT rate/);
});
