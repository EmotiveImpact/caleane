import React,{createContext,useContext,useMemo} from 'react';
import {brandStyle,defaultBrandKit} from '../lib/brand-kit';
import {accentContrast} from '../lib/accent-theme.js';

// The studio's brand kit on what clients read: estimates, proposals, contracts and the
// client portal. Only what the studio has set changes the page, so a studio with no kit
// sees its name at the top of each document and nothing else moves.
const Brand=createContext(null);

export function documentBrand(studio){
 const kit=studio?.brandKit;if(!studio||!kit)return null;
 const style=brandStyle(kit,{fallbackAccent:studio.accent}),plain=defaultBrandKit.colours;
 return {...style,name:studio.name,
  fonts:JSON.stringify(kit.fonts)!==JSON.stringify(defaultBrandKit.fonts),
  // A pale primary colour would make headings hard to read, so it only colours them when it is dark enough.
  colour:!!kit.colours?.primary&&accentContrast(style.primary)>=3,
  ink:kit.colours?.ink&&kit.colours.ink!==plain.ink?style.ink:'',
  paper:kit.colours?.paper&&kit.colours.paper!==plain.paper?style.paper:''};
}

// Class names and CSS variables for a branded document. The styles only read a
// variable when its class is present, so an unset part of the kit changes nothing.
export function brandProps(brand){
 if(!brand)return {className:'',style:undefined};
 return {
  className:['doc-branded',brand.fonts&&'doc-brand-fonts',brand.colour&&'doc-brand-colour',brand.ink&&'doc-brand-ink',brand.paper&&'doc-brand-paper'].filter(Boolean).join(' '),
  style:{'--brand-heading':brand.heading,'--brand-body':brand.body,'--brand-primary':brand.primary,'--brand-ink':brand.ink||undefined,'--brand-paper':brand.paper||undefined},
 };
}

export function DocumentBrandProvider({studio,children}){
 const brand=useMemo(()=>documentBrand(studio),[studio]);
 return <Brand.Provider value={brand}>
  {brand?.fonts&&brand.fontCss&&<style>{brand.fontCss}</style>}{brand?.fonts&&brand.fontLink&&<link rel="stylesheet" href={brand.fontLink}/>}
  {children}
 </Brand.Provider>;
}
export const useDocumentBrand=()=>useContext(Brand);

// The letterhead at the top of a client document: the studio's logo, or its name.
export function BrandMasthead({brand,className=''}){
 if(!brand)return null;
 return <div className={`doc-brand-masthead ${className}`.trim()}>{brand.logo?<img src={brand.logo} alt={brand.name}/>:<span>{brand.name}</span>}</div>;
}
