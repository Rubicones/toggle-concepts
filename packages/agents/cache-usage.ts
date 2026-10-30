export type CachePricing={inputPrice:number;cacheReadPrice?:number;cacheWritePrice?:number};
/** Billed input equivalents, at the frozen base input rate; never a guess about the provider's bill. */
export function billedInputTokens(usage:unknown,pricing:CachePricing|undefined,fallback:number){
 const u=usage as {prompt_tokens?:unknown;prompt_tokens_details?:{cached_tokens?:unknown;cache_write_tokens?:unknown}}|null;
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 if(!valid(u?.prompt_tokens))return fallback;const total=u.prompt_tokens;if(!pricing||pricing.inputPrice<=0)return total;
 const details=u.prompt_tokens_details,read=valid(details?.cached_tokens)?details.cached_tokens:0,write=valid(details?.cache_write_tokens)?details.cache_write_tokens:0;
 if(read+write>total)return fallback;
 const readRate=pricing.cacheReadPrice??pricing.inputPrice,writeRate=pricing.cacheWritePrice??pricing.inputPrice*1.25;
 if(!Number.isFinite(readRate)||!Number.isFinite(writeRate)||readRate<0||writeRate<0)return fallback;
 return Math.ceil(total-read-write+read*readRate/pricing.inputPrice+write*writeRate/pricing.inputPrice);
}
export const cacheWriteRate=(pricing:CachePricing,enabled?:boolean)=>Math.max(pricing.inputPrice,pricing.cacheWritePrice??pricing.inputPrice*(enabled?1.25:1));
