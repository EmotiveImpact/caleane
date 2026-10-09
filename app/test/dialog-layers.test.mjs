import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

// A confirmation opened from inside any dialog must sit above it, or its button cannot be pressed.
const dom=setupDom();
const {module:ui,remove}=await bundle("export {ConfirmDialog} from './src/components/ConfirmDialog.jsx'; export {WorkspaceConfirm} from './src/components/workspace/WorkspaceUI.jsx';",'dialog-layers');
const {render,cleanup,screen}=await import('@testing-library/react');
const h=React.createElement;
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});
const css=(await Promise.all(['src/style.css','src/components/workspace/workspace-ui.css','src/folio-type-grid.css','src/components/pipeline-workspace.css','src/form-studio.css','src/form-design.css'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
const tokens=Object.fromEntries([...css.matchAll(/--(layer-[a-z]+):(\d+)/g)].map(m=>[m[1],Number(m[2])]));
function layerOf(selector){
 const rule=[...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(m=>m[1].split(',').map(s=>s.trim()).includes(selector)&&/z-index:/.test(m[2]));
 assert.ok(rule,'no z-index rule for '+selector);
 const value=rule[2].match(/z-index:\s*([^;]+)/)[1].trim(),plain=value.match(/^var\(--(layer-[a-z]+)\)$/),plus=value.match(/^calc\(var\(--(layer-[a-z]+)\)\s*\+\s*(\d+)\)$/);
 assert.ok(plain||plus,`${selector} uses a fixed z-index (${value}) instead of a shared layer`);
 return plain?tokens[plain[1]]:tokens[plus[1]]+Number(plus[2]);
}
test('confirmations sit above every kind of dialog and below menus and tooltips',()=>{
 const confirm=layerOf('.ws-dialog-scrim.ws-confirm-scrim');
 for(const selector of ['.modal-backdrop','.modal-dialog','.modal[role="dialog"]','.ws-dialog-scrim','.ws-dialog','.crm-create-dialog','.pl-client','.form-settings-dialog','.form-preview-scrim','.form-expanded-preview'])assert.ok(confirm>layerOf(selector),selector+' covers confirmations');
 assert.ok(layerOf('.ws-dialog.ws-confirm')>confirm);
 assert.ok(layerOf('.ws-select-content')>layerOf('.ws-dialog.ws-confirm'));assert.ok(layerOf('.ws-tooltip')>layerOf('.ws-select-content'));
});
test('both confirmation components use the confirmation layer',()=>{
 render(h(ui.ConfirmDialog,{open:true,title:'Remove reference?',description:'This cannot be undone.',confirmLabel:'Remove'}));
 assert.ok(dom.window.document.querySelector('.ws-dialog-scrim.ws-confirm-scrim'));assert.ok(screen.getByRole('alertdialog').classList.contains('ws-confirm'));
 cleanup();
 render(h(ui.WorkspaceConfirm,{open:true,onOpenChange:()=>{},title:'Remove file?',description:'This cannot be undone.'}));
 assert.ok(dom.window.document.querySelector('.ws-dialog-scrim.ws-confirm-scrim'));
});
