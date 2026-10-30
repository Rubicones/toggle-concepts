/** App-owned planning jobs retain C1's model/instructions; draft-director overrides belong to later work. */
export const planningJobRoles={research:'research',strategy:'strategy',variants:'variants',script:'script',localization:'localization','asset-plan':'visual-direction'} as const;
export function isPlanningJob(job:{job_key:string;role:string;kind:string},roundKind:string){return roundKind==='draft'&&job.kind==='text'&&Object.hasOwn(planningJobRoles,job.job_key)&&planningJobRoles[job.job_key as keyof typeof planningJobRoles]===job.role;}
