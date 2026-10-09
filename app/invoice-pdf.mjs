import PDFDocument from 'pdfkit';
import {invoiceModel} from './src/lib/invoice-design.js';

// A real PDF file of an invoice or credit note, drawn on the server with
// pdfkit so it works on any Node host without a browser. It is a clean A4
// page in the studio's brand: logo, colour, the same figures and wording as
// the on-screen design (both come from invoiceModel), in the standard PDF
// typefaces rather than the six on-screen layouts.
const hex=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'';
const rgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
const mixHex=(color,amount,base='#ffffff')=>{const a=rgb(color),b=rgb(base);return '#'+a.map((c,i)=>Math.round(c*amount+b[i]*(1-amount)).toString(16).padStart(2,'0')).join('');};
// The standard PDF fonts cover Western European text; swap the few characters they lack.
const plain=value=>String(value??'').replace(/\u2212/g,'-').replace(/[\u2010-\u2015]/g,'-').replace(/[^\n\x20-\x7e\u00a0-\u00ff\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g,'');

function logoImage(db,model){
 const match=/^\/api\/brand-assets\/([a-f0-9-]{36})$/.exec(model.logo||'');if(!match||!db)return null;
 const row=db.prepare("SELECT mime,content FROM brand_assets WHERE id=? AND kind='logo'").get(match[1]);
 return row&&['image/png','image/jpeg'].includes(row.mime)?Buffer.from(row.content):null;
}

export function invoicePdf(invoice,{db,studio={},design,brandKit,estimate,creditNote}={}){
 const m=invoiceModel(invoice,{studio,design,brandKit,estimate,creditNote});
 const accent=hex(m.accent)||'#1f2a24',ink=hex(m.ink)||'#1d1f1e',paper=hex(m.paper)||'#ffffff',panel=hex(m.brand.secondary)||mixHex(accent,.1,paper),muted=mixHex(ink,.6,paper),rule=mixHex(ink,.14,paper);
 const serif=m.d.font==='serif',regular=serif?'Times-Roman':'Helvetica',bold=serif?'Times-Bold':'Helvetica-Bold',italic=serif?'Times-Italic':'Helvetica-Oblique';
 const logo=m.d.showLogo?logoImage(db,m):null;
 return new Promise((resolve,reject)=>{
  const pdf=new PDFDocument({size:'A4',margin:0,info:{Title:plain(`${m.label} ${m.number}`),Author:plain(m.seller),Creator:'Caleane'}}),chunks=[];
  pdf.on('data',c=>chunks.push(c));pdf.on('error',reject);pdf.on('end',()=>resolve(Buffer.concat(chunks)));
  const W=pdf.page.width,H=pdf.page.height,X=48,R=W-48,inner=R-X,bottom=H-64;
  const fresh=()=>{pdf.rect(0,0,W,H).fill(paper);pdf.rect(0,0,W,6).fill(accent);};
  let y=0;const room=need=>{if(y+need>bottom){pdf.addPage({size:'A4',margin:0});fresh();y=48;}};
  const text=(value,x,top,options={},font=regular,size=9.5,color=ink)=>{pdf.font(font).fontSize(size).fillColor(color).text(plain(value),x,top,{lineBreak:true,...options});return pdf.y;};
  const label=(value,x,top,width)=>text(String(value).toUpperCase(),x,top,{width,characterSpacing:1.2},bold,7,muted);
  fresh();
  // Header: logo or name on the left, document type and number on the right.
  y=40;let headBottom=y;
  if(logo){try{pdf.image(logo,X,y,{fit:[170,54],align:'left',valign:'top'});headBottom=y+54;}catch{headBottom=text(m.seller,X,y,{width:inner/2},bold,18,accent);}}
  else headBottom=text(m.seller,X,y,{width:inner/2},bold,18,accent);
  text(m.label.toUpperCase(),X+inner/2,y,{width:inner/2,align:'right',characterSpacing:2},bold,9,accent);
  const numberBottom=text(m.number,X+inner/2,y+14,{width:inner/2,align:'right'},bold,20,ink);
  y=Math.max(headBottom,numberBottom)+14;
  if(m.stamp){pdf.save();pdf.rotate(-8,{origin:[R-60,y+6]});pdf.roundedRect(R-120,y-8,112,28,3).lineWidth(2).strokeColor(accent).stroke();text(m.stamp.toUpperCase(),R-120,y,{width:112,align:'center',characterSpacing:2},bold,12,accent);pdf.restore();}
  pdf.moveTo(X,y).lineTo(R,y).lineWidth(1.5).strokeColor(accent).stroke();y+=14;
  // Dates.
  const col=inner/Math.max(1,m.meta.length);
  m.meta.forEach(([k,v],i)=>{label(k,X+i*col,y,col-12);text(v,X+i*col,y+11,{width:col-12},bold,10);});
  y+=34;pdf.moveTo(X,y).lineTo(R,y).lineWidth(.5).strokeColor(rule).stroke();y+=14;
  // Parties.
  const half=inner/2-12;let partyBottom=y;
  for(const [p,x] of [[m.from,X],[m.to,X+inner/2+12]]){label(p.label,x,y,half);let py=text(p.name,x,y+11,{width:half},bold,11);py=p.address?text(p.address,x,py+2,{width:half}):py;for(const line of p.small)py=text(line,x,py+1,{width:half},regular,8.5,muted);partyBottom=Math.max(partyBottom,py);}
  y=partyBottom+14;
  if(m.project){label('Project',X,y,inner);y=text(m.project,X,y+11,{width:inner},regular,10.5)+12;}
  // Items.
  const t=m.table,wide=t.head.length===4,cols=wide?[X,X+inner-230,X+inner-150,X+inner-80]:[X,X+inner-110],widths=wide?[inner-240,60,70,80]:[inner-120,110];
  room(40);t.head.forEach((h,i)=>text(h.toUpperCase(),cols[i],y,{width:widths[i],align:i?'right':'left',characterSpacing:1.2},bold,7,muted));
  y+=13;pdf.moveTo(X,y).lineTo(R,y).lineWidth(1).strokeColor(accent).stroke();y+=8;
  for(const row of t.rows){
   room(30);let rowBottom;
   if(wide){const [title,detail,qty,unit,amount]=row;rowBottom=text(title,cols[0],y,{width:widths[0]});if(detail)rowBottom=text(detail,cols[0],rowBottom+1,{width:widths[0]},regular,8.5,muted);[qty,unit,amount].forEach((v,i)=>text(v,cols[i+1],y,{width:widths[i+1],align:'right'}));}
   else{const [title,detail,amount]=row;rowBottom=text(title,cols[0],y,{width:widths[0]},bold,10);if(detail)rowBottom=text(detail,cols[0],rowBottom+1,{width:widths[0]},regular,8.5,muted);text(amount,cols[1],y,{width:widths[1],align:'right'},regular,10);}
   y=rowBottom+7;pdf.moveTo(X,y).lineTo(R,y).lineWidth(.5).strokeColor(rule).stroke();y+=7;
  }
  if(t.part){
   room(50);text(t.part.total[0],X,y,{width:inner-100},regular,9,muted);text(t.part.total[1],R-100,y,{width:100,align:'right'},regular,9,muted);y+=16;
   pdf.roundedRect(X,y-4,inner,34,3).fill(panel);text(t.part.line[0],X+10,y+1,{width:inner-130},bold,10);text(t.part.line[1],X+10,y+14,{width:inner-130},regular,8,muted);text(t.part.line[2],R-110,y+1,{width:100,align:'right'},bold,10);y+=40;
  }
  // Totals.
  const TX=R-230;room(30+m.totals.length*15);y+=6;
  for(const [k,v,c] of m.totals){text(k,TX,y,{width:140},c?bold:regular,9.5,c?ink:muted);text(v,TX+140,y,{width:90,align:'right'},c?bold:regular,9.5,c?ink:muted);y+=15;}
  y+=4;pdf.moveTo(TX,y).lineTo(R,y).lineWidth(1.5).strokeColor(accent).stroke();y+=10;
  text(m.due[0],TX,y+5,{width:120},bold,10.5);text(m.due[1],TX+100,y,{width:130,align:'right'},bold,18,accent);y+=34;
  // How to pay and notes.
  if(m.pay){
   const lines=[m.pay.text,m.pay.by,m.pay.terms].filter(Boolean),bodyHeight=pdf.font(regular).fontSize(9).heightOfString(plain(lines.join('\n')),{width:inner/2-28});
   room(bodyHeight+40);pdf.roundedRect(X,y,inner/2,bodyHeight+34,4).fill(panel);label('How to pay',X+14,y+12,inner/2-28);let py=text(m.pay.text,X+14,y+24,{width:inner/2-28},regular,9);
   for(const line of [m.pay.by,m.pay.terms].filter(Boolean))py=text(line,X+14,py+2,{width:inner/2-28},regular,8.5,muted);
   if(m.note){label(m.kind==='credit'?'About this credit':'Notes',X+inner/2+20,y+12,inner/2-20);text(m.note,X+inner/2+20,y+24,{width:inner/2-20},regular,9);}
   y+=bodyHeight+48;
  }else if(m.note){room(50);label(m.kind==='credit'?'About this credit':'Notes',X,y,inner);y=text(m.note,X,y+12,{width:inner},regular,9.5)+16;}
  if(m.thanks&&m.kind==='invoice'){room(30);text(m.thanks,X,y,{width:inner,align:'center'},italic,14,accent);}
  // Footer on the last page.
  const footY=H-44;pdf.moveTo(X,footY-8).lineTo(R,footY-8).lineWidth(.5).strokeColor(rule).stroke();
  if(m.footer)text(m.footer,X,footY,{width:inner*.68,height:30,ellipsis:true},regular,7.5,muted);
  text(`${m.seller} · ${m.number}`,X+inner*.7,footY,{width:inner*.3,align:'right'},regular,7.5,muted);
  pdf.end();
 });
}

export const pdfFileName=(label,number)=>`${label} ${number}`.replace(/[^a-z0-9 -]/gi,'').trim().replace(/\s+/g,'-')+'.pdf';
