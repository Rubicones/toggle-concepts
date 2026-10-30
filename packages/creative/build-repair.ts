import type {CreativeIssue} from '../contracts/creative-drafts';

export const buildRepairStages=['script','treatment','scenes','media','compile','critic'] as const;
export type BuildRepairStage=typeof buildRepairStages[number];
/** Repair the first broken translation step; earlier approved planning is never queued again. */
export function planBuildRepair(issues:CreativeIssue[]):{stage:BuildRepairStage;issues:CreativeIssue[];rebuild:BuildRepairStage[]}|null{
 const blocks=issues.filter(i=>i.severity==='block');
 const stage=buildRepairStages.find(stage=>blocks.some(i=>i.path.startsWith(`${stage}.`)));
 if(!stage)return null;
 return {stage,issues:blocks.filter(i=>i.path.startsWith(`${stage}.`)).map(i=>({...i,path:i.path.slice(stage.length+1)})),rebuild:buildRepairStages.slice(buildRepairStages.indexOf(stage))};
}
