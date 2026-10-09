import {now} from './store.mjs';
import {readSetting,writeSetting} from './studio-commerce.mjs';
import {assetUrl,colourSlots,fontPresets,fontRoles,logoSlots,normaliseBrandKit} from './src/lib/brand-kit.js';

const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const MAX_ASSETS=16,MAX_BYTES={logo:2*1024*1024,font:4*1024*1024};

export function installBrandKit(db){db.exec(`CREATE TABLE IF NOT EXISTS brand_assets(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('logo','font')),name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS brand_assets_studio ON brand_assets(studio_id);`);}

// Identify the file from its bytes, never from the name or the browser's claim.
function sniff(kind,data){
 const head=data.subarray(0,12),ascii=head.toString('latin1');
 if(kind==='logo'){
  if(head[0]===0x89&&ascii.slice(1,4)==='PNG')return 'image/png';
  if(head[0]===0xff&&head[1]===0xd8&&head[2]===0xff)return 'image/jpeg';
  if(ascii.slice(0,4)==='RIFF'&&ascii.slice(8,12)==='WEBP')return 'image/webp';
  const text=data.subarray(0,512).toString('utf8').replace(/^\uFEFF/,'').trimStart();
  if(/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text))return 'image/svg+xml';
  return '';
 }
 if(ascii.slice(0,4)==='wOF2')return 'font/woff2';
 if(ascii.slice(0,4)==='wOFF')return 'font/woff';
 if(ascii.slice(0,4)==='OTTO')return 'font/otf';
 if((head[0]===0&&head[1]===1&&head[2]===0&&head[3]===0)||ascii.slice(0,4)==='true')return 'font/ttf';
 return '';
}

const assetDTO=row=>({id:row.id,kind:row.kind,name:row.name,mime:row.mime,url:assetUrl(row.id),createdAt:row.created_at});
export function brandKit(db,studioId){return normaliseBrandKit(readSetting(db,studioId,'brand_kit',{}));}
export function brandKitView(db,studioId){return {kit:brandKit(db,studioId),assets:db.prepare('SELECT id,kind,name,mime,created_at FROM brand_assets WHERE studio_id=? ORDER BY created_at').all(studioId).map(assetDTO),fontPresets:fontPresets.map(({key,label,fallback})=>({key,label,fallback}))};}

function uploadAsset(db,studioId,body){
 if(!['logo','font'].includes(body.kind))fail(400,'Choose a logo or a font file.');
 const name=typeof body.name==='string'?body.name.trim().slice(0,120):'';
 const limit=MAX_BYTES[body.kind],tooBig=`Choose a ${body.kind==='font'?'font file under 4 MB':'logo under 2 MB'}.`;
 if(!name||typeof body.content!=='string'||body.content.length>limit*1.4)fail(400,tooBig);
 const data=Buffer.from(body.content,'base64');if(data.length<16||data.length>limit)fail(400,tooBig);
 const mime=sniff(body.kind,data);
 if(!mime)fail(400,body.kind==='logo'?'Logos must be PNG, JPG, WebP or SVG files.':'Fonts must be WOFF2, WOFF, TTF or OTF files.');
 const count=db.prepare('SELECT COUNT(*) AS n FROM brand_assets WHERE studio_id=?').get(studioId).n;if(count>=MAX_ASSETS)fail(400,'Your brand kit is full. Remove a file you no longer use first.');
 const row={id:crypto.randomUUID(),studio_id:studioId,kind:body.kind,name,mime,created_at:now()};
 db.prepare('INSERT INTO brand_assets VALUES(?,?,?,?,?,?,?)').run(row.id,studioId,row.kind,name,mime,data,row.created_at);
 return assetDTO(row);
}

