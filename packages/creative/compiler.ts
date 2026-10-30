// Trusted deterministic compiler. No provider calls, user code evaluation or filesystem reads.
import {createHash} from "node:crypto";
import {canonicalJson} from "../contracts/common";
import {parseScene,type SceneSpec,type Asset} from "../contracts/scene";
import {validateVariantManifest,type CampaignScope,type VariantManifest} from "../contracts/campaign";
import {draftPlanSchema,type DraftProgram,type DraftCompilation,type DraftSource,type DraftIssue,type DraftTextTask,type DraftFit} from "../contracts/drafts";
import type {BrandDraft} from "../contracts/brand-kit";
export const draftHash=(value:unknown)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
export const draftFonts:Asset[]=[{kind:"font",revisionId:"font-latin-r1",family:"StudioNoto",objectKey:"fixtures/noto-latin.woff2",sha256:"09aee8065d25508f23a4c3d92cd777ac869c52d93fd868a88f025d888a7937d6"},{kind:"font",revisionId:"font-cyrillic-r1",family:"StudioNoto",objectKey:"fixtures/noto-cyrillic.woff2",sha256:"05af9e705d3b63aedba67197d19fb448b97353e1386930716c7e835b08f126ba"}];
export type DraftContext={scope:CampaignScope;manifest:VariantManifest;brand:{id:string;kit:BrandDraft};scriptRevisionId:string;assets:DraftSource[];submittedBrief?:unknown;planningRefs?:{id:string;sha256:string}[]};
const luminance=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
export function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function prepareDrafts(input:unknown,context:DraftContext):{compilation:DraftCompilation;tasks:DraftTextTask[]}{
 const plan=draftPlanSchema.parse(input);const {scope,manifest}=validateVariantManifest(context.scope,context.manifest),issues:DraftIssue[]=[],programs:DraftProgram[]=[],tasks:DraftTextTask[]=[];
 const issue=(code:string,message:string,directionId?:string,variantId?:string,slotId?:string)=>issues.push({code,message,...(directionId?{directionId}:{}),...(variantId?{variantId}:{}),...(slotId?{slotId}:{})});
 const token=(category:string,key:string)=>context.brand.kit.rules.find(r=>r.category===category&&r.key===key&&r.decision==="accepted")?.value;
 const ink=token("color","ink")??"",paper=token("color","paper")??"";
 if(!/^#[a-fA-F0-9]{6}$/.test(ink)||!/^#[a-fA-F0-9]{6}$/.test(paper)||contrast(ink,paper)<4.5)issue("BRAND_CONTRAST","Accepted ink/paper must be opaque six-digit colors with contrast at least 4.5:1.");
 if(![token("typography","headlineFamily"),token("typography","bodyFamily")].every(f=>f?.trim().toLowerCase()==="noto sans")&&token("typography","draftFallback")!=="Noto Sans")issue("FONT_CAPABILITY","Only packaged Noto Sans is connected. A1 must use that family or explicitly accept a typography.draftFallback rule with value Noto Sans.");
 if(!plan.assetUseConfirmed)issue("ASSET_REVIEW_REQUIRED","Confirm selected media, product identity, source rights, required disclosures and proxy treatment against C1/A1.");
 if(new Set(plan.directions.map(d=>d.id)).size!==3||new Set(plan.directions.map(d=>d.title.trim().toLowerCase())).size!==3||new Set(plan.directions.map(d=>d.idea.trim().toLowerCase())).size!==3)issue("THREE_DISTINCT_DIRECTIONS","Three unique identities, titles and strategic premises are required.");
 if(new Set(plan.directions.map(d=>d.recipe)).size!==3)issue("THREE_TREATMENTS","Use each deterministic art-direction recipe once: editorial, split, product.");
 const used=new Map<string,DraftSource>();
 for(const direction of plan.directions){
  if(!direction.title.trim()||!direction.idea.trim())issue("DIRECTION_CONTENT","Name the direction and explain its creative idea.",direction.id);
  const bound=new Map<string,typeof direction.bindings[number]>();
  for(const b of direction.bindings){for(const rowId of b.variantIds){if(bound.has(rowId))issue("DUPLICATE_BINDING","An ordered row is bound more than once.",direction.id,rowId);bound.set(rowId,b);}const grouped=manifest.entries.filter(r=>b.variantIds.includes(r.id));if(["locale","hook","beatSequence","offer"].some(k=>new Set(grouped.map(r=>r[k as keyof typeof r])).size>1))issue("VARIATION_OVERRIDE","Different locale/hook/beat/offer combinations require separate copy bindings.",direction.id);if(b.resource&&(!b.resource.compositionIntent.trim()||(b.resource.kind==="video"&&!b.resource.motionIntent.trim())))issue("PROXY_CONTRACT","Describe the protected framing and required final motion/camera.",direction.id);if(new Set(b.sequence).size!==3)issue("BEAT_SEQUENCE","Every sequence must include hook, proof and CTA exactly once.",direction.id);}
  for(const boundId of bound.keys())if(!manifest.entries.some(r=>r.id===boundId))issue("FOREIGN_VARIANT","A binding references an unordered variant.",direction.id,boundId);
  for(const row of manifest.entries){
   const b=bound.get(row.id);if(!b){issue("MISSING_BINDING","Supply actual copy and media for this ordered row.",direction.id,row.id);continue;}
   if(b.locale!==row.locale)issue("LOCALE_MISMATCH","A binding cannot silently translate or change its locale.",direction.id,row.id);
   if(!b.hook.trim()||!b.proof.trim()||!b.cta.trim())issue("MISSING_COPY","Actual hook, proof and CTA copy are required.",direction.id,row.id);
   if(plan.mandatoryLegal&&!b.legal.includes(plan.mandatoryLegal))issue("MANDATORY_COPY","This row must preserve the complete required disclosure.",direction.id,row.id);
   // Packaged subset coverage is explicit; unsupported scripts block rather than silently falling back.
   if(b.legal.length/24>row.durationSeconds)issue("LEGAL_READING_TIME","The full disclosure needs more reading time than this ordered duration.",direction.id,row.id);
   const text=[b.hook,b.proof,b.cta,b.legal].join("");if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))issue("CONTROL_CHARACTER","Remove invisible control characters from copy.",direction.id,row.id);if([...text].some(c=>{const n=c.codePointAt(0)!;return !(n<=255||n===0x131||n===0x152||n===0x153||(n>=0x400&&n<=0x45f)||[0x490,0x491,0x4b0,0x4b1,0x2116,0x20ac].includes(n)||(n>=0x2000&&n<=0x206f));}))issue("GLYPH_CAPABILITY","Copy contains glyphs outside the packaged Latin/Cyrillic subsets.",direction.id,row.id);
   const image=(assetId:string|null,label:string)=>{const a=context.assets.find(a=>a.id===assetId);if(!a||!a.mime.startsWith("image/")||!a.inspection.width||!a.inspection.height){issue("MISSING_IMAGE",`Choose a validated ${label} image revision.`,direction.id,row.id);return null;}used.set(a.id,a);return {revisionId:a.id,objectKey:`media/${a.id}`,sha256:a.sha256,kind:"image" as const,width:a.inspection.width,height:a.inspection.height};};
   const hero=image(b.heroAssetId,"product/proxy"),logo=image(b.logoAssetId,"logo");if(!hero||!logo)continue;
   const p=scope.placements.find(p=>p.id===row.placementId)!,frames=p.fps*row.durationSeconds,programId=`draft-${direction.id}-${row.id}`;
   if(row.durationSeconds<3)issue("DURATION_READABILITY","A three-beat draft needs at least three seconds in the accepted scope.",direction.id,row.id);
   const assets:Asset[]=[hero,...(hero.revisionId===logo.revisionId?[]:[logo]),...draftFonts];
   let audio:DraftProgram["audio"]=null;
   if(b.audioAssetId){const a=context.assets.find(a=>a.id===b.audioAssetId),stream=a?.inspection.streams?.find(s=>s.type==="audio");if(!a||a.mime!=="audio/wav"||!a.inspection.durationSeconds||a.inspection.durationSeconds<row.durationSeconds||!stream?.channels||!stream.sampleRate)issue("AUDIO_DURATION","Audio must be a validated WAV covering the full program duration.",direction.id,row.id);else{used.set(a.id,a);audio={assetRevisionId:a.id,objectKey:`media/${a.id}`,sha256:a.sha256,gain:.6};}}
   const scenes:SceneSpec[]=[];
   for(let i=0;i<3;i++){
    const role=b.sequence[i],sceneId=`concept-${direction.id}.${role}`,durationFrames=Math.round(b.beatWeights.slice(0,i+1).reduce((n,w)=>n+w,0)/b.beatWeights.reduce((n,w)=>n+w,0)*frames)-Math.round(b.beatWeights.slice(0,i).reduce((n,w)=>n+w,0)/b.beatWeights.reduce((n,w)=>n+w,0)*frames),wide=p.width/p.height>1.2,square=p.width/p.height>.9;
    if(durationFrames<1)issue("TIMING_BLOCKED","Every beat needs at least one frame. Rebalance the timing weights.",direction.id,row.id);
    const boxes=layout(direction.recipe,wide,square),scale=Math.min(p.width,p.height)/1080;
    const slots:SceneSpec["slots"]=[{id:`${sceneId}.hero`,role:"hero",bounds:boxes.hero},{id:`${sceneId}.headline`,role:"headline",bounds:boxes.text},{id:`${sceneId}.logo`,role:"logo",bounds:{x:.06,y:.05,w:.24,h:.07}},{id:`${sceneId}.legal`,role:"cta",bounds:{x:.06,y:.90,w:.88,h:.05}}];
    const copy={message:b[role],...(b.legal?{legal:b.legal}:{})},fontSize=Math.round((role==="proof"?54:76)*scale),layers:SceneSpec["layers"]=[{id:"hero",slotId:`${sceneId}.hero`,startFrame:0,durationFrames,required:true,kind:"image",assetRevisionId:hero.revisionId,fit:"contain"},{id:"logo",slotId:`${sceneId}.logo`,startFrame:0,durationFrames,required:true,kind:"image",assetRevisionId:logo.revisionId,fit:"contain"},{id:"message",slotId:`${sceneId}.headline`,startFrame:0,durationFrames,required:true,kind:"text",copyKey:"message",fontSize,color:ink||"#000000",maxLines:role==="proof"?8:6}];
    if(b.legal)layers.push({id:"legal",slotId:`${sceneId}.legal`,startFrame:0,durationFrames,required:true,kind:"text",copyKey:"legal",fontSize:Math.round(22*scale),color:ink||"#000000",maxLines:3});
    if(b[role].length/24>durationFrames/p.fps)issue("READING_TIME","Copy exceeds the conservative 24 characters/second reading budget for this beat.",direction.id,row.id);
    const contracts:SceneSpec["resourceContracts"]=[];
    if(b.resource){const contractId=`contract-${direction.id}-${b.id}-${role}-${row.durationSeconds}`;contracts.push({schemaVersion:"1.0",revisionId:contractId,slotId:`${sceneId}.hero`,logicalResourceId:`resource-${direction.id}-${b.id}`,referenceAssetRevisionId:hero.revisionId,compositionIntent:b.resource.compositionIntent,protectedArea:b.resource.protectedArea,aspectRatio:hero.width/hero.height,aspectTolerance:.02,requirement:b.resource.kind==="video"?{kind:"video",requiredDurationSeconds:durationFrames/p.fps,trimStartSeconds:Math.round(b.beatWeights.slice(0,i).reduce((n,w)=>n+w,0)/b.beatWeights.reduce((n,w)=>n+w,0)*frames)/p.fps,motionIntent:b.resource.motionIntent}:{kind:"model3d",cameraRecipeId:b.resource.cameraRecipeId,boundsMeters:b.resource.boundsMeters}});
     const resourceContract=contracts[0];resourceContract.revisionId="pending";resourceContract.revisionId=`contract-${draftHash(resourceContract).slice(0,32)}`;
     layers[0]={id:"hero",slotId:`${sceneId}.hero`,startFrame:0,durationFrames,required:true,draftProxyRevisionId:hero.revisionId,finalAssetRevisionId:null,contractRevisionId:resourceContract.revisionId,...(b.resource.kind==="video"?{kind:"video" as const,fit:"contain" as const}:{kind:"model3d" as const})};}
    const scene:SceneSpec={schemaVersion:"1.0",sceneId,revisionId:`scene-${draftHash({plan,programId,role}).slice(0,32)}`,semanticRole:role==="proof"?"proof":role,scriptRevisionId:context.scriptRevisionId,brandRevisionId:context.brand.id,durationFrames,fps:p.fps,seed:7,locale:row.locale,placementId:row.placementId,width:p.width,height:p.height,stage:"draft",mandatoryCopyKeys:b.legal?["message","legal"]:["message"],copy,slots,layers,assets,resourceContracts:contracts,fontAssetRevisionIds:draftFonts.map(f=>f.revisionId),fallbackPolicy:"review-required-for-visual-change"};
    for(const layer of layers)if(layer.kind==="text"){const box=slots.find(s=>s.id===layer.slotId)!.bounds;tasks.push({key:`${programId}.${role}.${layer.id}`,text:copy[layer.copyKey as keyof typeof copy]!,width:box.w*p.width,height:box.h*p.height,minFont:Math.round((layer.id==="legal"?18:role==="proof"?28:36)*scale),maxFont:layer.fontSize,maxLines:layer.maxLines});}
    scenes.push(scene);
   }
   programs.push({id:programId,directionId:direction.id,variantId:row.id,title:direction.title,idea:direction.idea,recipe:direction.recipe,width:p.width,height:p.height,fps:p.fps,durationFrames:frames,locale:row.locale,placementId:row.placementId,colors:{ink,paper},scenes,audio});
  }
 }
 for(const row of manifest.entries){const hooks=plan.directions.map(d=>d.bindings.find(b=>b.variantIds.includes(row.id))?.hook.trim().toLowerCase());if(hooks.every(Boolean)&&new Set(hooks).size!==3)issue("DUPLICATE_CREATIVE","The three directions need different actual opening copy, not only different layouts.",undefined,row.id);}
 return {compilation:{schemaVersion:"1.0",compilerVersion:"m07.1",planHash:draftHash(plan),sourceAssets:[...used.values()].map(a=>({id:a.id,sha256:a.sha256})),programs,qa:{passed:false,issues,orderedVariants:manifest.entries.length,candidateBindings:programs.length,fontMeasured:false,measurementEngine:"not_run",fits:[]}},tasks};
}
function layout(recipe:string,wide:boolean,square:boolean){
 if(recipe==="split")return wide?{hero:{x:.06,y:.16,w:.41,h:.69},text:{x:.53,y:.18,w:.41,h:.65}}:{hero:{x:.06,y:.15,w:.88,h:square?.33:.39},text:{x:.06,y:square?.53:.59,w:.88,h:square?.32:.27}};
 if(recipe==="product")return wide?{hero:{x:.4,y:.16,w:.54,h:.69},text:{x:.06,y:.19,w:.30,h:.63}}:{hero:{x:.12,y:.37,w:.76,h:.46},text:{x:.06,y:.15,w:.88,h:.19}};
 return wide?{hero:{x:.58,y:.16,w:.36,h:.69},text:{x:.06,y:.19,w:.46,h:.64}}:{hero:{x:.06,y:.53,w:.88,h:.32},text:{x:.06,y:.16,w:.88,h:.32}};
}
export function finishDrafts(compilation:DraftCompilation,fits:DraftFit[],engine:string){
 const result=structuredClone(compilation),map=new Map(fits.map(f=>[f.key,f]));
 for(const p of result.programs)for(let i=0;i<p.scenes.length;i++){const s=p.scenes[i];for(const l of s.layers)if(l.kind==="text"){const role=["hook","proof","cta"].find(r=>s.sceneId.endsWith(`.${r}`))!,key=`${p.id}.${role}.${l.id}`,f=map.get(key);if(!f?.fits){result.qa.issues.push({code:"TEXT_OVERFLOW",message:"Text does not fit at the readable minimum size. Shorten it or revise the binding.",directionId:p.directionId,variantId:p.variantId,slotId:l.slotId});continue;}l.fontSize=f.fontSize;s.copy[l.copyKey]=f.lines.join("\n");}s.revisionId="measured";s.revisionId=`scene-${draftHash(s).slice(0,32)}`;p.scenes[i]=parseScene(s);}
 result.qa.fits=fits;result.qa.fontMeasured=true;result.qa.measurementEngine=engine;result.qa.passed=result.qa.issues.length===0&&result.programs.length===3*result.qa.orderedVariants;return result;
}
