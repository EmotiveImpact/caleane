import React,{forwardRef,useEffect,useId,useRef} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Switch from '@radix-ui/react-switch';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as Avatar from '@radix-ui/react-avatar';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {Search,X,LoaderCircle,Check,Minus,ChevronDown,ChevronUp} from 'lucide-react';

const cx=(...values)=>values.filter(Boolean).join(' ');

export function WorkspaceUIProvider({children}){
  useEffect(()=>{
    const root=document.documentElement;
    // Text inputs match :focus-visible on mouse clicks too. Track navigation so
    // keyboard users get a focus cue without adding frames to clicked fields.
    const keyboard=event=>{
      if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'))root.dataset.wsKeyboard='true';
    };
    const pointer=()=>{delete root.dataset.wsKeyboard;};
    document.addEventListener('keydown',keyboard,true);
    document.addEventListener('pointerdown',pointer,true);
    return ()=>{
      document.removeEventListener('keydown',keyboard,true);
      document.removeEventListener('pointerdown',pointer,true);
      delete root.dataset.wsKeyboard;
    };
  },[]);
  return <Tooltip.Provider delayDuration={400} skipDelayDuration={150}>{children}</Tooltip.Provider>;
}

export function WorkspaceTooltip({label,children,side='top',disabled=false}){return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger>{!disabled&&<Tooltip.Portal><Tooltip.Content className="ws-tooltip" side={side} sideOffset={7} collisionPadding={12}>{label}</Tooltip.Content></Tooltip.Portal>}</Tooltip.Root>;}

export const WorkspaceButton=forwardRef(function WorkspaceButton({variant='primary',size='normal',iconOnly=false,loading=false,tooltip,className,children,type='button',disabled,...props},ref){
  const button=<button ref={ref} type={type} disabled={disabled||loading} className={cx('ws-button',`ws-button--${variant}`,size==='small'&&'ws-button--small',iconOnly&&'ws-button--icon',className)} aria-busy={loading||undefined} {...props}>{loading&&<LoaderCircle className="ws-spinner" size={16}/>} {children}</button>;
  return tooltip?<WorkspaceTooltip label={tooltip}>{button}</WorkspaceTooltip>:button;
});

export function WorkspaceHeading({title,description,action,className}){
  return <header className={cx('ws-heading',className)}><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="ws-heading-actions">{action}</div>}</header>;
}

export function WorkspaceField({label,hint,error,children,className,id,...props}){
  const generated=useId(),inputId=id||generated,descriptionId=`${inputId}-description`;
  return <div className={cx('ws-field',error&&'has-error',className)}><label htmlFor={inputId}>{label}</label>{children?React.cloneElement(children,{id:inputId,'aria-describedby':hint||error?descriptionId:undefined,'aria-invalid':error?true:undefined}):<input id={inputId} aria-describedby={hint||error?descriptionId:undefined} aria-invalid={error?true:undefined} {...props}/>} {(hint||error)&&<small id={descriptionId}>{error||hint}</small>}</div>;
}

export function WorkspaceSearch({label='Search',className,children,...props}){
  return <label className={cx('ws-search',className)}><Search size={17} aria-hidden="true"/><input aria-label={label} type="search" {...props}/>{children}</label>;
}

export function WorkspaceFilters({items,value,onChange,label='Filter',className}){
  return <ToggleGroup.Root type="single" className={cx('ws-filters',className)} aria-label={label} value={value} onValueChange={next=>{if(next)onChange(next);}}>{items.map(item=>{const option=typeof item==='string'?{value:item,label:item}:item;return <ToggleGroup.Item type="button" key={option.value} value={option.value}>{option.label}{option.count!==undefined&&<span>{option.count}</span>}</ToggleGroup.Item>;})}</ToggleGroup.Root>;
}

