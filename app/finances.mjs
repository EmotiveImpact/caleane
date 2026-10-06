import {id,now,transaction} from './store.mjs';
import {currencies} from './studio-commerce.mjs';
import {EXPENSE_CATEGORIES,financeReport} from './src/lib/finance-report.js';

const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const MAX_RECEIPT=5*1024*1024,MAX_AMOUNT=100000000;

export function installFinances(db){db.exec(`
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,studio_id TEXT NOT NULL REFERENCES studios(id),project_id TEXT,
  spent_on TEXT NOT NULL,description TEXT NOT NULL,supplier TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('GBP','EUR','USD')),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS expenses_studio_date ON expenses(studio_id,spent_on DESC);
 CREATE INDEX IF NOT EXISTS expenses_project ON expenses(studio_id,project_id);
 CREATE TABLE IF NOT EXISTS expense_receipts(expense_id TEXT PRIMARY KEY REFERENCES expenses(id) ON DELETE CASCADE,studio_id TEXT NOT NULL,
  name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);`);}

// Identify a receipt from its bytes, never from the name or the browser's claim.
function sniffReceipt(data){
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return 'image/jpeg';
 if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(data.toString('ascii',0,5)==='%PDF-')return 'application/pdf';
 return '';
}
const text=(value,max,label,required=false)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max)fail(400,`Check ${label}.`);const out=value.trim();if(required&&!out)fail(400,`Add ${label}.`);return out;};
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

function expenseDTO(row){return {id:row.id,projectId:row.project_id||'',spentOn:row.spent_on,description:row.description,supplier:row.supplier,category:row.category,currency:row.currency,amountMinor:row.amount_minor,receipt:row.receipt_mime?{name:row.receipt_name,mime:row.receipt_mime,size:row.receipt_size}:null,createdAt:row.created_at,updatedAt:row.updated_at};}
const SELECT=`SELECT e.*,r.name AS receipt_name,r.mime AS receipt_mime,length(r.content) AS receipt_size FROM expenses e LEFT JOIN expense_receipts r ON r.expense_id=e.id AND r.studio_id=e.studio_id`;
export function listExpenses(db,studioId,projectId=''){return (projectId?db.prepare(`${SELECT} WHERE e.studio_id=? AND e.project_id=? ORDER BY e.spent_on DESC,e.created_at DESC`).all(studioId,projectId):db.prepare(`${SELECT} WHERE e.studio_id=? ORDER BY e.spent_on DESC,e.created_at DESC`).all(studioId)).map(expenseDTO);}
const getExpense=(db,studioId,expenseId)=>{const row=db.prepare(`${SELECT} WHERE e.studio_id=? AND e.id=?`).get(studioId,expenseId);if(!row)fail(404,'That cost could not be found.');return row;};

function fields(db,studioId,body){
 const amountMinor=body.amountMinor;
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>MAX_AMOUNT)fail(400,'Enter an amount above zero.');
 if(!currencies.includes(body.currency))fail(400,'Choose a supported currency.');
 if(!validDay(body.spentOn))fail(400,'Enter the date of the cost.');
 if(!EXPENSE_CATEGORIES.includes(body.category))fail(400,'Choose a category.');
 const projectId=body.projectId?text(body.projectId,100,'the project'):'';
 if(projectId&&!db.prepare('SELECT 1 FROM projects WHERE id=? AND studio_id=?').get(projectId,studioId))fail(400,'Choose one of your projects, or leave it as a studio overhead.');
 return {amountMinor,currency:body.currency,spentOn:body.spentOn,category:body.category,projectId,description:text(body.description,200,'what the cost was for',true),supplier:text(body.supplier,120,'the supplier')};
}
function receipt(body){
 const file=body.receipt;
 if(!file||typeof file!=='object')fail(400,'Choose a receipt file.');
 const name=text(file.name,160,'the receipt name',true),tooBig='Choose a receipt under 5 MB.';
 if(typeof file.content!=='string'||file.content.length>MAX_RECEIPT*1.4)fail(400,tooBig);
 const data=Buffer.from(file.content,'base64');if(data.length<12||data.length>MAX_RECEIPT)fail(400,tooBig);
 const mime=sniffReceipt(data);if(!mime)fail(400,'Receipts must be a photo (JPG, PNG or WebP) or a PDF.');
 return {name,mime,data};
}
const saveReceipt=(db,studioId,expenseId,file)=>db.prepare('INSERT INTO expense_receipts VALUES(?,?,?,?,?,?) ON CONFLICT(expense_id) DO UPDATE SET name=excluded.name,mime=excluded.mime,content=excluded.content,created_at=excluded.created_at').run(expenseId,studioId,file.name,file.mime,file.data,now());

