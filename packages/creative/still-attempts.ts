// Draft still attempts, shared by the runner (which request to use) and the app (which request identities it issues).
// Three provider attempts per still; a failure on this computer before the provider was asked (nothing sent, nothing
// charged) does not use one of them. Bounded, deterministic.
export const LOCAL_PREFLIGHT=new Set(['MEDIA_TOOLS_UNAVAILABLE','PROVIDER_NOT_CONFIGURED','CATALOG_UNAVAILABLE','IMAGE_PREFLIGHT_FAILED']);
export const PROVIDER_ATTEMPTS=3,MAX_LOCAL_PREFLIGHT=20;
/** A recorded step that failed locally before the provider was asked. */
export const localPreflightFailure=(s:{status:string;error_code:string|null;cost_micro_usd:number|null}|null|undefined)=>!!s&&s.status==='failed'&&LOCAL_PREFLIGHT.has(s.error_code??'')&&!s.cost_micro_usd;
/** Whether attempt n may be issued, given the recorded steps of attempts 0..n-1 (in order). */
export function attemptIssuable(n:number,earlier:({status:string;error_code:string|null;cost_micro_usd:number|null}|null)[]){
 if(!Number.isInteger(n)||n<0)return false;if(n<PROVIDER_ATTEMPTS)return true;
 if(n>=PROVIDER_ATTEMPTS+MAX_LOCAL_PREFLIGHT)return false;
 return earlier.slice(0,n).filter(localPreflightFailure).length>=n-(PROVIDER_ATTEMPTS-1);
}