export function WorkspaceTabs({items,value,onChange,label='Sections',children,className}){
  return <Tabs.Root className={cx('ws-tabs',className)} value={value} onValueChange={onChange} activationMode="manual"><Tabs.List aria-label={label}>{items.map(item=><Tabs.Trigger key={item.value} value={item.value}>{item.label}</Tabs.Trigger>)}</Tabs.List>{items.map(item=><Tabs.Content key={item.value} value={item.value}>{typeof children==='function'?children(item.value):item.content}</Tabs.Content>)}</Tabs.Root>;
}

export function WorkspaceStatus({value,tone,className}){
  const state=tone||(/\b(approved|accepted|confirmed|complete|resolved|paid)\b/i.test(value)?'success':/changes|update|waiting|review|pending/i.test(value)?'warning':/overdue|failed|cancelled/i.test(value)?'danger':'neutral');
  return <span className={cx('ws-status',`ws-status--${state}`,className)}><i aria-hidden="true"/>{value}</span>;
}

export function WorkspaceAvatar({name='',src,size='normal',className}){
  return <Avatar.Root className={cx('ws-avatar',size==='small'&&'ws-avatar--small',className)} title={name}>{src&&<Avatar.Image src={src} alt={name}/>}<Avatar.Fallback aria-label={name}>{name.split(/\s+/).filter(Boolean).map(word=>word[0]).slice(0,2).join('')}</Avatar.Fallback></Avatar.Root>;
}

export function WorkspaceDate({date,className}){
  const value=new Date(`${date}T12:00:00`);
  return <time dateTime={date} className={cx('ws-date',className)}><span>{value.toLocaleDateString('en-GB',{month:'short'})}</span><strong>{value.getDate()}</strong></time>;
}

