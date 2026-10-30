import 'server-only';
import {campaignRecord,checked,studioContext} from './studio';
import {lineageStepId,type DirectorEvent} from '@/packages/director/events';
import {mergeDirectorEvents,type ActivityCursor,type DirectorActivityPage} from '@/packages/director/activity';

const pageSize=50;
type ActivityRow={id:string;created_at:string;block_id:string;direction_id:string};
type EventRow=ActivityRow&{iteration_id:string|null;payload:DirectorEvent&{image?:{objectKey:string}}};
type DecisionRow=ActivityRow&{decision:string;question_id:string;created_by:string};
type Admin=Awaited<ReturnType<typeof studioContext>>['admin'];
// Cursors are validated by the route. Timestamp + UUID keeps equal-time rows
// stable and avoids offset drift as new events arrive. Nothing is deleted.
export async function readDirectorActivity(admin:Admin,blockIds:string[],campaignId:string,directionId:string,cursor?:ActivityCursor):Promise<DirectorActivityPage>{
 const load=async<Row extends ActivityRow>(table:'studio_director_events'|'studio_director_decisions',key:keyof ActivityCursor)=>{
  if(!blockIds.length||cursor?.[key]===null)return [];
  let query=admin.from(table).select(table==='studio_director_events'?'id,created_at,block_id,iteration_id,direction_id,payload':'id,created_at,block_id,direction_id,decision,question_id,created_by').in('block_id',blockIds).eq('direction_id',directionId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(pageSize+1);
  const before=cursor?.[key];
  if(before)query=query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`);
  return checked(await query.returns<Row[]>())??[];
 };
 const [events,decisions]=await Promise.all([load<EventRow>('studio_director_events','events'),load<DecisionRow>('studio_director_decisions','decisions')]);
 const nextPosition=(rows:ActivityRow[])=>rows.length>pageSize?{at:rows[pageSize-1].created_at as string,id:rows[pageSize-1].id as string}:null;
 const next={events:nextPosition(events),decisions:nextPosition(decisions)};
 const eventViews:DirectorEvent[]=events.slice(0,pageSize).map(e=>({...e.payload,stepId:lineageStepId(e.block_id,e.iteration_id,e.payload.stepId),id:e.id,at:e.created_at,directionId:e.direction_id,...(e.payload.image?{imageUrl:`/api/studio/campaigns/${campaignId}/director?asset=event&event=${e.id}`}:{})}));
 for(const row of decisions.slice(0,pageSize))eventViews.push({id:`decision:${row.id}`,stepId:`decision:${row.id}`,kind:'control',status:'done',at:row.created_at,directionId:row.direction_id,costMicroUsd:0,message:row.decision.startsWith('extend:')?'An additional allowance was approved.':row.decision.startsWith('keep:')?'The AD kept a saved version.':row.decision==='allow-resource'?'The AD allowed this picture.':row.decision==='wrap-up'?'The AD requested the saved work, without new paid requests.':'The AD requested continuation within the approved allowance.',detail:{blockId:row.block_id,decision:row.decision,questionId:row.question_id,actor:row.created_by}});
 return {events:mergeDirectorEvents(eventViews),next:next.events||next.decisions?next:null};
}

export async function directorActivity(campaignId:string,directionId:string,cursor?:ActivityCursor){
 await campaignRecord(campaignId);
 const {admin,tenant}=await studioContext();
 const blocks=checked(await admin.from('studio_director_blocks').select('id').eq('tenant_id',tenant).eq('campaign_id',campaignId).neq('status','quoted'))??[];
 return readDirectorActivity(admin,blocks.map(b=>b.id),campaignId,directionId,cursor);
}
