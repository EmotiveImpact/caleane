import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowOptions,workflowOptionsFor,workflowFor,projectTypesFor,briefFieldsFor,isWorkflowId} from '../src/lib/workflows.js';
import {MILESTONE_TEMPLATES} from '../studio-operations.mjs';

test('new choices come from a short list of broad groups',()=>{
 assert.deepEqual(workflowOptions.map(o=>o.label),['Events and experiences','Weddings','Interiors and spaces','Brand and design','Photography and film','Made to order','Other creative work']);
 for(const {id} of workflowOptions){assert.ok(projectTypesFor(id).length);assert.equal(briefFieldsFor(id).length,2);assert.equal(MILESTONE_TEMPLATES[id].length,5);}
});

test('older narrow choices keep working and stay selectable where already used',()=>{
 assert.ok(isWorkflowId('floral-design'));
 assert.equal(workflowFor({branding:{profession:'floral-design'}}).name,'Floral design');
 assert.ok(!workflowOptions.some(o=>o.id==='floral-design'));
 assert.equal(workflowOptionsFor('floral-design').at(-1).id,'floral-design');
 assert.equal(workflowOptionsFor('photo-film'),workflowOptions);
 assert.equal(workflowOptionsFor('nonsense'),workflowOptions);
});
