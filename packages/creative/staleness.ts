import {CREATIVE_PROTOCOL_VERSION,BRAND_RESOLVER_VERSION} from './version';
export function creativeStaleness(snapshot:{protocolVersion?:string;brandResolverVersion?:string},savedBrandHash:string,currentBrandHash:string){
 const reasons:string[]=[];
 if(savedBrandHash!==currentBrandHash)reasons.push('The approved brand or resolved graphics changed.');
 if(snapshot.protocolVersion!==CREATIVE_PROTOCOL_VERSION)reasons.push('The creative protocol changed.');
 if(snapshot.brandResolverVersion!==BRAND_RESOLVER_VERSION)reasons.push('The brand resolver changed.');
 return {stale:reasons.length>0,staleReasons:reasons};
}
