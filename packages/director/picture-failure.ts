// Live run of 15 November: the second picture of a draft was refused by the picture provider for payment (HTTP 402:
// the provider account had too little credit). Nothing said so on the timeline or on the draft; the designer was told
// a code, guessed, asked no more, and after the next review gave up the photograph it had and rebuilt the frame in
// code. Here: one plain reason per failure, whether any further picture can be had at all, and the one sentence the
// designer, the reviewer and the art director read. Pure; no brand, no model.
export type PictureFailure={/** the technical code, for the detail */code:string;/** the provider refused payment: the owner is asked before the draft goes on (live run 3) */payment?:boolean;/** why, in plain words */reason:string;
 /** no further picture can be bought in this draft until a person changes something outside it */blocks:boolean;
 /** what the owner of the studio must do, when someone must */owner?:string};

const RULES:[RegExp,Omit<PictureFailure,'code'>][]=[
 [/PROVIDER_402/,{reason:'the picture provider refused payment: its account has too little credit for this picture',blocks:true,payment:true,owner:'Add credit to the picture provider account (OpenRouter), then continue; nothing was charged for this picture.'}],
 [/PROVIDER_40[13]|PROVIDER_NOT_CONFIGURED/,{reason:'the picture provider did not accept this studio\'s key',blocks:true,owner:'Check the picture provider key (OPENROUTER_API_KEY) on this computer, then continue.'}],
 [/RUN_CAP_REACHED/,{reason:'the run\'s budget is used up',blocks:true,owner:'Raise the run cap in the run limits, then continue.'}],
 [/STEP_CAP_REACHED/,{reason:'the picture role\'s budget for this run is used up',blocks:true,owner:'Raise the image agent cap in the run limits, then continue.'}],
 [/IMAGE_PRICE_CHANGED|IMAGE_PRICING_UNAVAILABLE|IMAGE_QUOTE_INVALID/,{reason:'the picture\'s price changed after the draft was approved',blocks:true,owner:'Start the draft again so that the pictures are priced anew.'}],
 [/PROVIDER_429/,{reason:'the picture provider is busy and refused this request for now',blocks:false}],
 [/PROVIDER_400|PROVIDER_422|IMAGE_RESPONSE_INVALID|IMAGE_DIMENSIONS_INVALID/,{reason:'the picture provider could not make this picture as asked',blocks:false}],
 [/PROVIDER_5\d\d|CATALOG_UNAVAILABLE|LOCAL_API_UNAVAILABLE/,{reason:'the picture provider could not be reached',blocks:false}],
];
/** Reads a failed purchase (its error code, with the provider's own words when they were kept). */
export function pictureFailure(code:string|undefined|null,said?:string|null):PictureFailure{
 const c=String(code??'').slice(0,200),rule=RULES.find(([p])=>p.test(c))?.[1];
 if(rule)return {code:c,...rule};
 const words=String(said??'').replace(/\s+/g,' ').trim().slice(0,160);
 return {code:c,reason:words?`the picture could not be made (${words})`:'the picture could not be made',blocks:false};
}
/** For the timeline and the draft: "A picture could not be bought: reason." with what the owner must do. */
export const pictureFailureLine=(f:PictureFailure)=>`A picture could not be bought: ${f.reason}.${f.owner?` ${f.owner}`:''}`;
/** How many pictures the designer can still get: none when a failure blocks buying. */
export const picturesLeft=(max:number,used:number,blocked:boolean)=>blocked?0:Math.max(0,max-used);
const count=(n:number)=>n===1?'1 more picture':`${n} more pictures`;
/** What the designer reads, once, with a failed picture (version 6). When none can be had, the way of making stays:
 * the pictures in hand are kept, code fixes what code can fix, and the notes that need a picture are named as open. */
export function pictureFailureNote(id:string,f:PictureFailure,left:number):string{
 const head=`The picture ${id} could not be bought: ${f.reason}.`;
 return left>0?`${head} You can still get ${count(left)}.`:`${head} You can get no further picture in this draft. ${KEEP_THE_WAY_OF_MAKING}`;
}
/** Version 6, designer: no further picture does not end the way of making. */
export const KEEP_THE_WAY_OF_MAKING='Keep the pictures you have and the way of making you chose. Fix in code what code can fix, and say in your answer which notes stay open because they need a picture.';
/** A request made when none can be had (version 6): nothing is asked of the provider. */
export const noFurtherPictureNote=(reason?:string)=>`No picture was asked for: you can get no further picture in this draft${reason?` (${reason})`:''}. ${KEEP_THE_WAY_OF_MAKING}`;
/** Version 6, every review made when no further picture can be had (the count is used or buying is blocked). */
export const NO_FURTHER_PICTURE_REVIEWER='NO FURTHER PICTURE\nNo further picture can be made or bought for this draft. Judge the pictures in the frame as they are. A note may ask only for what code can change; where a problem can only be solved by a new or re-made picture, say so in one note, marked as open for the art director, and ask for nothing else about it.';
/** Records a failed purchase with the designer's state and returns what is said about it. */
export function recordPictureFailure(state:{pictures:number;pictureFailures?:{id:string;code:string;reason:string;owner?:string;said?:string}[];picturesBlocked?:string},p:{id:string;code?:string;detail?:string;said?:string},max:number){
 const failure=pictureFailure(p.code??p.detail,p.detail);
 (state.pictureFailures??=[]).push({id:p.id,code:failure.code,reason:failure.reason,...(failure.owner?{owner:failure.owner}:{}),...(p.said?{said:p.said.slice(0,300)}:{})});
 if(failure.blocks)state.picturesBlocked=failure.reason;
 return {failure,note:pictureFailureNote(p.id,failure,picturesLeft(max,state.pictures,!!state.picturesBlocked))};
}

