import {z} from 'zod';
import {localCampaignSchema} from './studio';
export const campaignCreateSchema=z.strictObject({requestId:z.uuid().optional(),name:z.string().trim().min(1).max(80),brand:z.string().trim().min(1).max(60),goal:z.string().trim().max(1200).default(''),legacyId:z.string().max(100).optional()});
export const campaignEditSchema=z.strictObject({name:z.string().trim().min(1).max(80).optional(),brand:z.string().trim().min(1).max(60).optional(),goal:z.string().max(1200).optional(),previousGoal:z.string().max(1200).optional(),previousDocument:z.record(z.string().refine(s=>!s.startsWith('__studio'),'Reserved campaign metadata.'),z.string().max(40000)).optional(),document:z.record(z.string().refine(s=>!s.startsWith('__studio'),'Reserved campaign metadata.'),z.string().max(40000)).optional()});
export const campaignLifecycleSchema=z.strictObject({expectedVersion:z.number().int().positive()});
export function isCampaignRemoved(row:{document?:Record<string,unknown>|null}){return typeof row.document?.__studioRemovedAt==='string';}
export function campaignLifecycleDocument(document:Record<string,unknown>,actor:string,remove:boolean,now:string){const next={...document};if(remove){next.__studioRemovedAt=now;next.__studioRemovedBy=actor;}else{delete next.__studioRemovedAt;delete next.__studioRemovedBy;}return next;}

export function campaignEditConflicts(row:{goal:string;document:Record<string,unknown>},input:z.infer<typeof campaignEditSchema>){return input.previousGoal!==undefined&&input.previousGoal!==row.goal||!!input.previousDocument&&Object.entries(input.previousDocument).some(([key,value])=>(row.document[key]??'')!==value);}

// PostgREST emits timezone offsets (and microseconds); the UI transport uses UTC Z.
export function studioCampaignRecord(row:{id:string;name:string;brand:string;goal:string;created_at:string}){return localCampaignSchema.parse({schemaVersion:'1.0',id:row.id,name:row.name,brand:row.brand,goal:row.goal,createdAt:new Date(row.created_at).toISOString()});}
