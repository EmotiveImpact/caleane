// Layout changes never replace reference metadata, comments or approval records.
export function saveReferenceLayout(project,body){
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 const current=project.referenceLayout||{revision:0,positions:{}};
 if(!Number.isInteger(body.revision)||body.revision!==current.revision)fail(409,'The board layout changed. Reload the saved layout before arranging it again.');
 if(!Array.isArray(body.positions)||body.positions.length>500)fail(400,'Choose up to 500 reference positions.');
 const ids=new Set(project.inspiration.map(item=>item.id)),seen=new Set(),positions={...current.positions};
 for(const item of body.positions){
  if(!item||typeof item.id!=='string'||!ids.has(item.id))fail(400,'Choose a reference from this project.');
  if(seen.has(item.id))fail(400,'Each reference can have one position.');seen.add(item.id);
  if(!['x','y','width','height'].every(key=>typeof item[key]==='number'&&Number.isFinite(item[key])))fail(400,'Use valid board coordinates.');
  if(item.x<0||item.y<0||item.width<180||item.width>600||item.height<200||item.height>700||item.x+item.width>6000||item.y+item.height>12000)fail(400,'Keep references inside the board and use a supported size.');
  if(item.rotation!==undefined&&(typeof item.rotation!=='number'||!Number.isFinite(item.rotation)||Math.abs(item.rotation)>360))fail(400,'Use a valid rotation.');
  positions[item.id]={rotation:Math.round(item.rotation||0),x:Math.round(item.x),y:Math.round(item.y),width:Math.round(item.width),height:Math.round(item.height)};
 }
 return {revision:current.revision+1,positions};
}
