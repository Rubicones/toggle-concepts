// A bounded projection, never the raw provider body or request payload.
export type ProviderErrorDetail={httpStatus:number;code:string|null;message:string;provider:string|null;requestId:string|null;details:string[];retryAfterMs?:number;limitSource?:string};
export function providerFailureSummary(code:string,output:string|null,usage?:{_studio?:{providerError?:ProviderErrorDetail;finishReason?:string|null;maxOutputTokens?:number;validation?:{code?:string;message?:string;issues?:string[]}|null}}|null){
 const validation=usage?._studio?.validation;if(validation?.message)return {message:validation.message,details:validation.issues??[]};
 const detail=usage?._studio?.providerError;
 if(detail){
  if(detail.httpStatus>=500&&detail.httpStatus<=599)return {message:`${detail.provider??'The AI provider'} returned a server error (HTTP ${detail.httpStatus}). No usable response was returned.`,details:[detail.message,...detail.details],provider:detail.provider,requestId:detail.requestId};
  return {message:detail.message,details:detail.details,provider:detail.provider,requestId:detail.requestId};
 }
 if(code==='PROVIDER_400')return {message:'The provider rejected the request before generation. Its explanation was not retained for this older attempt.',details:[]};
 if(code==='OUTPUT_TOKEN_LIMIT'||usage?._studio?.finishReason==='length')return {message:`The response reached the saved output limit${usage?._studio?.maxOutputTokens?` (${usage._studio.maxOutputTokens} tokens)`:''}. No kit was imported.`,details:[]};
 if(code==='INVALID_OUTPUT_SCHEMA'&&output){try{JSON.parse(output);}catch{return {message:'The saved response is incomplete or invalid JSON and cannot be imported. Earlier charges remain recorded.',details:[]};}}
 return {message:code.replaceAll('_',' '),details:[]};
}