export function WorkspaceDialog({open,onOpenChange,title,description,children,drawer=false}){
  const returnFocus=useRef(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="ws-dialog-scrim"/><Dialog.Content className={cx('ws-dialog',drawer&&'ws-dialog--drawer')} {...(!description?{'aria-describedby':undefined}:{})} onOpenAutoFocus={()=>{returnFocus.current=document.activeElement;}} onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus();}}><header><div><Dialog.Title>{title}</Dialog.Title>{description&&<Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close asChild><WorkspaceButton variant="ghost" iconOnly aria-label="Close"><X size={18}/></WorkspaceButton></Dialog.Close></header><div className="ws-dialog-content">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function WorkspaceEmpty({icon:Icon,title,description,action}){
  return <div className="ws-empty">{Icon&&<Icon size={24} strokeWidth={1.5}/>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

export const WorkspaceSelect=forwardRef(function WorkspaceSelect({options,value,defaultValue,onValueChange,name,required,disabled,placeholder,label,className,id,...props},ref){
  const items=options.map(item=>typeof item==='string'?{value:item,label:item}:item);
  return <Select.Root value={value} defaultValue={defaultValue??(placeholder?undefined:items[0]?.value)} onValueChange={onValueChange} name={name} required={required} disabled={disabled}>
   <Select.Trigger ref={ref} id={id} className={cx('ws-select',className)} aria-label={label} {...props}><Select.Value data-ws-select-value="" placeholder={placeholder}/><Select.Icon className="ws-select-icon"><ChevronDown size={15} aria-hidden="true"/></Select.Icon></Select.Trigger>
   <Select.Portal><Select.Content className="ws-select-content" position="popper" align="start" sideOffset={6} collisionPadding={12} avoidCollisions><Select.ScrollUpButton className="ws-select-scroll"><ChevronUp size={14}/></Select.ScrollUpButton><Select.Viewport>{items.map(item=><Select.Item key={item.value} value={item.value} disabled={item.disabled} className="ws-select-item"><Select.ItemText data-ws-select-label="">{item.label}</Select.ItemText><Select.ItemIndicator className="ws-select-check"><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="ws-select-scroll"><ChevronDown size={14}/></Select.ScrollDownButton></Select.Content></Select.Portal>
  </Select.Root>;
});

export function WorkspaceCheckbox({label,checked,defaultChecked,onCheckedChange,className,...props}){
  const control=<Checkbox.Root type="button" checked={checked} defaultChecked={defaultChecked} onCheckedChange={onCheckedChange} className="ws-checkbox" {...props}><Checkbox.Indicator>{checked==='indeterminate'?<Minus size={12}/>:<Check size={12}/>}</Checkbox.Indicator></Checkbox.Root>;
  return label?<label className={cx('ws-choice-label',className)}>{control}<span>{label}</span></label>:control;
}

export function WorkspaceSwitch({label,description,checked,defaultChecked,onCheckedChange,...props}){
  const id=useId();return <div className="ws-switch-row"><label htmlFor={id}><strong>{label}</strong>{description&&<small>{description}</small>}</label><Switch.Root type="button" id={id} className="ws-switch" checked={checked} defaultChecked={defaultChecked} onCheckedChange={onCheckedChange} {...props}><Switch.Thumb className="ws-switch-thumb"/></Switch.Root></div>;
}

export function WorkspaceRadioChoices({options,value,onChange,label,className,compact=false}){
  return <RadioGroup.Root className={cx('ws-radio-choices',compact&&'is-compact',className)} value={value} onValueChange={onChange} aria-label={label}>{options.map(option=><RadioGroup.Item className="ws-radio-choice" key={option.value} value={option.value} aria-label={option.name} style={{'--swatch':option.value}}><span className="ws-radio-swatch"><RadioGroup.Indicator><Check size={14}/></RadioGroup.Indicator></span>{!compact&&<span>{option.name}</span>}</RadioGroup.Item>)}</RadioGroup.Root>;
}

export function WorkspaceMenu({trigger,items,label='Actions',align='end'}){
 const triggerRef=useRef(null);
 return <DropdownMenu.Root><DropdownMenu.Trigger asChild ref={triggerRef}>{trigger}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="ws-menu" align={align} sideOffset={7} collisionPadding={12} aria-label={label}>{items.map((item,index)=>item.separator?<DropdownMenu.Separator key={index} className="ws-menu-separator"/>:<DropdownMenu.Item key={item.label} className={cx('ws-menu-item',item.danger&&'is-danger')} disabled={item.disabled} onSelect={event=>item.onSelect?.(event,triggerRef.current)}>{item.icon&&<item.icon size={15}/>}<span>{item.label}</span>{item.shortcut&&<small>{item.shortcut}</small>}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

export function WorkspacePopover({trigger,open,onOpenChange,title,children,className,side='bottom',align='end',modal=false}){
 const id=useId();return <Popover.Root open={open} onOpenChange={onOpenChange} modal={modal}><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content className={cx('ws-popover',className)} side={side} align={align} sideOffset={9} collisionPadding={14} aria-labelledby={title?id:undefined}>{title&&<header><h2 id={id}>{title}</h2><Popover.Close asChild><WorkspaceButton variant="ghost" iconOnly size="small" aria-label="Close"><X size={16}/></WorkspaceButton></Popover.Close></header>}{children}</Popover.Content></Popover.Portal></Popover.Root>;
}

export function WorkspaceConfirm({open,onOpenChange,title,description,confirmLabel='Remove',onConfirm,returnFocusRef}){
 const previous=useRef(null);
 return <AlertDialog.Root open={open} onOpenChange={onOpenChange}><AlertDialog.Portal><AlertDialog.Overlay className="ws-dialog-scrim"/><AlertDialog.Content className="ws-dialog ws-confirm" onOpenAutoFocus={()=>{previous.current=document.activeElement;}} onCloseAutoFocus={event=>{event.preventDefault();const target=returnFocusRef?.current||previous.current;if(target?.isConnected)target.focus();}}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description><div className="ws-confirm-actions"><AlertDialog.Cancel asChild><WorkspaceButton variant="secondary">Cancel</WorkspaceButton></AlertDialog.Cancel><AlertDialog.Action asChild><WorkspaceButton variant="danger" onClick={onConfirm}>{confirmLabel}</WorkspaceButton></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}
