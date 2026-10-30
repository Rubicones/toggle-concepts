/** Decode API responses without exposing HTML error pages or raw parser errors. */
export async function readStudioResponse<T>(response:Response):Promise<T>{
 const status=`HTTP ${response.status}`;
 let text:string;
 try{text=await response.text();}catch{throw new Error(`The connection ended before the studio response finished (${status}). Retry to reload your saved data.`);}
 let result:unknown;
 try{result=JSON.parse(text);}catch{
  throw new Error(`The studio returned an unreadable response (${status}). Retry to reload your saved data. If this continues, refresh the page.`);
 }
 if(!response.ok){
  const message=result&&typeof result==='object'&&'message' in result?result.message:undefined;
  throw new Error(typeof message==='string'&&message.trim()?message:`The studio service could not complete this request (${status}).`);
 }
 return result as T;
}
