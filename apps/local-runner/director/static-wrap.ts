import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Design} from '../../../packages/director/contract';
import type {CheckReport} from '../../../packages/director/types';
import type {StaticStill} from './static-render';
/** Best-effort wrap-up never buys work or aborts remaining moments because one moment failed. */
export async function wrapStaticFrames(args:{design:Design;render:(sceneId:string,moment:string)=>Promise<{output:string;stills:StaticStill[]}>;failed:(sceneId:string,moment:string,error:unknown)=>Promise<void>}){
 const stills:StaticStill[]=[],findings:CheckReport['findings']=[];let output:string|undefined;
 for(const scene of args.design.keyFrames??[])for(const moment of scene.moments){try{const result=await args.render(scene.sceneId,moment.id);output=result.output;stills.push(...result.stills);}catch(error){findings.push({check:'sandbox',message:`A moment in scene ${(args.design.keyFrames??[]).indexOf(scene)+1} could not be rendered.`});await args.failed(scene.sceneId,moment.id,error);}}
 if(!output)return null;await writeFile(resolve(output,'stills.json'),JSON.stringify(stills));return {passed:false,findings,sampledFrames:stills.map(s=>s.frame),durationFrames:1,renderMs:0} satisfies CheckReport;
}
