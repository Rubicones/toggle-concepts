import type {ProviderErrorDetail} from '../contracts/provider-error';
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function providerErrorDetail(value:unknown,httpStatus:number,requestId:string|null,retryAfter?:string|null):ProviderErrorDetail{
 function safe(value:unknown,max=1000){if(typeof value!=='string'&&typeof value!=='number')return null;let s=String(value);for(const key of ['OPENROUTER_API_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','S3_SECRET_ACCESS_KEY']){const secret=process.env[key];if(secret)s=s.split(secret).join('[redacted]');}return s.replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/\b(?:sk-or-v1-|sb_secret_)[a-zA-Z0-9_-]+/g,'[redacted]').replace(/data:[^\s"']+;base64,[a-zA-Z0-9+/=]+/g,'[redacted image]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,max);}
 const root=record(value),error=record(root.error),meta=record(error.metadata),details:string[]=[];
 const raw=meta.raw;if(typeof raw==='string'&&raw.length<=65536){try{const parsed=record(JSON.parse(raw)),inner=record(parsed.error);const message=safe(inner.message??parsed.message);if(message)details.push(message);}catch{/* Raw bodies can contain prompt echoes or HTML: never persist them. */}}
 const outer=safe(error.message)??`Provider rejected the request (HTTP ${httpStatus}).`;
 const message=details[0]??(httpStatus===429&&typeof raw==='string'&&/temporarily rate.limited|RESOURCE_EXHAUSTED|quota exceeded|rate limit exceeded/i.test(raw)?'The upstream model provider is rate-limiting requests.':outer);
 const delay=retryAfter==null?NaN:/^\d+(?:\.\d+)?$/.test(retryAfter.trim())?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now(),limitSource=safe(meta.limit_source,100);
 return {httpStatus,code:safe(error.code,100),message,provider:safe(meta.provider_name,100),requestId:safe(requestId??meta.request_id??root.request_id,250),details:details.filter(d=>d!==message).slice(0,3),...(Number.isFinite(delay)&&delay>=0&&Number.isSafeInteger(Math.ceil(delay))?{retryAfterMs:Math.ceil(delay)}:{}),...(limitSource?{limitSource}:{})};
}
