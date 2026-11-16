// "New run with the same brief": a fresh campaign that carries the same brief and uses the same brand, so its run
// freezes the brand pack, instruction versions and settings as they are now. Nothing of the earlier campaign is
// changed: its run, checkpoints and costs stay as history. Built only from what the database already offers (campaign
// creation, studio_set_brand_source, studio_save_brief); no checkpoint is copied and no migration is needed.
import {createHash} from 'node:crypto';
import {ApiError} from './api';
import {nextRunName} from '@/packages/contracts/new-run';
import {studioContext,checked,campaignRecord} from './studio';

export type NewRun={id:string;name:string;briefCopied:boolean;brandLinked:boolean;notes:string[]};
export async function newRunFromCampaign(campaignId:string,requestId:string):Promise<NewRun>{
 const source=await campaignRecord(campaignId),{admin,tenant,actorId}=await studioContext();
 const sourceRow=checked(await admin.from('campaigns').select('id,name,brand,goal,brand_source_campaign_id').eq('tenant_id',tenant).eq('id',source.id).single()) as {id:string;name:string;brand:string;goal:string|null;brand_source_campaign_id:string|null}|null;
 if(!sourceRow)throw new ApiError(404,'CAMPAIGN_NOT_FOUND','This campaign is not available.');
 const names=(checked(await admin.from('campaigns').select('name').eq('tenant_id',tenant).eq('brand',sourceRow.brand))??[]).map(r=>String(r.name));
 // The request id is the new campaign's id, so a repeated click finds the campaign it already made.
 const made=checked(await admin.from('campaigns').select('id,name,document').eq('tenant_id',tenant).eq('id',requestId).maybeSingle()) as {id:string;name:string;document:Record<string,unknown>|null}|null;
 const name=made?.name??nextRunName(sourceRow.name,names),signature=createHash('sha256').update(JSON.stringify({newRunOf:sourceRow.id})).digest('hex');
 if(made&&made.document?.__studioCreationHash!==signature)throw new ApiError(409,'REQUEST_CONFLICT','This request belongs to another campaign. Refresh and try again.');
 if(!made)checked(await admin.from('campaigns').upsert({id:requestId,tenant_id:tenant,name,brand:sourceRow.brand,goal:sourceRow.goal??'',created_by:actorId,document:{__studioCreationHash:signature,__studioNewRunOf:sourceRow.id}},{onConflict:'id',ignoreDuplicates:true}).select('id').maybeSingle());
 const notes:string[]=[];
 // The brand: the same source the earlier campaign used (itself, when it holds its own brand).
 const brand=await admin.rpc('studio_set_brand_source',{target_campaign:requestId,source_campaign:sourceRow.brand_source_campaign_id??sourceRow.id,acting_user:actorId});
 if(brand.error)notes.push(`The brand could not be linked (${brand.error.message.slice(0,80)}): choose it on the new campaign's brand page.`);
 // The brief: the saved questionnaire as it stands. Uploaded campaign files are not copied.
 const draft=await admin.from('studio_brief_drafts').select('payload').eq('tenant_id',tenant).eq('campaign_id',sourceRow.id).maybeSingle();
 let briefCopied=false;
 if(draft.error||!draft.data?.payload)notes.push('The earlier campaign has no saved brief to copy: fill it in on the new campaign.');
 else{const saved=await admin.rpc('studio_save_brief',{target_campaign:requestId,expected_version:0,draft:draft.data.payload,acting_user:actorId});
  briefCopied=!saved.error||/version|conflict|stale/i.test(saved.error.message);
  if(!briefCopied)notes.push(`The brief could not be copied (${saved.error!.message.slice(0,80)}): fill it in on the new campaign.`);}
 return {id:requestId,name,briefCopied,brandLinked:!brand.error,notes};
}