// The primary logo in the brand kit is the logo clients see on the portal, forms and booking pages.
// It is a full address because forms can be embedded on the studio's own website.
function syncPortalLogo(db,studioId,origin){
 const row=db.prepare('SELECT data FROM studio_branding WHERE studio_id=?').get(studioId),brand=JSON.parse(row?.data||'{}'),primary=brandKit(db,studioId).logos?.primary||'';
 const next=primary?origin+assetUrl(primary):(String(brand.logoUrl||'').includes('/api/brand-assets/')?'':brand.logoUrl||'');
 if(next===(brand.logoUrl||''))return;
 db.prepare('INSERT INTO studio_branding VALUES(?,?) ON CONFLICT(studio_id) DO UPDATE SET data=excluded.data').run(studioId,JSON.stringify({...brand,logoUrl:next}));
}
function saveKit(db,studioId,kit){
 if(!kit||typeof kit!=='object')fail(400,'Check your brand kit.');
 const owned=new Map(db.prepare('SELECT id,kind FROM brand_assets WHERE studio_id=?').all(studioId).map(r=>[r.id,r.kind]));
 for(const [slot,label] of logoSlots){const value=kit.logos?.[slot]||'';if(value&&owned.get(value)!=='logo')fail(400,`Upload the ${label.toLowerCase()} again.`);}
 for(const [slot,label] of colourSlots){const value=kit.colours?.[slot]||'';if(value&&!/^#[0-9a-f]{6}$/i.test(value))fail(400,`Use a colour like #1f2a24 for ${label.toLowerCase()}.`);}
 for(const [role,label] of fontRoles){const f=kit.fonts?.[role];if(!f)continue;
  if(f.type==='upload'){if(owned.get(f.assetId)!=='font')fail(400,`Upload the ${label.toLowerCase()} font again.`);if(typeof f.family!=='string'||!f.family.trim()||f.family.length>60)fail(400,`Name the ${label.toLowerCase()} font.`);}
  else if(!fontPresets.some(p=>p.key===f.preset))fail(400,`Choose a ${label.toLowerCase()} font.`);}
 return writeSetting(db,studioId,'brand_kit',normaliseBrandKit(kit));
}

function removeAsset(db,studioId,assetId){
 const kit=brandKit(db,studioId);
 for(const [slot] of logoSlots)if(kit.logos[slot]===assetId)kit.logos[slot]='';
 for(const [role] of fontRoles)if(kit.fonts[role].type==='upload'&&kit.fonts[role].assetId===assetId)kit.fonts[role]={type:'preset',preset:'instrument-sans'};
 writeSetting(db,studioId,'brand_kit',kit);
 db.prepare('DELETE FROM brand_assets WHERE id=? AND studio_id=?').run(assetId,studioId);
}

// Brand files appear on client-facing pages and documents, so they are served
// without a session. Ids are random and files are served inert.
export function serveBrandAsset(db,res,assetId){
 const row=/^[a-f0-9-]{36}$/.test(assetId)?db.prepare('SELECT mime,content FROM brand_assets WHERE id=?').get(assetId):null;
 if(!row)fail(404,'File not found.');
 res.writeHead(200,{'Content-Type':row.mime,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*'});
 res.end(Buffer.from(row.content));return true;
}

export function handleBrandKit({db,req,route,body,studio,owner,reply,origin=''}){
 if(route!=='/api/brand-kit')return false;
 installBrandKit(db);
 if(req.method==='GET')return reply(200,brandKitView(db,studio.id)),true;
 if(req.method!=='POST')fail(405,'Method not allowed.');
 if(!owner)fail(403,'Only the studio owner can change the brand kit.');
 if(body.action==='upload'){const asset=uploadAsset(db,studio.id,body);return reply(201,{...brandKitView(db,studio.id),asset}),true;}
 if(body.action==='save'){saveKit(db,studio.id,body.kit);syncPortalLogo(db,studio.id,origin);return reply(200,brandKitView(db,studio.id)),true;}
 if(body.action==='remove'){removeAsset(db,studio.id,String(body.assetId||''));syncPortalLogo(db,studio.id,origin);return reply(200,brandKitView(db,studio.id)),true;}
 fail(400,'Unknown brand kit action.');
}
