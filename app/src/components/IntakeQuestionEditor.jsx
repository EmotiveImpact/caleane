import React from 'react';
import {FormSelect} from './FormDesignControls';
import {WorkspaceCheckbox} from './workspace/WorkspaceUI';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';

function keepValidConditions(questions){
 return questions.map((question,index)=>{
  const condition=question.showWhen;
  const parent=questions.slice(0,index).find(item=>item.id===condition?.questionId);
  return {...question,showWhen:parent?.type==='choice'&&parent.options.includes(condition?.equals)?condition:null};
 });
}

export function IntakeQuestionEditor({questions,onChange,compact=false}){
 const Row=compact?'details':'div';
 const change=(index,patch)=>onChange(keepValidConditions(questions.map((question,i)=>i===index?{...question,...patch}:question)));
 const move=(index,direction)=>{const next=[...questions],other=index+direction;[next[index],next[other]]=[next[other],next[index]];onChange(keepValidConditions(next));};
 return <section className="intake-question-editor" aria-label="Enquiry questions">
  <div className="intake-question-header"><div><h3>Questions for your enquiry</h3><p>Ask up to 24 useful questions. Answers stay with the project brief.</p></div><button type="button" className="button secondary" disabled={questions.length>=24} onClick={()=>onChange([...questions,{id:'q-'+crypto.randomUUID(),label:'',type:'text',required:false,options:[],showWhen:null}])}><Plus size={15}/> Add question</button></div>
  {questions.length===0?<p className="muted">The planner uses the service area questions above. Add a question if your studio needs something more specific.</p>:questions.map((question,index)=>{
   const priorChoices=questions.slice(0,index).filter(item=>item.type==='choice');
   const selectedParent=priorChoices.find(item=>item.id===question.showWhen?.questionId);
   return <Row className="intake-question-row" key={question.id} {...(compact&&!question.label?{open:true}:{})}>{compact&&<summary className="question-library-summary">{question.label||'New question'}<span>{question.type}{question.required?' · Required':''}</span></summary>}
    <div className="intake-question-row-head"><small>Question {index+1}</small><div><button type="button" aria-label="Move question up" disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button type="button" aria-label="Move question down" disabled={index===questions.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button><button type="button" aria-label="Remove question" onClick={()=>onChange(keepValidConditions(questions.filter((_,i)=>i!==index)))}><Trash2 size={15}/></button></div></div>
    <label className="field"><span>Question</span><input aria-label="Question" value={question.label} minLength="3" maxLength="120" required placeholder="What do you need us to know?" onChange={event=>change(index,{label:event.target.value})}/></label>
    <div className="intake-question-options"><label className="field"><span>Answer</span><FormSelect aria-label="Answer" value={question.type} onChange={event=>change(index,{type:event.target.value,options:['choice','multi'].includes(event.target.value)&&question.options.length<2?['Option one','Option two']:question.options})}><option value="text">Short answer</option><option value="long">Long answer</option><option value="choice">Single choice</option><option value="multi">Multiple choices</option><option value="number">Number</option><option value="date">Date</option><option value="email">Email</option><option value="url">Web link</option><option value="file">File upload</option></FormSelect></label><WorkspaceCheckbox label="Required" checked={question.required} onCheckedChange={required=>change(index,{required})}/></div>
    {['choice','multi'].includes(question.type)&&<label className="field"><span>Choices, one per line (2–12)</span><textarea aria-label="Choices, one per line" rows="3" value={question.options.join('\n')} onChange={event=>change(index,{options:event.target.value.split('\n')})}/></label>}
    <label className="field"><span>Help text (optional)</span><input value={question.help||''} maxLength="300" onChange={event=>change(index,{help:event.target.value})}/></label>
    {!['choice','multi','date'].includes(question.type)&&<label className="field"><span>Answer hint (optional)</span><input value={question.placeholder||''} maxLength="120" onChange={event=>change(index,{placeholder:event.target.value})}/></label>}
    {priorChoices.length>0&&<div className="intake-conditional"><label className="field"><span>Show this question</span><FormSelect value={question.showWhen?.questionId||''} onChange={event=>{const parent=priorChoices.find(item=>item.id===event.target.value);change(index,{showWhen:parent?{questionId:parent.id,equals:parent.options[0]}:null});}}><option value="">Always</option>{priorChoices.map(parent=><option key={parent.id} value={parent.id}>When “{parent.label||'earlier choice'}” is answered…</option>)}</FormSelect></label>{selectedParent&&<label className="field"><span>Answer is</span><FormSelect value={question.showWhen?.equals||''} onChange={event=>change(index,{showWhen:{questionId:selectedParent.id,equals:event.target.value}})}>{selectedParent.options.map(option=><option key={option} value={option}>{option}</option>)}</FormSelect></label>}</div>}
   </Row>;
  })}
 </section>;
}
