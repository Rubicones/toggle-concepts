export type DashboardControl={campaign_id:string;run_id:string;stage:string;status:string;blocker:string|null;updated_at:string};
export type DashboardRun={id:string;campaign_id:string;status:string;cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number};
export type DashboardItem={campaignId:string;state:'working'|'review'|'paused'|'attention'|'ready';label:string;stage:string;countedMicroUsd:number;reservedMicroUsd:number;capMicroUsd:number;updatedAt?:string};
const stages:Record<string,string>={brand:'Brand alignment',planning:'Scenarios and visual direction',assembly:'Adaptive previews',draft_review:'Draft review',client_review:'Client review',finals:'Final production'};
/** Project durable state only. No implied review, recovery, new spending or synthetic progress. */
export function dashboardItems(ids:string[],controls:DashboardControl[],runs:DashboardRun[]):DashboardItem[]{
 return ids.map(campaignId=>{
  const control=controls.find(c=>c.campaign_id===campaignId),run=(control?runs.find(r=>r.id===control.run_id):undefined)??runs.find(r=>r.campaign_id===campaignId);
  const state:DashboardItem['state']=control?.status==='paused'||run?.status==='closed'?'paused':control?.status==='review'?'review':control?.status==='blocked'?'attention':control?.status==='running'?'working':'ready';
  return {campaignId,state,label:control?.blocker==='FINAL_PRODUCTION_UNAVAILABLE'?'Final production unavailable':({working:'In progress',review:'Review needed',attention:'Needs attention',paused:'Paused',ready:'Open workspace'})[state],stage:stages[control?.stage??'']??'Brandbook and questionnaire',countedMicroUsd:Number(run?.charged_micro_usd??0),reservedMicroUsd:Number(run?.reserved_micro_usd??0),capMicroUsd:Number(run?.cap_micro_usd??0),...(control?{updatedAt:control.updated_at}:{})};
 });
}
