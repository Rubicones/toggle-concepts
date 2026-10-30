import {z} from 'zod';
import {api,json,ApiError} from '@/lib/server/api';
import {checked} from '@/lib/server/studio';
import {draftContext} from '@/lib/server/drafts';
import {objectStore} from '@/packages/media/s3.server';
import {readPrograms} from '@/packages/creative/program-reader';
import type {CreativeDirection,FrameProgram,DirectionProgram} from '@/packages/contracts/frame-program';
import {validateBuildIntegrity} from '@/packages/creative/build-integrity';
import {sourceStoryboard,type CreativeInputs} from '@/packages/creative/protocol';

/**
 * AD preview of one finished direction before the whole batch exists (read-only, AD only).
 * Reads the saved local build of `creative.compile.d{n}`; nothing is approved or charged.
 */
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/creative/preview'>){return api(async()=>{
 const id=z.uuid().parse((await ctx.params).id),params=new URL(request.url).searchParams,direction=z.coerce.number().int().min(0).max(2).parse(params.get('direction'));
 const saved=await draftContext(id),{admin,tenant}=saved;
 const job=checked(await saved.admin.from('studio_workflow_jobs').select('state,output,payload').eq('round_id',saved.round.id).eq('job_key',`creative.compile.d${direction}`).maybeSingle());
 if(!job?.output)throw new ApiError(404,'BUILD_NOT_FOUND','This direction has no saved local build yet.');
 let value:{programs?:FrameProgram[];directionPrograms?:DirectionProgram[];glyphs?:FrameProgram['engine']['glyphs'];direction?:CreativeDirection}|null;try{value=JSON.parse(job.output).value;}catch{throw new ApiError(409,'BUILD_UNREADABLE','The saved local build cannot be read.');}
 const programs=value?readPrograms(value):[];
 if(!programs.length)throw new ApiError(404,'BUILD_NOT_FOUND','This direction has no compiled formats yet.');
 const variant=params.get('variant');
 if(!variant){const input=job.payload?.creativeInputs as CreativeInputs|undefined,planning=checked(await admin.from('studio_workflow_jobs').select('output').eq('round_id',saved.round.id).eq('job_key','script').maybeSingle()),source=sourceStoryboard(planning?.output?[planning]:[],direction);
  if(value!.direction&&source.length)value!.direction.script.sourceScenes=source;
  const buildIssues=value!.direction&&input?validateBuildIntegrity(value!.direction,input,programs):[];
  const scenarios=planning?.output?JSON.parse(planning.output)?.deliverable?.threeDirections:undefined,scenario=Array.isArray(scenarios)?scenarios[direction]:scenarios;
  return json({state:buildIssues.some(i=>i.severity==='block')?'needs_repair':job.state,title:typeof scenario?.premise==='string'?scenario.premise:value!.direction?.script?.oneLine??'',buildIssues,variants:programs.map(p=>({variantId:p.variantId,placementId:p.placementId,locale:p.locale,width:p.width,height:p.height,durationFrames:p.durationFrames,fps:p.fps,issues:p.engine.issues.length}))});}
 const found=programs.find(p=>p.variantId===variant);if(!found)throw new ApiError(404,'BINDING_NOT_FOUND','That format is not in this build.');
 const program=found,asset=params.get('asset');
 if(!asset)return json({program});
 z.uuid().parse(asset);const ref=program.engine.resources.find(r=>r.revisionId===asset&&r.kind!=='font');if(!ref)throw new ApiError(404,'ASSET_NOT_FOUND','This asset is not part of the build.');
 const media=checked(await admin.from('asset_revisions').select('object_key,filename,mime,sha256').eq('tenant_id',tenant).eq('campaign_id',id).eq('id',asset).maybeSingle())??checked(await admin.from('studio_brand_materials').select('object_key,filename,mime,sha256').eq('tenant_id',tenant).eq('campaign_id',id).eq('id',asset).eq('state','ready').maybeSingle());
 if(!media||media.sha256!==ref.sha256)throw new ApiError(404,'ASSET_NOT_FOUND','The saved source is unavailable.');
 return json({url:await objectStore().signGet(media.object_key,media.filename),sha256:media.sha256});
});}
