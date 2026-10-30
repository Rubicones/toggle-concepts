import {planningJobRoles} from '../contracts/planning-job';

type PlanningJob={id:string;job_key:string;state:string;output_hash:string|null};
type Round={id:string;run_id:string;origin_c1_id:string;a1_id:string|null};
export type DraftLineage={runId:string;roundId:string;checkpointId:string;a1Id:string|null;planning:{id:string;sha256:string}[]};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

/** Only the six current app-owned jobs belong to this planning revision. History keys never count. */
export function draftLineage(round:Round,jobs:PlanningJob[]):DraftLineage{
 return {runId:round.run_id,roundId:round.id,checkpointId:round.origin_c1_id,a1Id:round.a1_id,planning:jobs.filter(j=>Object.hasOwn(planningJobRoles,j.job_key)&&j.state==='succeeded'&&j.output_hash).map(j=>({id:j.id,sha256:j.output_hash!}))};
}

/** A prior pipeline or regenerated planning is readable history, never an implicit build or approval. */
export function matchesDraftLineage(value:unknown,current:DraftLineage|null):boolean{
 if(!current||current.planning.length!==6||new Set(current.planning.map(p=>p.id)).size!==6)return false;
 const snapshot=object(value),planning=Array.isArray(snapshot.planning)?snapshot.planning.map(object):[],inputs=Array.isArray(snapshot.inputs)?snapshot.inputs.map(object):[];
 if(snapshot.protocol!=='director@1'||snapshot.checkpointId!==current.checkpointId||snapshot.a1Id!==current.a1Id||planning.length!==6||new Set(planning.map(p=>p.id)).size!==6||!inputs.length)return false;
 if(!current.planning.every(p=>planning.some(q=>p.id===q.id&&p.sha256===q.sha256)))return false;
 return inputs.every(input=>{
  const brief=object(input.brief),memory=object(input.materialMemory),handoff=object(input.creativeHandoff);
  return input.stage==='draft'&&input.runId===current.runId&&input.roundId===current.roundId&&brief.referenceReconstructionAllowed===true&&brief.draftConstructionVersion===1&&brief.resourceBindingVersion===1&&memory.version===1&&handoff.version===1&&handoff.owner==='draft-director';
 });
}
export function isCurrentDraftBlock(block:{run_id:string;round_id:string;status:string;snapshot:unknown},current:DraftLineage|null){
 return !!current&&block.status!=='quoted'&&block.status!=='superseded'&&block.run_id===current?.runId&&block.round_id===current.roundId&&matchesDraftLineage(block.snapshot,current);
}

export function draftWorkProgress(works:{status:string;question:unknown}[],expectedDirections:number){
 const questions=works.filter(w=>w.question).map(w=>w.question);
 if(questions.length)return {state:'review' as const,questions};
 return works.length===expectedDirections&&works.length>0&&works.every(w=>w.status==='done')?{state:'complete' as const}:{state:'running' as const};
}
