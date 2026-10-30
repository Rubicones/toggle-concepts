import {providerFailureSummary,type ProviderErrorDetail} from '@/packages/contracts/provider-error';
export type ProviderDiagnosticUsage={_studio?:{providerError?:ProviderErrorDetail;finishReason?:string|null;maxOutputTokens?:number}};
export function ProviderFailure({code,output=null,usage}:{code:string;output?:string|null;usage?:ProviderDiagnosticUsage|null}){
 const failure=providerFailureSummary(code,output,usage);
 return <div className="form-error" role="alert"><strong>{code}</strong><p>{failure.message}</p>{failure.details.map((detail,index)=><p key={index}>{detail}</p>)}{'provider' in failure&&failure.provider&&<p>Provider: {failure.provider}</p>}{'requestId' in failure&&failure.requestId&&<p>Request: {failure.requestId}</p>}<p>No automatic paid retry.</p></div>;
}
