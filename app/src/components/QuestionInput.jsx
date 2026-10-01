import React from 'react';
export function intakeFormValues(data,questions,prefix='intake__'){return Object.fromEntries(questions.map(q=>[q.id,q.type==='multi'?data.getAll(prefix+q.id):String(data.get(prefix+q.id)||'')]));}
export function answerText(value){return Array.isArray(value)?value.join(', '):value||'';}
export function QuestionInput({question:q,value,onChange,disabled=false,name='intake__'+q.id}){
 const common={name,'aria-label':q.label,disabled,required:q.required,placeholder:q.placeholder||'',onChange:e=>onChange?.(e.target.value),...(onChange?{value:value??''}:{defaultValue:value??''})};
 const helpId='help-'+q.id;
 return <div className="form-question-input"><label className="field"><span>{q.label}{!q.required&&<small> Optional</small>}</span>{q.type==='multi'?null:q.type==='choice'?<select {...common} aria-describedby={q.help?helpId:undefined}><option value="">Choose an answer</option>{q.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:q.type==='long'?<textarea {...common} rows="4" maxLength="1200" aria-describedby={q.help?helpId:undefined}/>:<input {...common} type={['number','date','email','url'].includes(q.type)?q.type:'text'} step={q.type==='number'?'any':undefined} maxLength="500" aria-describedby={q.help?helpId:undefined}/>}</label>
 {q.type==='multi'&&<fieldset aria-describedby={q.help?helpId:undefined}><legend className="sr-only">{q.label}</legend>{q.options.map(option=><label key={option} className="form-check"><input type="checkbox" name={name} value={option} disabled={disabled} {...(onChange?{checked:(value||[]).includes(option),onChange:e=>onChange(e.target.checked?[...(value||[]),option]:(value||[]).filter(v=>v!==option))}:{defaultChecked:(value||[]).includes(option)})}/>{option}</label>)}</fieldset>}
 {q.help&&<p id={helpId} className="form-help">{q.help}</p>}</div>;
}