/** Before approval, when it can be known: the picture provider account's remaining credit against what the approved
 * pictures may cost. Reads the provider's free account endpoint (no model call); any failure means "not known" and
 * says nothing. Not yet proven against the live provider: the endpoint's answer shape is read defensively. */
export async function pictureProviderCreditMicroUsd(key:string|undefined,fetcher:typeof fetch=fetch):Promise<number|null>{
 if(!key)return null;
 try{const r=await fetcher('https://openrouter.ai/api/v1/credits',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(4000)});if(!r.ok)return null;
  const d=(await r.json() as {data?:{total_credits?:unknown;total_usage?:unknown}}).data,total=Number(d?.total_credits),used=Number(d?.total_usage);
  return Number.isFinite(total)&&Number.isFinite(used)?Math.round((total-used)*1e6):null;}catch{return null;}
}
const usd=(micro:number)=>'$'+(Math.max(0,micro)/1e6).toFixed(2);
/** The sentence for the price message; empty when the credit covers the pictures or is not known. */
export function pictureCreditNote(creditMicroUsd:number|null,pictures:number,perPictureMicroUsd:number):string{
 if(creditMicroUsd===null||pictures<1||perPictureMicroUsd<=0)return '';
 const need=pictures*perPictureMicroUsd;if(creditMicroUsd>=need)return '';
 const can=Math.max(0,Math.floor(creditMicroUsd/perPictureMicroUsd));
 return ' The picture provider account has '+usd(creditMicroUsd)+' of credit: enough for '+(can===0?'no picture':can===1?'1 picture':can+' pictures')+' of the '+pictures+' this draft may ask for (up to '+usd(need)+'). Add credit to the provider account before approving, or the other pictures will be refused.';
}

/** Live run 3: the first picture was refused for payment and the whole draft was then drawn as stand-ins in code. A
 * payment refusal in the hero stage now stops the direction with a question for the owner, before any further turn. */
export const PICTURE_PAYMENT_REFUSED='PICTURE_PAYMENT_REFUSED';
/** The provider's own sentence from a failed purchase's detail ("… Provider says: …"). */
export const providerSentence=(detail:string|undefined|null)=>{const m=/Provider says:\s*([\s\S]+)$/.exec(String(detail??''));return (m?m[1]:'').replace(/\s+/g,' ').trim().slice(0,300);};
/** After the owner's answer: what the designer reads when the draft goes on. */
export const picturesAgainNote=(id:string,left:number)=>`The picture ${id} was not bought: the picture provider refused payment. Pictures can be bought again now: ask for it again if the idea needs it. You can still get ${left===1?'1 picture':`${left} pictures`}.`;

/** Live run 3: the pre-check said nothing and the first picture was refused. The account endpoint (/credits) may refuse
 * an ordinary key; the key's own endpoint (/key) answers any key with that key's limit, when it has one. Both are free
 * account requests. `account`: the account's remaining credit; `key`: the remaining limit of this key (the account may
 * hold less); `unknown`: neither could be read. */
export type PictureCredit={source:'account'|'key'|'unknown';microUsd:number|null};
export async function pictureProviderCredit(key:string|undefined,fetcher:typeof fetch=fetch):Promise<PictureCredit>{
 if(!key)return {source:'unknown',microUsd:null};
 const read=async(path:string)=>{try{const r=await fetcher('https://openrouter.ai/api/v1/'+path,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(4000)});return r.ok?(await r.json() as {data?:Record<string,unknown>}).data??null:null;}catch{return null;}};
 const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
 const account=await read('credits'),total=num(account?.total_credits),used=num(account?.total_usage);
 if(total!==null&&used!==null)return {source:'account',microUsd:Math.round((total-used)*1e6)};
 const own=await read('key'),left=num(own?.limit_remaining);
 return left!==null?{source:'key',microUsd:Math.round(left*1e6)}:{source:'unknown',microUsd:null};
}
/** The first line of the price message about picture credit; empty when the account's credit is known to cover the
 * pictures. A key's limit that covers them does not prove the account does, so that is said as not checked. */
export function pictureCreditFirstLine(credit:PictureCredit,pictures:number,perPictureMicroUsd:number):string{
 if(pictures<1||perPictureMicroUsd<=0)return '';
 const short=credit.microUsd!==null?pictureCreditNote(credit.microUsd,pictures,perPictureMicroUsd).trim():'';
 if(short)return (credit.source==='key'?short.replace('The picture provider account has','This key\'s limit at the picture provider leaves'):short)+' ';
 return credit.source==='account'?'':'Picture credit could not be checked: if the picture provider account is short of credit, pictures will be refused and you will be asked. ';
}

/** For the timeline, when the draft went on: a note, not an error (live run 5). */
export const recoveredPictureLine=(f:PictureFailure)=>`One picture could not be made (${f.reason}); the designer went on without it.`;
