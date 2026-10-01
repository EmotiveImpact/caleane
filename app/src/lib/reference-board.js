const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export const normalRotation=value=>((Math.round(value||0)+180)%360+360)%360-180;
export function boundsOf(pos){
 const angle=(pos.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const corners=[[0,0],[pos.width*c,pos.width*s],[-pos.height*s,pos.height*c],[pos.width*c-pos.height*s,pos.width*s+pos.height*c]];
 return {left:pos.x+Math.min(...corners.map(v=>v[0])),top:pos.y+Math.min(...corners.map(v=>v[1])),right:pos.x+Math.max(...corners.map(v=>v[0])),bottom:pos.y+Math.max(...corners.map(v=>v[1]))};
}
export function constrainPosition(pos){
 const next={x:0,y:0,width:clamp(Math.round(pos.width)||276,180,600),height:clamp(Math.round(pos.height)||332,200,700),rotation:normalRotation(pos.rotation)};
 const box=boundsOf(next);
 next.x=clamp(Math.round(pos.x)||0,Math.ceil(Math.max(0,-box.left)),Math.floor(6000-Math.max(next.width,box.right)));
 next.y=clamp(Math.round(pos.y)||0,Math.ceil(Math.max(0,-box.top)),Math.floor(12000-Math.max(next.height,box.bottom)));
 return next;
}
export function startingPositions(p){
 const positions={},saved=p.referenceLayout?.positions||{};
 for(const item of p.inspiration)if(saved[item.id])positions[item.id]={rotation:0,...saved[item.id]};
 const bottom=Math.max(0,...Object.values(positions).map(pos=>boundsOf(pos).bottom));
 const columns=[0,0,0].map(()=>bottom?bottom+28:28);
 [...p.inspiration].reverse().filter(item=>!positions[item.id]).forEach((item,index)=>{
  const column=columns.indexOf(Math.min(...columns)),height=[332,268,380][index%3];
  positions[item.id]=constrainPosition({x:28+column*304,y:columns[column],width:276,height,rotation:0});columns[column]+=height+28;
 });
 return positions;
}
export function mergePositions(p,draft){
 const positions=startingPositions(p);
 for(const item of p.inspiration)if(draft?.[item.id])positions[item.id]=draft[item.id];
 return positions;
}
export function samePositions(a,b){return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(id=>b[id]&&['x','y','width','height','rotation'].every(key=>(a[id][key]||0)===(b[id][key]||0)));}
export function fitCamera(items,positions,size){
 if(!items.length)return {x:28,y:28,scale:1};
 const bounds=items.filter(item=>positions[item.id]).map(item=>boundsOf(positions[item.id]));
 const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top)),right=Math.max(...bounds.map(b=>b.right)),bottom=Math.max(...bounds.map(b=>b.bottom));
 const scale=clamp(Math.min((size.width-96)/(right-left),(size.height-96)/(bottom-top)),.05,1);
 return {scale,x:(size.width-(right-left)*scale)/2-left*scale,y:(size.height-(bottom-top)*scale)/2-top*scale};
}
export function zoomCamera(camera,scale,point){
 scale=clamp(scale,.05,2);
 return {scale,x:point.x-(point.x-camera.x)*scale/camera.scale,y:point.y-(point.y-camera.y)*scale/camera.scale};
}
export function tidyPositions(items,positions){
 const next={...positions},columns=Math.min(3,items.length),columnWidths=Array.from({length:columns},(_,col)=>Math.max(...items.filter((_,i)=>i%columns===col).map(item=>positions[item.id].width)));
 const tops=Array(columns).fill(28);
 items.forEach((item,i)=>{const col=i%columns;next[item.id]=constrainPosition({...positions[item.id],rotation:0,x:28+columnWidths.slice(0,col).reduce((sum,width)=>sum+width+28,0),y:tops[col]});tops[col]+=next[item.id].height+28;});
 return next;
}
