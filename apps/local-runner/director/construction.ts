import {readFile,writeFile,mkdir,link,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {constructionProgress,squareFirstDraft,squareReference,sameCopyBinding} from '../../../packages/director/construction';
import {readyLiveVariants} from '../../../packages/director/live-preview';
import type {DirectionInput} from '../../../packages/director/types';
import type {LiveOptions} from '../../../packages/director/live-preview';
import {liveSource} from './live-bundle';
type Build={revision:string;options:LiveOptions;legacy:boolean};
const checkpointPath=(folder:string)=>resolve(folder,'.reports','construction','square.json');
/** App-owned source milestone, never a visual approval or a rendered image. */
export async function draftConstruction(folder:string,input:DirectionInput,saveSquare=false){
 if(!squareFirstDraft(input))return undefined;
 const source=await liveSource(folder).catch(error=>{if((error as Error).message==='FRAME_NOT_WRITTEN')return undefined;throw error;});
 const built:Build|undefined=source?JSON.parse(await readFile(resolve(folder,'.reports','live',source.revision,'manifest.json'),'utf8').catch(()=>'null')):undefined;
 const typed=await readFile(resolve(folder,'.reports','live-typed'),'utf8').catch(()=>''),checked=!!source&&typed===source.revision&&built?.revision===source.revision;
 let square=JSON.parse(await readFile(checkpointPath(folder),'utf8').catch(()=>'null')) as {revision:string}|null;
 const reference=squareReference(input.variants),baseReady=built&&!built.legacy&&reference&&readyLiveVariants(input.variants,built.options).some(v=>sameCopyBinding(v,reference))&&input.storyboard.every(s=>built.options.scenes.includes(s.id));
 if(saveSquare&&!square&&checked&&baseReady){
  const checkpoint={revision:source!.revision,width:1080,height:1080,reference,sceneIds:input.storyboard.map(s=>s.id),files:source!.files,visualChecked:false};
  await mkdir(resolve(folder,'.reports','construction'),{recursive:true});
  const pending=checkpointPath(folder)+'.'+randomUUID();
  try{await writeFile(pending,JSON.stringify(checkpoint),{flag:'wx'});await link(pending,checkpointPath(folder));}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}finally{await rm(pending,{force:true});}
  square=JSON.parse(await readFile(checkpointPath(folder),'utf8'));
 }
 return constructionProgress(input,built?.options,square?.revision,checked);
}
