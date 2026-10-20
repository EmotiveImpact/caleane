import test from 'node:test';
import assert from 'node:assert/strict';
import {formBrand} from '../src/lib/brand-kit.js';
import {validateForm} from '../forms.mjs';

test('a form follows the Brand kit colour unless it has its own accent',()=>{
 const studio={accent:'#181925',brandKit:{colours:{primary:'#7b4b3a'},fonts:{heading:{type:'preset',preset:'cormorant-garamond'}}}};
 assert.equal(formBrand(studio,{accent:''}).accent,'#7b4b3a');
 assert.equal(formBrand(studio,{accent:'#344c40'}).accent,'#344c40');
 assert.match(formBrand(studio,{}).heading,/Cormorant Garamond/);
 assert.equal(formBrand({accent:'#181925',brandKit:{colours:{}}},{}).accent,'#181925','no Brand kit colour falls back to the studio accent');
 assert.equal(formBrand({accent:'#f4e9c8'},{}).accent,'#202326','a pale studio accent is not used for white button text');
 assert.equal(formBrand({},{accent:''}).onAccent,'#ffffff');
 assert.equal(formBrand({brandKit:{colours:{primary:'#e8c872'}}},{}).onAccent,'#141414','a light brand colour gets dark button text');
});

test('saving a form with no accent keeps it following the Brand kit',()=>{
 const form=validateForm({name:'Enquiry',title:'Hello',accent:'',projectTypes:['Wedding'],fields:{},questions:[]});
 assert.equal(form.accent,'');
 assert.throws(()=>validateForm({name:'Enquiry',title:'Hello',accent:'#f4e9c8',projectTypes:['Wedding'],fields:{},questions:[]}),/darker accent/);
});
