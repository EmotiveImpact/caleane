import React from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {WorkspaceSelect} from './workspace/WorkspaceUI';

// Adapts the editor's labelled fields to the shared, keyboard-accessible Radix select.
const EMPTY='__form_empty__';
export function FormSelect({children,value,defaultValue,onChange,...props}){
 const options=React.Children.toArray(children).filter(React.isValidElement).map(option=>({value:String(option.props.value??option.props.children)||EMPTY,label:option.props.children,disabled:option.props.disabled}));
 return <WorkspaceSelect {...props} options={options} value={value===undefined?undefined:String(value)||EMPTY} defaultValue={defaultValue===undefined?undefined:String(defaultValue)||EMPTY} onValueChange={next=>onChange?.({target:{value:next===EMPTY?'':next}})}/>;
}
export function FormField({label,children,...props}){
 const control=children?.type==='select'?<FormSelect {...children.props} aria-label={label}/>:children?React.cloneElement(children,{'aria-label':label}):<input aria-label={label} {...props}/>;
 return <label className="field"><span>{label}</span>{control}</label>;
}
export const SCREEN_LAYOUTS=[{value:'center',name:'Full page',description:'Room for your questions'},{value:'image-left',name:'Image left',description:'Half image, half form'},{value:'image-right',name:'Image right',description:'Half form, half image'},{value:'cover',name:'Full image',description:'A form over photography'},{value:'stack',name:'Image above',description:'An editorial opening'},{value:'split',name:'Brand split',description:'Your story alongside'}];
export function LayoutChoices({value,onChange}){
 return <RadioGroup.Root className="form-layout-choices" value={value} onValueChange={onChange} aria-label="Screen layout">{SCREEN_LAYOUTS.map(layout=><RadioGroup.Item type="button" className="form-layout-choice" value={layout.value} key={layout.value}><span className={'layout-miniature layout-miniature-'+layout.value} aria-hidden="true"><i/><span><b/><b/><em/></span></span><span className="layout-choice-label">{layout.name}<RadioGroup.Indicator>✓</RadioGroup.Indicator></span><small>{layout.description}</small></RadioGroup.Item>)}</RadioGroup.Root>;
}
export function ButtonShapeChoices({value,onChange,accent}){
 return <RadioGroup.Root className="form-shape-choices" aria-label="Button shape" value={value} onValueChange={onChange} style={accent?{'--studio-accent':accent}:undefined}>{[['square','Square'],['soft','Soft'],['round','Pill']].map(([shape,label])=><RadioGroup.Item type="button" key={shape} value={shape} className={'form-shape-choice shape-'+shape}><span aria-hidden="true">Continue</span><strong>{label}</strong></RadioGroup.Item>)}</RadioGroup.Root>;
}

export function FormThumbnail({definition,studioName,accent}){
 const screen=definition.screens?.[0],image=screen?.imageUrl,theme=definition.theme||{};
 return <div className={'form-card-preview'+(image?' has-image':'')+' thumbnail-layout-'+(screen?.layout||'split')+' thumbnail-font-'+(theme.font||'sans')+' thumbnail-theme-'+(theme.background||'white')+' thumbnail-radius-'+(theme.radius||'soft')+' thumbnail-finish-'+(theme.buttonStyle||'solid')} aria-hidden="true" style={{'--card-accent':accent||definition.accent||'#202326'}}>{image&&<img src={image} alt="" loading="lazy" style={{objectFit:screen.imageFit||'cover',objectPosition:screen.imagePosition||'center'}}/>}<div><small>{studioName}</small><strong>{screen?.title||definition.title}</strong><i/><span className="ws-button ws-button--primary form-card-action">{screen?.buttonLabel||'Begin your brief'}</span></div></div>;
}
