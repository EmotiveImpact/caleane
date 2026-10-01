const text=value=>String(value??'').toLocaleLowerCase('en-GB');
const matches=(query,...values)=>values.some(value=>text(value).includes(query));
const rank=(query,title,subtitle='')=>{const main=text(title),secondary=text(subtitle);return main===query?0:main.startsWith(query)?1:main.includes(query)?2:secondary.includes(query)?3:4;};
const top=(items,query)=>items.sort((a,b)=>rank(query,a.title,a.subtitle)-rank(query,b.title,b.subtitle)||a.title.localeCompare(b.title)).slice(0,8);

export function searchWorkspace(db,studioId,rawQuery){
 const query=rawQuery.trim().toLocaleLowerCase('en-GB');
 if(query.length<2)return {query:rawQuery,groups:[],total:0};
 const projects=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studioId).map(row=>JSON.parse(row.data)).filter(project=>matches(query,project.title,project.brief?.name,project.brief?.occasion,project.brief?.venue,project.brief?.vision)).map(project=>({type:'project',id:project.id,title:project.title,subtitle:[project.brief?.name,project.brief?.occasion].filter(Boolean).join(' · '),meta:project.status}));
 const clients=db.prepare('SELECT id,name,email,data FROM clients WHERE studio_id=?').all(studioId).map(row=>({...row,details:JSON.parse(row.data)})).filter(client=>matches(query,client.name,client.email,client.details.company)).map(client=>({type:'client',id:client.id,title:client.name,subtitle:[client.details.company,client.email].filter(Boolean).join(' · '),meta:client.details.stage||'Client'}));
 const opportunities=db.prepare('SELECT o.id,o.title,o.description,o.stage,o.client_id,c.name AS client_name FROM crm_opportunities o JOIN clients c ON c.id=o.client_id AND c.studio_id=o.studio_id WHERE o.studio_id=?').all(studioId).filter(item=>matches(query,item.title,item.description,item.client_name)).map(item=>({type:'opportunity',id:item.id,clientId:item.client_id,title:item.title,subtitle:item.client_name,meta:item.stage}));
 const tasks=db.prepare('SELECT t.id,t.title,t.detail,t.due_date,t.completed,t.client_id,c.name AS client_name FROM crm_tasks t JOIN clients c ON c.id=t.client_id AND c.studio_id=t.studio_id WHERE t.studio_id=?').all(studioId).filter(item=>matches(query,item.title,item.detail,item.client_name)).map(item=>({type:'task',id:item.id,clientId:item.client_id,title:item.title,subtitle:item.client_name,meta:item.completed?'Complete':item.due_date||'Next step'}));
 const invoices=db.prepare('SELECT i.id,i.number,i.kind,i.project_id,p.data AS project_data FROM invoices i JOIN projects p ON p.id=i.project_id AND p.studio_id=i.studio_id WHERE i.studio_id=?').all(studioId).map(item=>({...item,project:JSON.parse(item.project_data)})).filter(item=>matches(query,item.number,item.project.title,item.project.brief?.name)).map(item=>({type:'invoice',id:item.id,projectId:item.project_id,title:item.number,subtitle:item.project.title,meta:item.kind}));
 const all=[['Projects',projects],['Clients',clients],['Opportunities',opportunities],['Next steps',tasks],['Invoices',invoices]];
 return {query:rawQuery,groups:all.filter(([,items])=>items.length).map(([label,items])=>({label,items:top(items,query)})),total:all.reduce((sum,[,items])=>sum+items.length,0)};
}
