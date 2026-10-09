// A studio's brand kit: logos, colours and fonts. Shared by the server (to
// validate what is saved) and the browser (to turn the kit into CSS for
// branded documents such as invoices).

export const fontPresets=[
 {key:'instrument-sans',label:'Instrument Sans',family:'Instrument Sans',fallback:'sans-serif',local:'/assets/instrument-sans-latin.woff2'},
 {key:'inter',label:'Inter',family:'Inter',fallback:'sans-serif',google:'Inter:wght@400;500;600;700'},
 {key:'dm-sans',label:'DM Sans',family:'DM Sans',fallback:'sans-serif',google:'DM+Sans:wght@400;500;700'},
 {key:'manrope',label:'Manrope',family:'Manrope',fallback:'sans-serif',google:'Manrope:wght@400;500;700'},
 {key:'space-grotesk',label:'Space Grotesk',family:'Space Grotesk',fallback:'sans-serif',google:'Space+Grotesk:wght@400;500;700'},
 {key:'josefin-sans',label:'Josefin Sans',family:'Josefin Sans',fallback:'sans-serif',google:'Josefin+Sans:wght@400;600;700'},
 {key:'playfair-display',label:'Playfair Display',family:'Playfair Display',fallback:'serif',google:'Playfair+Display:ital,wght@0,400;0,600;1,400'},
 {key:'cormorant-garamond',label:'Cormorant Garamond',family:'Cormorant Garamond',fallback:'serif',google:'Cormorant+Garamond:ital,wght@0,400;0,600;1,400'},
 {key:'fraunces',label:'Fraunces',family:'Fraunces',fallback:'serif',google:'Fraunces:ital,wght@0,400;0,600;1,400'},
 {key:'libre-baskerville',label:'Libre Baskerville',family:'Libre Baskerville',fallback:'serif',google:'Libre+Baskerville:ital,wght@0,400;0,700;1,400'},
 {key:'eb-garamond',label:'EB Garamond',family:'EB Garamond',fallback:'serif',google:'EB+Garamond:ital,wght@0,400;0,600;1,400'},
 {key:'italiana',label:'Italiana',family:'Italiana',fallback:'serif',google:'Italiana'},
];
export const logoSlots=[['primary','Main logo','Used on light backgrounds.'],['light','Light logo','A white or pale version for dark backgrounds.'],['icon','Icon or monogram','A small square mark.']];
export const colourSlots=[['primary','Primary','Your main brand colour. Used for headings and highlights.'],['secondary','Secondary','A supporting colour for panels and details.'],['ink','Text','The colour for body text.'],['paper','Background','The page colour.']];
export const fontRoles=[['heading','Headings'],['body','Body text']];
export const defaultBrandKit={logos:{primary:'',light:'',icon:''},colours:{primary:'',secondary:'',ink:'#1d1f1e',paper:'#ffffff'},fonts:{heading:{type:'preset',preset:'instrument-sans'},body:{type:'preset',preset:'instrument-sans'}}};

const hex=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value.toLowerCase():'';
const assetId=value=>/^[a-f0-9-]{36}$/.test(value||'')?value:'';
const familyName=value=>String(value||'').replace(/[^\p{L}\p{N} ._-]/gu,'').trim().slice(0,60);

// Fills gaps with defaults and drops anything malformed. Strict validation
// with user-facing messages lives on the server.
export function normaliseBrandKit(kit){
 const k=kit||{},out=structuredClone(defaultBrandKit);
 for(const [slot] of logoSlots)out.logos[slot]=assetId(k.logos?.[slot]);
 for(const [slot] of colourSlots)out.colours[slot]=hex(k.colours?.[slot])||out.colours[slot];
 for(const [role] of fontRoles){const f=k.fonts?.[role]||{};out.fonts[role]=f.type==='upload'&&assetId(f.assetId)?{type:'upload',assetId:f.assetId,family:familyName(f.family)||'Brand font',weight:f.weight==='bold'?'bold':'normal'}:{type:'preset',preset:fontPresets.some(p=>p.key===f.preset)?f.preset:'instrument-sans'};}
 return out;
}

export const assetUrl=id=>id?`/api/brand-assets/${id}`:'';

const quote=family=>`'${family.replace(/'/g,'')}'`;
function fontFor(choice,role){
 if(choice.type==='upload')return {stack:`${quote(choice.family)},${role==='heading'?'Georgia,serif':'Arial,sans-serif'}`,face:`@font-face{font-family:${quote(choice.family)};src:url(${assetUrl(choice.assetId)});font-display:swap}`};
 const preset=fontPresets.find(p=>p.key===choice.preset)||fontPresets[0];
 return {stack:`${quote(preset.family)},${preset.fallback==='serif'?'Georgia,serif':'Arial,sans-serif'}`,face:preset.local?`@font-face{font-family:${quote(preset.family)};src:url(${preset.local}) format('woff2');font-weight:400 700;font-display:swap}`:'',google:preset.google||''};
}

// Everything a document needs to wear the brand: font CSS, stacks, colours
// and logo URLs.
export function brandStyle(kit,{fallbackAccent=''}={}){
 const k=normaliseBrandKit(kit),heading=fontFor(k.fonts.heading,'heading'),body=fontFor(k.fonts.body,'body');
 const google=[...new Set([heading.google,body.google].filter(Boolean))];
 return {
  fontCss:[...new Set([heading.face,body.face].filter(Boolean))].join(''),
  fontLink:google.length?`https://fonts.googleapis.com/css2?${google.map(g=>'family='+g).join('&')}&display=swap`:'',
  heading:heading.stack,body:body.stack,
  primary:k.colours.primary||hex(fallbackAccent)||'#1f2a24',secondary:k.colours.secondary||'',ink:k.colours.ink,paper:k.colours.paper,
  logo:assetUrl(k.logos.primary),lightLogo:assetUrl(k.logos.light),icon:assetUrl(k.logos.icon),
 };
}

export function readableOn(color){const value=hex(color)||'#ffffff';const [r,g,b]=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b>.4?'#141414':'#ffffff';}

// How a client form wears the studio's brand. A form's own accent wins;
// without one it uses the Brand kit's primary colour, then the studio accent.
export function formBrand(studio,definition={}){
 const kit=studio?.brandKit?normaliseBrandKit(studio.brandKit):null,style=kit?brandStyle(kit):null;
 const accent=hex(definition.accent)||kit?.colours.primary||(hex(studio?.accent)&&readableOn(studio.accent)==='#ffffff'?hex(studio.accent):'')||'#202326';
 return {accent,onAccent:readableOn(accent),brandColour:kit?.colours.primary||'',heading:style?.heading||'',body:style?.body||'',fontCss:style?.fontCss||'',fontLink:style?.fontLink||''};
}
