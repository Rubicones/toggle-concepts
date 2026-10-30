import live from './live/brand.json';
import {resolveBrandSystem,type CreativeMaterial} from '../../packages/brand/resolve-system';
import type {BrandDraft} from '../../packages/contracts/brand-kit';
import type {CreativeDirection,FrameResource} from '../../packages/contracts/frame-program';
import type {CampaignScope,VariantEntry} from '../../packages/contracts/campaign';
import {readFile} from 'node:fs/promises';
import {TextEngine} from '../../packages/engine/engine/textengine';
import * as fontkit from 'fontkit';
// Hand-authored B2 fixture. The supplied Archivo file is used for both type roles in
// this fixture only; the unmodified live kit correctly reports missing JetBrains Mono.
export async function sonicdeskFixture(){
 const kit=structuredClone(live.kit) as BrandDraft,font=live.materials.find(m=>'family' in m.metadata)!;
 for(const rule of kit.rules)if(rule.category==='typography'&&rule.key.endsWith('Family'))rule.value=String(font.metadata.family);
 const brand=resolveBrandSystem({id:live.id,kit},live.materials as CreativeMaterial[]).system;
 const raw=await readFile((font as unknown as {fixturePath:string}).fixturePath),parsed=fontkit.create(raw);if('fonts' in parsed)throw new Error('Single font required');
 // Archivo fixture is a WOFF2. HarfBuzz consumes decoded SFNT bytes in the local compiler.
 const {decompress}=await import('wawoff2');const bytes=Buffer.from(await decompress(raw));
 const engine=await TextEngine.create(brand.fonts.map(f=>({key:f.role,data:bytes})));
 const placements=[{id:'vertical',width:360,height:640,fps:30},{id:'square',width:640,height:640,fps:30},{id:'portrait',width:512,height:640,fps:30},{id:'wide',width:640,height:360,fps:30}];
 const scope:CampaignScope={schemaVersion:'1.0',revisionId:'c1',campaignId:'sonicdesk',draftConceptCount:3,finalConceptCount:1,referencePlacement:'vertical',referenceLocale:'en-GB',locales:['en-GB'],hooks:['h0'],beatSequences:['s0'],offers:['o0'],durationsSeconds:[4],placements,combinationMode:'explicit_manifest',requestedFinalVideoCount:4};
 const variants:VariantEntry[]=placements.map((p,i)=>({id:`v${i}`,conceptSlot:1,locale:'en-GB',hook:'h0',beatSequence:'s0',durationSeconds:4,placementId:p.id,offer:'o0',inputRevisionIds:['c1']}));
 const directions:CreativeDirection[]=['Finish the track.','Hear the detail.','Room for your sound.'].map((hook,d)=>({id:`10000000-0000-4000-8000-00000000000${d+1}`,
  script:{version:'script@2',direction:d,oneLine:hook,technique:'split',data:[],cutdowns:[{durationSeconds:4,beats:['b0','b1']}],beats:[{key:'b0',role:'hook',objective:'Show the product idea',focal:'e0',elements:[{key:'e0',kind:'text',what:'Hook'},{key:'e1',kind:'ui',what:'Authentic waveform controls'},{key:'e2',kind:'logo',what:'Kit wordmark'}]},{key:'b1',role:'cta',objective:'Invite trial',focal:'e3',elements:[{key:'e3',kind:'text',what:'CTA'},{key:'e4',kind:'logo',what:'Kit wordmark'}]}],copy:[{key:'c0',beat:'b0',slot:'hook',locale:'en-GB',text:hook,short:[hook]},{key:'c1',beat:'b1',slot:'cta',locale:'en-GB',text:'Try sonicdesk',short:[]}],hooks:[{hookAxisId:'h0',angle:hook,beat:'b0'}],bindings:[],questions:[]},
  treatment:{version:'treatment@1',technique:'split',compositionsByBeat:['intake_split','intake_split'],palette:{field:'paper',surface:'paper',ink:'ink',accent:'ink'},typeRoles:[{element:'e0',style:'headline'},{element:'e3',style:'cta'}],imagery:{style:'Authentic studio UI',crop:'cover',treatment:'Dark ground'},motionCharacter:'calm',transitions:['cut'],signature:{mode:'none',ids:[]}},
  scenes:{version:'scene@2',stage:'draft',direction:d,beats:[{key:'b0',composition:'intake_split',regions:[{id:'ground',area:'full',paint:'paper'}],layers:[{key:'l0',element:'e0',kind:'text',zone:'text',order:2,style:'headline',color:'ink',source:'c0',registryId:''},{key:'l1',element:'e1',kind:'ui',zone:'hero',order:1,style:'body',color:'ink',source:'e1',registryId:''},{key:'l2',element:'e2',kind:'logo',zone:'logo',order:3,style:'body',color:'ink',source:brand.logos[0].id,registryId:''}],cues:[{target:'l1',type:'ui',at:0,duration:'medium',amount:1,period:2}],never:['l0','l2']},{key:'b1',composition:'intake_split',regions:[{id:'ground',area:'full',paint:'paper'}],layers:[{key:'l3',element:'e3',kind:'text',zone:'cta',order:1,style:'cta',color:'ink',source:'c1',registryId:''},{key:'l4',element:'e4',kind:'logo',zone:'logo',order:2,style:'body',color:'ink',source:brand.logos[0].id,registryId:''}],cues:[],never:['l3','l4']}],resourceContracts:[]},
  media:{version:'media@1',elements:[{element:'e1',source:'ui',reference:'',fit:'contain',ground:'paper',promptPack:null,contract:null,ui:{device:'desktop',aspect:2.5,referenceRevisionId:kit.sourceAssetIds[0],panels:[{key:'track',label:'Night Drive',value:'',kind:'label',progress:1},{key:'waveform',label:'',value:'',kind:'bar',progress:.72}]}},...['e2','e4'].map(element=>({element,source:'logo' as const,reference:brand.logos[0].id,fit:'contain' as const,ground:'paper',promptPack:null,contract:null,ui:null}))]}}));
 const resources:FrameResource[]=[...brand.fonts.flatMap(f=>f.files.map(file=>({revisionId:file.revisionId,sha256:file.sha256,objectKey:file.objectKey,mime:'font/woff2',kind:'font' as const}))),...brand.logos.map(l=>({revisionId:l.revisionId,sha256:l.sha256,objectKey:l.objectKey,mime:l.mime,kind:'logo' as const}))];
 const assetUrls:Record<string,string>={};for(const logo of brand.logos){const material=live.materials.find(m=>m.id===logo.revisionId)! as unknown as {fixturePath:string};assetUrls[logo.revisionId]=`data:image/svg+xml;base64,${(await readFile(material.fixturePath)).toString('base64')}`;}
 return {brand,scope,variants,directions,engine,resources,assetUrls};
}
