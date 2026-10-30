import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {readDesign} from '../../../packages/director/contract';
import {checkRenders,type Sample} from '../../../packages/director/checks.local';
import {availableRenderPort} from '../render-port';
import type {DirectionInput,Variant,FrameEvidence} from '../../../packages/director/types';
export type StaticStill={sceneId:string;moment:string;frame:number;file:string};
export async function renderStaticDirection(folder:string,variant:Variant,options:{sceneId?:string;moment?:string;check?:boolean}={check:true}){
 const started=performance.now(),input:DirectionInput=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8'));
 if(input.stage!=='draft'||!input.variants.some(v=>JSON.stringify(v)===JSON.stringify(variant)))throw new Error('UNISSUED_STATIC_VARIANT');
 const design=readDesign(JSON.parse(await readFile(resolve(folder,'draft.json'),'utf8')),input),format=input.formats.find(f=>f.id===variant.format)!;
 const all=design.keyFrames!.flatMap(s=>s.moments.map(m=>({sceneId:s.sceneId,moment:m.id}))),selected=all.map((m,i)=>({...m,frame:i})).filter(m=>!options.sceneId||m.sceneId===options.sceneId&&m.moment===options.moment);
 if(!selected.length)throw new Error('UNISSUED_SCENE_MOMENT');
 const output=resolve(folder,'renders',variant.id);await mkdir(output,{recursive:true});
 const browser=await openBrowser('chrome',{browserExecutable:process.env.CHROME_PATH??null,chromeMode:'headless-shell',chromiumOptions:{headless:true,disableWebSecurity:false}});
 const samples:Sample[]=[],stills:StaticStill[]=[];
 try{for(const selectedMoment of selected){let evidence:FrameEvidence|undefined;
  const common={serveUrl:resolve(folder,'bundle'),port:Number(process.env.DIRECTOR_RENDER_PORT)||await availableRenderPort(),puppeteerInstance:browser,inputProps:{...variant,sceneId:selectedMoment.sceneId,moment:selectedMoment.moment},timeoutInMilliseconds:30000,onBrowserLog:(log:{text:string})=>{if(log.text.startsWith('DIRECTOR_EVIDENCE:'))evidence=JSON.parse(log.text.slice('DIRECTOR_EVIDENCE:'.length));}};
  const composition=await selectComposition({...common,id:variant.format}),file=`${selectedMoment.frame}.png`;
  await renderStill({...common,composition,frame:0,output:resolve(output,file),imageFormat:'png'});
  console.log('DIRECTOR_STILL:'+JSON.stringify({variantId:variant.id,sceneId:selectedMoment.sceneId,moment:selectedMoment.moment,file:resolve(output,file)}));
  if(!evidence)throw new Error('RENDER_EVIDENCE_MISSING');
  const foreground=evidence as FrameEvidence;foreground.frame=selectedMoment.frame;
  let background=new Uint8Array();if(options.check){const bg=await renderStill({...common,inputProps:{...common.inputProps,inkless:true},composition:{...composition,props:{...composition.props,inkless:true}},frame:0,output:null,imageFormat:'png'});background=new Uint8Array(bg.buffer!);}
  samples.push({...selectedMoment,evidence:foreground,png:await readFile(resolve(output,file)),background,repeat:new Uint8Array()});stills.push({...selectedMoment,file});
 }
 const facts=input.variantFacts?.[variant.id],scenes=(facts?.storyboard??input.storyboard).map(s=>({...s,copy:facts?.sceneCopy[s.id]??s.copy}));
 const report=options.check?await checkRenders({stage:'draft',format,variant,brand:input.brand,scenes,samples,requiredCopy:facts?.required,durationFrames:1,renderMs:Math.round(performance.now()-started)}):null;
 if(report)await writeFile(resolve(output,'checks.json'),JSON.stringify(report));await writeFile(resolve(output,'stills.json'),JSON.stringify(stills));return {output,stills,report};
 }finally{await browser.close({silent:true});}
}
