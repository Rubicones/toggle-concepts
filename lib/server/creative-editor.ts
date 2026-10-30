import 'server-only';
import {createHash} from 'node:crypto';
import {draftContext} from './drafts';
import {checked} from './studio';
import {ApiError} from './api';
import type {CreativeInputs} from '@/packages/creative/protocol';
import type {CreativeDirection,DirectionProgram,FrameProgram} from '@/packages/contracts/frame-program';
import {brandSystemSchema} from '@/packages/contracts/creative-drafts';
import {creativeDirectionSchema} from '@/packages/contracts/frame-program';
import {readPrograms} from '@/packages/creative/program-reader';
import {compileDirection} from '@/packages/creative/compile-v2';
import {creativeFontData} from '@/packages/creative/fonts.local';
import {TextEngine} from '@/packages/engine/engine/textengine';
import {objectStore} from '@/packages/media/s3.server';
import {emptyDraftEdits} from '@/packages/contracts/draft-edits';
import type {DraftEdits} from '@/packages/contracts/draft-edits';
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export async function creativeEditorContext(campaignId:string,direction:number){
 const saved=await draftContext(campaignId),{admin,tenant}=saved;
 const job=checked(await admin.from('studio_workflow_jobs').select('id,output,output_hash,payload').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('round_id',saved.round.id).eq('job_key',`creative.compile.d${direction}`).maybeSingle());
 if(!job?.output||!job.output_hash)throw new ApiError(404,'BUILD_NOT_FOUND','Compile this direction before opening its editor.');
 const value=JSON.parse(job.output).value as {direction?:CreativeDirection;directionPrograms?:DirectionProgram[];programs?:FrameProgram[];glyphs?:FrameProgram['engine']['glyphs']};
 if(!value?.direction)throw new ApiError(409,'BUILD_UNREADABLE','Recompile this saved direction for free to open the editor.');
 const input=job.payload.creativeInputs as CreativeInputs;input.brand=brandSystemSchema.parse(input.brand);
 const source=creativeDirectionSchema.parse(value.direction),resources=value.directionPrograms?.[0]?.resources??readPrograms(value).flatMap(p=>p.engine.resources).filter((r,i,a)=>a.findIndex(v=>v.revisionId===r.revisionId)===i);
 const fontData=await creativeFontData(input.brand,input.scope.referenceLocale,async key=>(await objectStore().get(key)).body),engine=await TextEngine.create(fontData);
 const facts=(input.brief?.facts??[]).filter(f=>f.status==='confirmed').map(f=>f.claim),agentProgram=value.directionPrograms?.[0]??compileDirection(source,input.brand,input.budget,input.scope,input.variants,engine,resources,input.protectedCopy,true,undefined,facts);
 const revision=checked(await admin.from('studio_creative_edit_revisions').select('id,revision,source_hash,edits,approved').eq('tenant_id',tenant).eq('job_id',job.id).order('revision',{ascending:false}).limit(1).maybeSingle());
 const current=revision?.source_hash===job.output_hash?revision:null;
 const policy={protectedCopy:input.protectedCopy,approvedFacts:[...facts,...input.protectedCopy.map(p=>p.text)]};
 return {saved,job,source,input,resources,fontData,engine,agentProgram,policy,revision:revision?.revision??0,edits:(current?.edits??emptyDraftEdits()) as DraftEdits,approved:current?.approved??false};
}
export async function editorFiles(context:Awaited<ReturnType<typeof creativeEditorContext>>){
 const {saved,fontData,resources}=context,store=objectStore(),fonts=[];
 for(const font of fontData){const hash=digest(font.data),key=`media/${saved.tenant}/${saved.campaign.id}/creative-fonts/${hash}.ttf`;
  await store.promote(key,Buffer.from(font.data),'font/ttf').catch(async error=>{if(digest((await store.get(key)).body)!==hash)throw error;});
  fonts.push({role:font.key,url:await store.signGet(key,`${font.key}.ttf`),sha256:hash});
 }
 const assets:Record<string,string>={};for(const r of resources)if(r.kind!=='font')assets[r.revisionId]=await store.signGet(r.objectKey,r.revisionId);
 return {fonts,assets};
}
