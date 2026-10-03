import React from 'react';
export function intakeFormValues(data,questions,prefix='intake__'){return Object.fromEntries(questions.map(q=>[q.id,q.type==='multi'?data.getAll(prefix+q.id):String(data.get(prefix+q.id)||'')]));}
export function answerText(value){return Array.isArray(value)?value.join(', '):value||'';}
export function QuestionInput({question:q,value,onChange,disabled=false,name='intake__'+q.id,presentation='default',hideLabel=false}){
 const common={name,'aria-label':q.label,disabled,required:q.required,placeholder:q.placeholder||'',onChange:e=>onChange?.(e.target.value),...(onChange?{value:value??''}:{defaultValue:value??''})};
 const helpId='help-'+q.id;
 if(presentation==='cards'&&['choice','multi'].includes(q.type))return <ChoiceInput question={q} value={value} onChange={onChange} disabled={disabled} name={name} hideLabel={hideLabel}/>;
 return <div className="form-question-input"><label className="field"><span className={hideLabel?'sr-only':undefined}>{q.label}{!q.required&&<small> Optional</small>}</span>{q.type==='multi'?null:q.type==='choice'?<select {...common} aria-describedby={q.help?helpId:undefined}><option value="">Choose an answer</option>{q.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:q.type==='long'?<textarea {...common} rows="4" maxLength="1200" aria-describedby={q.help?helpId:undefined}/>:<input {...common} type={['number','date','email','url'].includes(q.type)?q.type:'text'} step={q.type==='number'?'any':undefined} maxLength="500" aria-describedby={q.help?helpId:undefined}/>}</label>
 {q.type==='multi'&&<fieldset aria-describedby={q.help?helpId:undefined}><legend className="sr-only">{q.label}</legend>{q.options.map(option=><label key={option} className="form-check"><input type="checkbox" name={name} value={option} disabled={disabled} {...(onChange?{checked:(value||[]).includes(option),onChange:e=>onChange(e.target.checked?[...(value||[]),option]:(value||[]).filter(v=>v!==option))}:{defaultChecked:(value||[]).includes(option)})}/>{option}</label>)}</fieldset>}
 {q.help&&<p id={helpId} className="form-help">{q.help}</p>}</div>;
}

// Native inputs preserve keyboard navigation and validation while the whole answer is clickable.
export function ChoiceInput({question:q,value,onChange,disabled=false,name=q.id,hideLabel=false}){
 const multi=q.type==='multi',helpId='choice-help-'+q.id;
 return <fieldset className="form-choice-group" aria-describedby={helpId} data-field-id={q.id}>
  <legend className={hideLabel?'form-label-hidden':undefined}>{q.label}</legend>
  <p id={helpId} className="form-choice-hint">{q.help||(multi?'Choose all that apply.':'Choose one answer.')}{!q.required&&' Optional.'}</p>
  <div className="form-choice-options">{q.options.map((option,index)=><label className="form-choice-option" key={index}>
   <input type={multi?'checkbox':'radio'} name={name} value={option} disabled={disabled} required={!multi&&q.required} checked={multi?(value||[]).includes(option):value===option} onChange={e=>onChange(multi?(e.target.checked?[...(value||[]),option]:(value||[]).filter(v=>v!==option)):option)}/>
   <span>{option}</span>
  </label>)}</div>
  {!multi&&!q.required&&value&&<button type="button" className="text-button form-choice-clear" onClick={()=>onChange('')}>Clear selection</button>}
 </fieldset>;
}
