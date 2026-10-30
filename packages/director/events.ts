/** Append-only facts. A step changes status by appending another fact with the same stepId. */
export type DirectorEvent = {
 id:string;directionId?:string;stepId:string;kind:'request'|'design'|'picture'|'coder'|'render'|'checks'|'critic'|'delivery'|'control'|'compaction'|'preview'|'review';
 status:'queued'|'running'|'done'|'failed';at:string;startedAt?:string;endedAt?:string;model?:string;
 costMicroUsd?:number|null;reservedMicroUsd?:number;message:string;detail?:unknown;
 imageUrl?:string;proxy?:boolean;prompt?:string;
};
/** An open request's default zero is not a receipt: show its reservation first. */
export function eventPriceLabel(event:DirectorEvent){
 const usd=(value:number)=>`$${(value/1e6).toFixed(4)}`;
 if(['queued','running'].includes(event.status)&&event.reservedMicroUsd!==undefined)return `Up to ${usd(event.reservedMicroUsd)}`;
 if(event.costMicroUsd!=null)return event.kind==='request'||event.costMicroUsd>0?usd(event.costMicroUsd):'';
 if(event.reservedMicroUsd!==undefined)return `Receipt pending · ${usd(event.reservedMicroUsd)} reserved`;
 return event.kind==='request'?'Cost receipt pending':'';
}
/** Reused local step names (e.g. "design") belong to an iteration, not the whole direction history. */
export const lineageStepId=(blockId:string,iterationId:string|null,stepId:string)=>`${blockId}/${iterationId??''}/${stepId}`;
export function publicStepMessage(value:string,maxLength=1000){
 return value.replace(/(?:[A-Za-z]:\\|\/?(?:artifacts|packages|apps|node_modules|Users|private|tmp|var|home|Volumes|remotion|lib\/server|components)\/)[^\s"'<>),;]+/g,'[technical detail]').replace(/\b(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+|TS\d{3,})\b/g,'technical detail').slice(0,maxLength);
}
export function latestSteps(events:DirectorEvent[]){const steps=new Map<string,DirectorEvent>();for(const event of events){const prior=steps.get(event.stepId),next={...prior,...event};if(event.status==='running'){next.startedAt=event.startedAt??(prior?.status==='running'?prior.startedAt:undefined)??event.at;delete next.endedAt;}else if(event.status==='queued'){delete next.startedAt;delete next.endedAt;}else next.endedAt=event.endedAt??event.at;steps.set(event.stepId,next);}return [...steps.values()];}

export function boundedEventDetail(detail:unknown){const encoded=JSON.stringify(detail);return encoded&&encoded.length>24576?{truncated:true,summary:encoded.slice(0,24576)}:detail;}