function changeExpense(db,{studioId,userId},body){
 if(body.action==='create'){
  const f=fields(db,studioId,body),file=body.receipt?receipt(body):null,expenseId=id(),at=now();
  transaction(db,()=>{db.prepare('INSERT INTO expenses VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(expenseId,studioId,f.projectId||null,f.spentOn,f.description,f.supplier,f.category,f.currency,f.amountMinor,userId,at,at);if(file)saveReceipt(db,studioId,expenseId,file);});
  return expenseDTO(getExpense(db,studioId,expenseId));
 }
 const existing=getExpense(db,studioId,text(body.id,100,'the cost'));
 if(body.action==='update'){
  const f=fields(db,studioId,body),file=body.receipt?receipt(body):null;
  transaction(db,()=>{db.prepare('UPDATE expenses SET project_id=?,spent_on=?,description=?,supplier=?,category=?,currency=?,amount_minor=?,updated_at=? WHERE id=? AND studio_id=?').run(f.projectId||null,f.spentOn,f.description,f.supplier,f.category,f.currency,f.amountMinor,now(),existing.id,studioId);if(file)saveReceipt(db,studioId,existing.id,file);else if(body.removeReceipt===true)db.prepare('DELETE FROM expense_receipts WHERE expense_id=? AND studio_id=?').run(existing.id,studioId);});
  return expenseDTO(getExpense(db,studioId,existing.id));
 }
 if(body.action==='delete'){transaction(db,()=>{db.prepare('DELETE FROM expense_receipts WHERE expense_id=? AND studio_id=?').run(existing.id,studioId);db.prepare('DELETE FROM expenses WHERE id=? AND studio_id=?').run(existing.id,studioId);});return null;}
 fail(400,'Unknown action.');
}

function reportInputs(db,studioId){
 const projects=db.prepare('SELECT data FROM projects WHERE studio_id=?').all(studioId).map(row=>{const p=JSON.parse(row.data);return {id:p.id,title:p.title,client:p.brief?.name||''};});
 const opportunities=db.prepare('SELECT source,stage,created_at FROM crm_opportunities WHERE studio_id=?').all(studioId).map(row=>({source:row.source,stage:row.stage,createdAt:row.created_at}));
 return {projects,opportunities};
}

// Costs and reports are the studio's own books: the owner manages them and a bookkeeper can read them.
// Clients, project approvers and studio viewers never do.
export async function handleFinances({db,req,res,url,route,body,studio,owner,bookkeeper=false,user,reply,listInvoices}){
 const receiptMatch=route.match(/^\/api\/expenses\/([a-f0-9-]{36})\/receipt$/);
 if(route!=='/api/expenses'&&route!=='/api/finance-report'&&!receiptMatch)return false;
 if(!owner&&!(bookkeeper&&req.method==='GET'))fail(403,'Only the studio owner can see costs and reports.');
 if(receiptMatch){
  if(req.method!=='GET')fail(405,'Method not allowed.');
  const row=db.prepare('SELECT r.name,r.mime,r.content FROM expense_receipts r JOIN expenses e ON e.id=r.expense_id AND e.studio_id=r.studio_id WHERE r.expense_id=? AND r.studio_id=?').get(receiptMatch[1],studio.id);
  if(!row)fail(404,'Receipt not found.');
  res.writeHead(200,{'Content-Type':row.mime,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"});
  res.end(Buffer.from(row.content));return true;
 }
 if(route==='/api/expenses'){
  if(req.method==='GET'){const projectId=url.searchParams.get('project')||'';return reply(200,{expenses:listExpenses(db,studio.id,projectId),categories:EXPENSE_CATEGORIES,currencies}),true;}
  if(req.method!=='POST')fail(405,'Method not allowed.');
  const expense=changeExpense(db,{studioId:studio.id,userId:user.id},body);
  return reply(body.action==='create'?201:200,{expense,expenses:listExpenses(db,studio.id)}),true;
 }
 if(req.method!=='GET')fail(405,'Method not allowed.');
 const period=url.searchParams.get('period')||'12m',today=String(url.searchParams.get('today')||'');
 const day=validDay(today)?today:now().slice(0,10);
 return reply(200,{report:financeReport({...reportInputs(db,studio.id),invoices:listInvoices(),expenses:listExpenses(db,studio.id),period,today:day})}),true;
}
