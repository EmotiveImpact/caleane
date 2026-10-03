import React,{useId} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {ListFilter,X} from 'lucide-react';
import './collection-filter.css';

// Filters the displayed collection; workspace search finds and opens records.
export function CollectionFilter({label,value,onChange,placeholder='Filter by name…'}){
 const inputId=useId();
 return <Popover.Root><Popover.Trigger asChild><button type="button" className="collection-filter-trigger" aria-label={label} data-active={!!value}><ListFilter size={16} aria-hidden="true"/><span>Filter</span>{value&&<span className="collection-filter-dot" aria-label="Active filter"/>}</button></Popover.Trigger>
  <Popover.Portal><Popover.Content className="collection-filter-popover" align="end" sideOffset={8} collisionPadding={16}>
   <div className="collection-filter-heading"><label htmlFor={inputId}>{label}</label><Popover.Close asChild><button type="button" aria-label="Close filter"><X size={15}/></button></Popover.Close></div>
   <input id={inputId} autoFocus value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder}/>
   <div className="collection-filter-foot"><span>Filters this view</span>{value&&<button type="button" onClick={()=>onChange('')}>Clear</button>}</div>
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
