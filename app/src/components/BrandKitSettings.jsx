import React,{useEffect,useRef,useState} from 'react';
import {Trash2,Upload} from 'lucide-react';
import {WorkspaceButton} from './workspace/WorkspaceUI';
import {brandStyle,colourSlots,fontRoles,logoSlots,readableOn} from '../lib/brand-kit';
import '../studio-commerce.css';

const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('The file could not be read.'));reader.readAsDataURL(file);});
const familyFromFile=name=>name.replace(/\.(woff2?|ttf|otf)$/i,'').replace(/[-_](regular|bold|italic|medium|light|semibold|book|roman)$/i,'').replace(/[-_]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim().slice(0,60)||'Brand font';

// Studio brand kit: logos, colours and fonts used on branded documents.
export function BrandKitSettings({studio,request}){
 const [view,setView]=useState(null),[kit,setKit]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const url=`/api/brand-kit?studio=${studio.id}`;
 function accept(result){setView(result);setKit(result.kit);}
 useEffect(()=>{let active=true;request(url).then(result=>{if(active)accept(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[url,request]);
 async function call(body){setBusy(true);setError('');setSaved(false);try{const result=await request(url,'POST',body);accept(result);return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
 async function upload(kind,file){if(!file)return null;if(file.size>(kind==='font'?4:2)*1024*1024){setError(kind==='font'?'Choose a font file under 4 MB.':'Choose a logo under 2 MB.');return null;}const content=await readFile(file);return call({action:'upload',kind,name:file.name,content});}
 if(!kit)return <p className="commerce-muted">{error||'Loading your brand kit…'}</p>;
 const set=patch=>{setSaved(false);setKit({...kit,...patch});};
 const assets=new Map(view.assets.map(asset=>[asset.id,asset]));
 const style=brandStyle(kit,{fallbackAccent:studio.accent});
 async function chooseLogo(slot,file){const result=await upload('logo',file);if(result?.asset){const next={...kit,logos:{...kit.logos,[slot]:result.asset.id}};await call({action:'save',kit:next});}}
 async function chooseFont(role,file){const result=await upload('font',file);if(result?.asset){const next={...kit,fonts:{...kit.fonts,[role]:{type:'upload',assetId:result.asset.id,family:familyFromFile(file.name)}}};await call({action:'save',kit:next});}}
 return <div className="commerce-stack brand-kit">
  <style>{style.fontCss}</style>{style.fontLink&&<link rel="stylesheet" href={style.fontLink}/>}
  <div className="settings-pane-layout">
   <form className="settings-pane-form" onSubmit={async e=>{e.preventDefault();if(await call({action:'save',kit}))setSaved(true);}}>
    <header className="settings-pane-heading"><h2>Brand kit</h2><p>Upload your logos and fonts and set your colours once. Invoices use them now, and other client documents will follow.</p></header>
    <section className="brand-kit-section" aria-labelledby="brand-logos"><h3 id="brand-logos">Logos</h3><p className="commerce-muted">PNG, JPG, WebP or SVG, up to 2 MB. A transparent background works best.</p>
     <div className="brand-logo-grid">{logoSlots.map(([slot,label,hint])=><LogoSlot key={slot} slot={slot} label={label} hint={hint} asset={assets.get(kit.logos[slot])} busy={busy} dark={slot==='light'} onChoose={file=>chooseLogo(slot,file)} onRemove={()=>call({action:'remove',assetId:kit.logos[slot]})}/>)}</div>
    </section>
    <section className="brand-kit-section" aria-labelledby="brand-colours"><h3 id="brand-colours">Colours</h3>
     <div className="brand-colour-grid">{colourSlots.map(([slot,label,hint])=>{const value=kit.colours[slot]||'';return <div key={slot} className="brand-colour"><label htmlFor={`brand-colour-${slot}`}><span className="brand-swatch" style={{background:value||'transparent'}}/><strong>{label}</strong><small>{hint}</small></label><div><input id={`brand-colour-${slot}`} type="color" value={value||(slot==='primary'?studio.accent||'#1f2a24':'#ffffff')} onChange={e=>set({colours:{...kit.colours,[slot]:e.target.value}})}/><input aria-label={`${label} colour code`} value={value} placeholder={slot==='primary'?'Uses your studio colour':slot==='secondary'?'A soft tint of primary':''} maxLength={7} onChange={e=>set({colours:{...kit.colours,[slot]:e.target.value.trim()}})}/>{value&&['primary','secondary'].includes(slot)&&<button type="button" className="commerce-link-button" onClick={()=>set({colours:{...kit.colours,[slot]:''}})}>Reset</button>}</div></div>;})}</div>
    </section>
    <section className="brand-kit-section" aria-labelledby="brand-fonts"><h3 id="brand-fonts">Fonts</h3><p className="commerce-muted">Choose from the list or upload your own WOFF2, WOFF, TTF or OTF file up to 4 MB. Only upload fonts your licence allows you to use on documents.</p>
     {fontRoles.map(([role,label])=><FontRole key={role} role={role} label={label} choice={kit.fonts[role]} presets={view.fontPresets} asset={kit.fonts[role].type==='upload'?assets.get(kit.fonts[role].assetId):null} busy={busy} onChange={choice=>set({fonts:{...kit.fonts,[role]:choice}})} onUpload={file=>chooseFont(role,file)}/>)}
    </section>
    {error&&<p className="commerce-error" role="alert">{error}</p>}
    <footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':'Save brand kit'}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}</footer>
   </form>
   <aside className="settings-support"><h3>Preview</h3><BrandPreview studio={studio} style={style}/><p>Logos and fonts are shared with anyone who opens a document from your studio, so clients see them too.</p></aside>
  </div>
 </div>;
}

function LogoSlot({slot,label,hint,asset,busy,dark,onChoose,onRemove}){
 const input=useRef(null);
 return <div className="brand-logo-slot">
  <div className={`brand-logo-tile${dark?' is-dark':''}`}>{asset?<img src={asset.url} alt={`${label} preview`}/>:<span>No file</span>}</div>
  <strong>{label}</strong><small>{hint}</small>
  <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e=>{onChoose(e.target.files[0]);e.target.value='';}} aria-label={`Upload ${label.toLowerCase()}`} data-slot={slot}/>
  <div className="brand-slot-actions"><WorkspaceButton type="button" variant="secondary" size="small" disabled={busy} onClick={()=>input.current?.click()}><Upload size={14}/>{asset?'Replace':'Upload'}</WorkspaceButton>{asset&&<WorkspaceButton type="button" variant="ghost" size="small" iconOnly aria-label={`Remove ${label.toLowerCase()}`} disabled={busy} onClick={onRemove}><Trash2 size={14}/></WorkspaceButton>}</div>
 </div>;
}

function FontRole({role,label,choice,presets,asset,busy,onChange,onUpload}){
 const input=useRef(null);
 const value=choice.type==='upload'?'upload':choice.preset;
 return <div className="brand-font-role">
  <label htmlFor={`brand-font-${role}`}><strong>{label}</strong></label>
  <div className="brand-font-row">
   <select id={`brand-font-${role}`} value={value} disabled={busy} onChange={e=>{if(e.target.value==='upload'){input.current?.click();return;}onChange({type:'preset',preset:e.target.value});}}>
    <optgroup label="Serif">{presets.filter(p=>p.fallback==='serif').map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
    <optgroup label="Sans serif">{presets.filter(p=>p.fallback!=='serif').map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
    {choice.type==='upload'&&<option value="upload">{choice.family} (uploaded)</option>}
    {choice.type!=='upload'&&<option value="upload">Upload a font file…</option>}
   </select>
   <WorkspaceButton type="button" variant="secondary" size="small" disabled={busy} onClick={()=>input.current?.click()}><Upload size={14}/>Upload font</WorkspaceButton>
   <input ref={input} type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" hidden aria-label={`Upload ${label.toLowerCase()} font`} onChange={e=>{onUpload(e.target.files[0]);e.target.value='';}}/>
  </div>
  {choice.type==='upload'&&<div className="brand-font-upload"><label htmlFor={`brand-family-${role}`}>Font name</label><input id={`brand-family-${role}`} value={choice.family} maxLength={60} onChange={e=>onChange({...choice,family:e.target.value})}/>{asset&&<small>{asset.name}</small>}</div>}
 </div>;
}

function BrandPreview({studio,style}){
 const onPrimary=readableOn(style.primary);
 return <div className="brand-preview" style={{background:style.paper,color:style.ink,fontFamily:style.body}}>
  <div className="brand-preview-band" style={{background:style.primary,color:onPrimary}}>{(onPrimary==='#ffffff'?style.lightLogo||style.logo:style.logo)?<img src={onPrimary==='#ffffff'?style.lightLogo||style.logo:style.logo} alt="" className={onPrimary==='#ffffff'&&!style.lightLogo?'invert':''}/>:<strong style={{fontFamily:style.heading}}>{studio.name}</strong>}</div>
  <div className="brand-preview-body"><p className="brand-preview-kicker" style={{color:style.primary}}>Invoice INV-2026-0042</p><h4 style={{fontFamily:style.heading}}>Thank you for choosing {studio.name}.</h4><p>Your deposit secures the date. The balance is due two weeks before the event.</p><div className="brand-preview-panel" style={{background:style.secondary||`color-mix(in srgb, ${style.primary} 12%, white)`}}><span>Amount due</span><strong style={{fontFamily:style.heading,color:style.primary}}>£763.20</strong></div></div>
 </div>;
}
