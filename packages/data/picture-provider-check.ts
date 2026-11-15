// A check of the picture provider for the owner's own computer (scripts/check-picture-provider.ts): what the key and
// the account say about credit, what the studio would reserve for one picture, and, when asked, one test picture sent
// exactly as the studio sends a creative still. The key itself is never printed: only its last four characters.
// Every network call goes through the injected fetch, so the logic is tested without a network.
import {imageRequest,type ImageQuote} from '../agents/image-provider';

export type KeyFacts={available:boolean;limit:number|null;usage:number|null;remaining:number|null;freeTier:boolean|null};
export type CreditFacts={available:boolean;total:number|null;used:number|null;remaining:number|null};
const API='https://openrouter.ai/api/v1/';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const get=async(fetcher:typeof fetch,key:string,path:string)=>{try{const r=await fetcher(API+path,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});return r.ok?((await r.json()) as {data?:Record<string,unknown>}).data??{}:null;}catch{return null;}};
/** The key from the studio's settings file; undefined when the line is absent or empty. */
export function keyFromEnvFile(text:string):string|undefined{
 const line=text.split(/\r?\n/).find(l=>/^\s*OPENROUTER_API_KEY\s*=/.test(l));if(!line)return undefined;
 const value=line.slice(line.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');return value||undefined;
}
export const keyTail=(key:string)=>`…${key.slice(-4)}`;
export async function readKey(key:string,fetcher:typeof fetch=fetch):Promise<KeyFacts>{
 const d=await get(fetcher,key,'key');if(!d)return {available:false,limit:null,usage:null,remaining:null,freeTier:null};
 return {available:true,limit:num(d.limit),usage:num(d.usage),remaining:num(d.limit_remaining),freeTier:typeof d.is_free_tier==='boolean'?d.is_free_tier:null};
}
export async function readCredits(key:string,fetcher:typeof fetch=fetch):Promise<CreditFacts>{
 const d=await get(fetcher,key,'credits'),total=num(d?.total_credits),used=num(d?.total_usage);
 return d&&total!==null&&used!==null?{available:true,total,used,remaining:Math.round((total-used)*1e6)/1e6}:{available:false,total:null,used:null,remaining:null};
}
const usd=(v:number|null)=>v===null?'not stated':`$${v.toFixed(v<1?4:2)}`;
/** What the two account requests said, in plain lines. */
export function accountLines(key:string,k:KeyFacts,c:CreditFacts):string[]{
 return [`Key in the studio's settings: ${keyTail(key)} (match these four characters to the key list on openrouter.ai).`,
  k.available?`This key: ${k.limit===null?'no limit of its own':`limit ${usd(k.limit)}, ${usd(k.remaining)} of it left`}; used so far ${usd(k.usage)}; ${k.freeTier===null?'free tier not stated':k.freeTier?'FREE TIER (no credit was ever bought on this account)':'not free tier'}.`:'This key: the provider did not answer for it (the key may be wrong or revoked).',
  c.available?`The account: ${usd(c.total)} bought, ${usd(c.used)} used, ${usd(c.remaining)} left.`:'The account\'s credit: not available for this key (the provider shows it only to some keys).'];
}
/** What the provider may hold back for one picture when the request states no upper bound on its answer: the model's
 * whole answer allowance at its dearer output price. A reading of the refusal's wording ("maximum cost"), not a
 * documented rule. */
export const providerMaximumUsd=(outputPerToken:number,imageOutputPerToken:number,maxCompletionTokens:number)=>Math.max(outputPerToken,imageOutputPerToken)*maxCompletionTokens;
export function priceLines(q:Pick<ImageQuote,'model'|'provider'|'reservation'|'aspectRatio'>,maximumUsd:number):string[]{
 return [`Picture model: ${q.model}, through ${q.provider}, ${q.aspectRatio}.`,`The studio reserves ${usd(q.reservation/1e6)} for one picture (a picture really costs about $0.04).`,`The provider may hold back up to about ${usd(maximumUsd)} for one picture before it draws it (the model's whole answer allowance). The credit must cover that, not only the real price.`];
}
/** The test picture: the studio's own request for a creative still, with a neutral description. */
export const testPictureRequest=(q:ImageQuote)=>imageRequest(q,'',{mode:'creative_still'},'A plain grey pebble on a white table, soft daylight. No text.',[],'check-picture-provider');
export type TestResult={ok:true;width:number|null;costUsd:number|null}|{ok:false;status:number;said:string};
export async function buyTestPicture(key:string,q:ImageQuote,fetcher:typeof fetch=fetch,measure:(bytes:Buffer)=>Promise<number|null>=async()=>null):Promise<TestResult>{
 let r:Response;try{r=await fetcher(API+'images',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(testPictureRequest(q)),signal:AbortSignal.timeout(180000)});}catch(error){return {ok:false,status:0,said:error instanceof Error?error.message:'network error'};}
 const text=await r.text();let body:{data?:{b64_json?:string}[];usage?:{cost?:number};error?:unknown}={};try{body=JSON.parse(text);}catch{/* not JSON */}
 const b64=body.data?.[0]?.b64_json;
 if(!r.ok||body.error||!b64)return {ok:false,status:r.status,said:(body.error?JSON.stringify(body.error):text).replace(/sk-[A-Za-z0-9_-]+/g,'sk-…').slice(0,1500)};
 return {ok:true,width:await measure(Buffer.from(b64,'base64')).catch(()=>null),costUsd:typeof body.usage?.cost==='number'?body.usage.cost:null};
}
/** One plain conclusion from everything known. */
export function conclusion(a:{key:KeyFacts;credits:CreditFacts;maximumUsd:number|null;priced:boolean;test?:TestResult}):string{
 const {key,credits,maximumUsd,test}=a,need=maximumUsd??0.07;
 if(test?.ok)return 'CONCLUSION: pictures work with this key now. If the studio still refuses one, send this window\'s text.';
 if(!key.available)return 'CONCLUSION: the key in the studio\'s settings is not accepted by the provider. Put a working key into C:\\toggle\\.env.local (OPENROUTER_API_KEY) and run the installer.';
 if(!a.priced)return 'CONCLUSION: the picture model is not offered by the provider right now (its price list could not be read). This is not a credit problem.';
 if(key.remaining!==null&&key.remaining<need)return `CONCLUSION: this KEY's own limit is the cause: ${usd(key.remaining)} is left on it and one picture needs up to about ${usd(need)} free. Raise or remove the key's limit on openrouter.ai (Keys); adding account credit does not change a key's limit.`;
 if(credits.available&&credits.remaining!==null&&credits.remaining<need)return `CONCLUSION: the ACCOUNT's credit is the cause: ${usd(credits.remaining)} is left and one picture needs up to about ${usd(need)} free. Add credit to the account this key belongs to (the four characters above tell which).`;
 if(key.freeTier)return 'CONCLUSION: this key belongs to an account that never bought credit (free tier). The credit was most likely added to another account: compare the four characters above with the key list of the account you topped up.';
 if(test&&!test.ok)return test.status===402?'CONCLUSION: the provider refused payment although the figures above look sufficient or are hidden. Most likely the credit is on another account than this key\'s, or the provider holds back more than the account has. Send this window\'s text.':`CONCLUSION: the provider refused the picture for a reason other than payment (HTTP ${test.status}). Send this window\'s text.`;
 return 'CONCLUSION: nothing here shows a shortage. Buy the test picture (answer y) to see the provider\'s own answer.';
}
