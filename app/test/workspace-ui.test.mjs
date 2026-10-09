import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React from 'react';

// Synthetic DOM tests exercise the controls themselves, without the app server or user data.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLFormElement','HTMLButtonElement','HTMLOptionElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','DocumentFragment','Event','CustomEvent','MutationObserver','NodeFilter','KeyboardEvent','MouseEvent','FocusEvent','DOMRect'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class PointerEvent extends dom.window.MouseEvent{constructor(type,props={}){super(type,props);this.pointerId=props.pointerId||1;this.pointerType=props.pointerType||'mouse';this.isPrimary=true;}}
globalThis.PointerEvent=dom.window.PointerEvent=PointerEvent;
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
for(const name of ['hasPointerCapture','setPointerCapture','releasePointerCapture','scrollIntoView'])dom.window.Element.prototype[name]=name==='hasPointerCapture'?()=>false:()=>{};

const compiled=fileURLToPath(new URL(`.workspace-ui-${process.pid}.mjs`,import.meta.url));
const output=await build({stdin:{contents:"export * from './src/components/workspace/WorkspaceUI.jsx'; export {AdminSidebar} from './src/components/workspace/AdminSidebar.jsx';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,packages:'external',format:'esm',platform:'node',write:false});
await writeFile(compiled,output.outputFiles[0].text);
const ui=await import(pathToFileURL(compiled));
const {render,screen,cleanup,waitFor}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement;
const mount=content=>render(h(ui.WorkspaceUIProvider,null,content));
const user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await unlink(compiled);dom.window.close();});

const sidebarStudio={id:'sidebar-test',name:'Test studio',branding:{}};
const sidebarProps={studio:sidebarStudio,session:{user:{id:'test-user',name:'Sophie Lane'},studios:[sidebarStudio]},owner:true,view:'overview',navigate:()=>{},signOut:()=>{},studioId:sidebarStudio.id,onStudioChange:()=>{}};

test('sidebar collapse persists, preserves navigation and keeps account actions available',async()=>{
 const input=user(),routes=[];
 window.localStorage.clear();
 mount(h(ui.AdminSidebar,{...sidebarProps,navigate:view=>routes.push(view)}));
 const collapse=screen.getByRole('button',{name:'Collapse sidebar'});
 await input.click(collapse);
 assert.equal(collapse,screen.getByRole('button',{name:'Expand sidebar'}));
 assert.equal(document.activeElement,collapse);
 assert.equal(collapse.getAttribute('aria-expanded'),'false');
 assert.equal(document.getElementById('workspace-navigation').dataset.collapsed,'true');
 await input.click(screen.getByRole('button',{name:'Projects'}));
 assert.deepEqual(routes,['projects']);
 await input.click(screen.getByRole('button',{name:'Your account and studios'}));
 assert.ok(await screen.findByRole('button',{name:'Account security'}));
 await input.keyboard('{Escape}');
 cleanup();mount(h(ui.AdminSidebar,sidebarProps));
 assert.ok(screen.getByRole('button',{name:'Expand sidebar'}));
 await input.click(screen.getByRole('button',{name:'Expand sidebar'}));
 assert.equal(window.localStorage.getItem('caleane.sidebar.collapsed'),'false');
 window.localStorage.clear();
});

test('compact sidebar retains role restrictions and gallery changes stay temporary',async()=>{
 const input=user();window.localStorage.setItem('caleane.sidebar.collapsed','true');
 for(const role of [{owner:false,staffViewer:true},{owner:false,staffViewer:false}]){
  mount(h(ui.AdminSidebar,{...sidebarProps,...role}));
  assert.ok(screen.getByRole('button',{name:'Expand sidebar'}));
  assert.ok(screen.getByRole('button',{name:'Projects'}));
  assert.equal(screen.queryByRole('button',{name:'Settings'}),null);
  assert.equal(screen.queryByRole('button',{name:'Team'}),null);
  assert.equal(Boolean(screen.queryByRole('button',{name:'Approvals'})),!role.staffViewer);
  cleanup();
 }
 mount(h(ui.AdminSidebar,{...sidebarProps,rememberPreference:false}));
 assert.ok(screen.getByRole('button',{name:'Collapse sidebar'}));
 await input.click(screen.getByRole('button',{name:'Collapse sidebar'}));
 await input.click(screen.getByRole('button',{name:'Expand sidebar'}));
 assert.equal(window.localStorage.getItem('caleane.sidebar.collapsed'),'true');
 window.localStorage.clear();
});

test('mobile sidebar traps focus, closes on navigation and Escape, and restores its opener',async()=>{
 const input=user(),routes=[],previous=window.matchMedia;
 window.localStorage.setItem('caleane.sidebar.collapsed','true');
 window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 try{
  mount(h(ui.AdminSidebar,{...sidebarProps,navigate:view=>routes.push(view)}));
  const opener=screen.getByRole('button',{name:'Open navigation'});
  assert.equal(screen.queryByRole('button',{name:'Projects'}),null);
  await input.click(opener);
  const dialog=await screen.findByRole('dialog',{name:'Workspace navigation'});
  assert.equal(dialog.dataset.collapsed,'false');
  assert.equal(screen.queryByRole('button',{name:'Collapse sidebar'}),null);
  screen.getByRole('button',{name:'Your account and studios'}).focus();
  await input.tab();assert.ok(dialog.contains(document.activeElement));
  await input.keyboard('{Escape}');await waitFor(()=>assert.equal(document.activeElement,opener));
  assert.equal(screen.queryByRole('dialog'),null);
  await input.click(opener);await input.click(screen.getByRole('button',{name:'Projects'}));
  await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
  assert.deepEqual(routes,['projects']);
  assert.equal(window.localStorage.getItem('caleane.sidebar.collapsed'),'true');
 }finally{cleanup();window.matchMedia=previous;window.localStorage.clear();}
});

test('sidebar still collapses when browser storage is unavailable',async()=>{
 const input=user(),descriptor=Object.getOwnPropertyDescriptor(window,'localStorage');
 Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage unavailable');}});
 try{
  mount(h(ui.AdminSidebar,sidebarProps));
  await input.click(screen.getByRole('button',{name:'Collapse sidebar'}));
  assert.ok(screen.getByRole('button',{name:'Expand sidebar'}));
 }finally{cleanup();Object.defineProperty(window,'localStorage',descriptor);}
});

test('field focus cues distinguish pointer editing from keyboard navigation, including portals',async()=>{
 const input=user();
 mount(h(React.Fragment,null,
  h(ui.WorkspaceSearch,{label:'Find project'}),
  h(ui.WorkspaceField,{label:'Project name'}),
  h(ui.WorkspacePopover,{title:'Details',trigger:h(ui.WorkspaceButton,null,'Edit details')},h(ui.WorkspaceField,{label:'Private note'}))
 ));
 const search=screen.getByRole('searchbox',{name:'Find project'});
 await input.click(search);
 await input.type(search,'Candlelight');
 assert.equal(document.documentElement.dataset.wsKeyboard,undefined);
 await input.tab();
 assert.equal(document.activeElement,screen.getByRole('textbox',{name:'Project name'}));
 assert.equal(document.documentElement.dataset.wsKeyboard,'true');
 await input.tab();await input.keyboard('{Enter}');
 const note=await screen.findByRole('textbox',{name:'Private note'});
 assert.equal(document.documentElement.dataset.wsKeyboard,'true');
 await input.click(note);
 assert.equal(document.documentElement.dataset.wsKeyboard,undefined);
 await input.keyboard('{Escape}');
 await input.keyboard('{Meta>}k{/Meta}');
 assert.equal(document.documentElement.dataset.wsKeyboard,'true');
 cleanup();
 assert.equal(document.documentElement.dataset.wsKeyboard,undefined);
});

test('Radix select, checkbox and switch submit the correct native form values',async()=>{
 const input=user();
 const view=mount(h('form',{'data-testid':'form'},
  h(ui.WorkspaceField,{label:'Practice'},h(ui.WorkspaceSelect,{name:'practice',defaultValue:'events',options:[{value:'events',label:'Events'},{value:'interiors',label:'Interiors'}]})),
  h(ui.WorkspaceCheckbox,{name:'notify',label:'Notify the team',defaultChecked:false}),
  h(ui.WorkspaceSwitch,{name:'updates',label:'Project updates',defaultChecked:true})
 ));
 const form=view.getByTestId('form');
 assert.equal(new dom.window.FormData(form).get('practice'),'events');
 await input.click(screen.getByRole('combobox',{name:'Practice'}));
 await input.click(await screen.findByRole('option',{name:'Interiors'}));
 await input.click(screen.getByRole('checkbox',{name:'Notify the team'}));
 await input.click(screen.getByRole('switch',{name:'Project updates'}));
 await waitFor(()=>{const values=new dom.window.FormData(form);assert.equal(values.get('practice'),'interiors');assert.equal(values.get('notify'),'on');assert.equal(values.has('updates'),false);});
 await input.click(screen.getByRole('combobox',{name:'Practice'}));
 await input.keyboard('{Escape}');
 await waitFor(()=>assert.equal(document.activeElement,screen.getByRole('combobox',{name:'Practice'})));
});

test('Radix filters and accent radios support arrow keys and preserve a selected filter',async()=>{
 const input=user();
 function Fixture(){const [filter,setFilter]=React.useState('All'),[accent,setAccent]=React.useState('#202326');return h(React.Fragment,null,h(ui.WorkspaceFilters,{label:'Work filter',items:['All','Complete'],value:filter,onChange:setFilter}),h(ui.WorkspaceRadioChoices,{label:'Accent',options:[{name:'Graphite',value:'#202326'},{name:'Slate',value:'#344e5b'}],value:accent,onChange:setAccent}));}
 mount(h(Fixture));
 const all=screen.getByRole('radio',{name:'All'});await input.click(all);
 await input.keyboard('{ArrowRight} ');
 assert.equal(screen.getByRole('radio',{name:'Complete'}).getAttribute('data-state'),'on');
 await input.click(screen.getByRole('radio',{name:'Complete'}));
 assert.equal(screen.getByRole('radio',{name:'Complete'}).getAttribute('data-state'),'on');
 await input.click(screen.getByRole('radio',{name:'Graphite'}));
 await input.keyboard('{ArrowRight>}');
 await waitFor(()=>assert.equal(screen.getByRole('radio',{name:'Slate'}).getAttribute('aria-checked'),'true'));
 await input.keyboard('{/ArrowRight}');
});

test('project stage selectors display a disabled current value and only submit allowed changes',async()=>{
 const input=user(),changes=[];
 function Fixture(){const [stage,setStage]=React.useState('Approved'),[busy,setBusy]=React.useState(false);return h(React.Fragment,null,
  h(ui.WorkspaceField,{label:'Project stage'},h(ui.WorkspaceSelect,{value:stage,disabled:busy,options:['Enquiry','Planning','Design','Approved','Complete','Archived'].map(value=>({value,label:value,disabled:value==='Approved'})),onValueChange:value=>{changes.push(value);setStage(value);}})),
  h(ui.WorkspaceButton,{onClick:()=>setBusy(true)},'Save in progress')
 );}
 mount(h(Fixture));const trigger=screen.getByRole('combobox',{name:'Project stage'});
 assert.match(trigger.textContent,/Approved/);
 await input.click(trigger);
 const approved=await screen.findByRole('option',{name:'Approved'});
 assert.equal(approved.getAttribute('aria-disabled'),'true');
 await input.click(approved);assert.deepEqual(changes,[]);
 await input.click(screen.getByRole('option',{name:'Planning'}));
 assert.deepEqual(changes,['Planning']);assert.match(trigger.textContent,/Planning/);
 await input.click(trigger);await input.keyboard('{Escape}');
 await waitFor(()=>assert.equal(document.activeElement,trigger));
 await input.click(screen.getByRole('button',{name:'Save in progress'}));
 assert.equal(trigger.disabled,true);
});

test('Radix menus dismiss on Escape, restore focus and invoke one action',async()=>{
 const input=user();let calls=0;
 mount(h(ui.WorkspaceMenu,{trigger:h(ui.WorkspaceButton,null,'More options'),items:[{label:'View details',onSelect:()=>calls++},{label:'Unavailable',disabled:true}]}));
 const trigger=screen.getByRole('button',{name:'More options'});
 await input.click(trigger);
 assert.ok(await screen.findByRole('menu'));
 assert.equal(screen.getByRole('menuitem',{name:'Unavailable'}).getAttribute('data-disabled'),'');
 await input.keyboard('{Escape}');
 await waitFor(()=>assert.equal(document.activeElement,trigger));
 assert.equal(screen.queryByRole('menu'),null);
 trigger.focus();await input.keyboard('{ArrowDown}{Enter}');
 await waitFor(()=>assert.equal(calls,1));
});

test('Radix popovers close on outside interaction and Escape returns focus',async()=>{
 const input=user();
 mount(h(React.Fragment,null,h(ui.WorkspacePopover,{title:'Notifications',trigger:h(ui.WorkspaceButton,null,'Open notifications')},h(ui.WorkspaceButton,null,'Open review')),h(ui.WorkspaceButton,null,'Outside')));
 const trigger=screen.getByRole('button',{name:'Open notifications'});
 await input.click(trigger);assert.ok(await screen.findByRole('dialog',{name:'Notifications'}));
 await input.keyboard('{Escape}');await waitFor(()=>assert.equal(document.activeElement,trigger));
 await input.click(trigger);await input.click(screen.getByRole('button',{name:'Outside'}));
 await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
});

test('controlled dialogs trap focus and restore the external opener on dismissal',async()=>{
 const input=user();
 function Fixture(){const [open,setOpen]=React.useState(false);return h(React.Fragment,null,h(ui.WorkspaceButton,{onClick:()=>setOpen(true)},'Open details'),h(ui.WorkspaceDialog,{open,onOpenChange:setOpen,title:'Project details',description:'Project information'},h(ui.WorkspaceButton,null,'Last action')));}
 mount(h(Fixture));const opener=screen.getByRole('button',{name:'Open details'});
 await input.click(opener);const dialog=await screen.findByRole('dialog',{name:'Project details'});
 screen.getByRole('button',{name:'Last action'}).focus();await input.tab();assert.ok(dialog.contains(document.activeElement));
 await input.keyboard('{Escape}');await waitFor(()=>assert.equal(document.activeElement,opener));
});

test('confirmation defaults to cancel, never confirms on Escape, and confirms explicitly',async()=>{
 const input=user();let confirmed=0;
 function Fixture(){const [open,setOpen]=React.useState(false);return h(React.Fragment,null,h(ui.WorkspaceButton,{onClick:()=>setOpen(true)},'Remove file'),h(ui.WorkspaceConfirm,{open,onOpenChange:setOpen,title:'Remove file?',description:'This removes one file.',onConfirm:()=>confirmed++}));}
 mount(h(Fixture));await input.click(screen.getByRole('button',{name:'Remove file'}));
 await screen.findByRole('alertdialog');assert.equal(document.activeElement,screen.getByRole('button',{name:'Cancel'}));
 await input.keyboard('{Escape}');assert.equal(confirmed,0);
 await input.click(screen.getByRole('button',{name:'Remove file'}));await input.click(screen.getByRole('button',{name:'Remove',exact:true}));
 assert.equal(confirmed,1);
});
