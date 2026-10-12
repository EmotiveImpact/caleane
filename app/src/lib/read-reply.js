// Public pages read server replies through this, so a proxy error page or an empty
// body shows a plain sentence instead of "Unexpected token <".
export async function readReply(response){
 let data=null;try{data=await response.json();}catch{data=null;}
 if(data&&typeof data==='object')return data;
 throw Object.assign(new Error(response.status===413?'That file is too large to upload.':'Caleane could not reach the server. Please try again.'),{status:response.status});
}
