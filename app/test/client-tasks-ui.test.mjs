import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React,{useState} from 'react';
import {setupDom,bundle} from './ui-harness.mjs';

const dom=setupDom();
const {module:ui,remove}=await bundle("export {ClientTasks,nextTodo} from './src/components/ClientTasks.jsx'; export {WorkspaceUIProvider} from './src/components/workspace/WorkspaceUI.jsx';",'client-tasks');
const {render,screen,cleanup,within}=await import('@testing-library/react');
const {default:userEvent}=await import('@testing-library/user-event');
const h=React.createElement,user=()=>userEvent.setup({document:dom.window.document,pointerEventsCheck:0});
afterEach(()=>cleanup());
after(async()=>{await remove();dom.window.close();});

const client={id:'c1',name:'Test Person',followUp:'2026-10-14',followUpNote:'Send the moodboard'};
const tasks=[{id:'t1',clientId:'c1',title:'Send the revised quote',dueDate:'2026-10-12',priority:'High',completed:false},{id:'t2',clientId:'c1',title:'Book the shoot',dueDate:'',priority:'Normal',completed:true,completedAt:'2026-10-01T10:00:00.000Z'},{id:'t3',clientId:'other',title:'Someone else',dueDate:'2026-10-01',priority:'Normal',completed:false}];

test('the next step is the soonest open task or follow-up for that client',()=>{
 assert.equal(ui.nextTodo(client,tasks).title,'Send the revised quote');
 assert.equal(ui.nextTodo({...client,followUp:'2026-10-02'},tasks).title,'Send the moodboard');
 assert.equal(ui.nextTodo({id:'c9',name:'Nobody'},tasks),null);
});

test('tasks and the follow-up sit in one list and each can be ticked off or added',async()=>{
 const calls=[];
 const request=async(url,method,body)=>{calls.push([url,method,body]);if(url.startsWith('/api/clients/'))return {client:{...client,followUp:'',followUpNote:''}};if(method==='POST')return {task:{id:'t4',clientId:'c1',title:body.title,dueDate:body.dueDate,priority:body.priority,completed:false}};return {task:{...tasks[0],completed:true,completedAt:'2026-10-09T10:00:00.000Z'}};};
 function Harness(){const [list,setList]=useState(tasks),[record,setRecord]=useState(client);return h(ui.WorkspaceUIProvider,null,h(ui.ClientTasks,{studio:{id:'s1'},client:record,tasks:list,request,run:fn=>fn(),busy:false,onTasks:setList,onClient:setRecord}));}
 render(h(Harness));
 const open=()=>[...document.querySelectorAll('.crm-task-list')][0].querySelectorAll('article');
 assert.deepEqual([...open()].map(a=>a.querySelector('strong').textContent),['Send the revised quote','Send the moodboard']);
 assert.equal(screen.queryByText('Someone else'),null);
 const input=user();
 await input.click(screen.getByRole('button',{name:'Mark done: Send the moodboard'}));
 assert.deepEqual(calls.at(-1),['/api/clients/c1?studio=s1','PATCH',{followUpDone:true}]);
 assert.equal(open().length,1);
 await input.click(screen.getByRole('button',{name:'Mark done: Send the revised quote'}));
 assert.deepEqual(calls.at(-1),['/api/crm/tasks/t1?studio=s1','PATCH',{completed:true}]);
 assert.ok(screen.getByText(/Nothing waiting/));
 await input.click(screen.getByRole('button',{name:'Show done (2)'}));
 assert.ok(screen.getByText('Book the shoot'));
 await input.type(screen.getByRole('textbox',{name:'Task'}),'Call about the venue');
 await input.click(screen.getByRole('button',{name:'Add task'}));
 assert.equal(calls.at(-1)[2].clientId,'c1');assert.equal(calls.at(-1)[2].title,'Call about the venue');
 assert.equal(within(open()[0]).getByText('Call about the venue').tagName,'STRONG');
});
