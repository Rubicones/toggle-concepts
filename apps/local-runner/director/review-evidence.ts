import {readFile,writeFile,mkdir,link,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {PreviewEvidence,ReviewIdentity,SourceChecks} from '../../../packages/director/review';
import {reviewIdentitySchema} from '../../../packages/director/review';
import {atomicFile} from './atomic-file';
import type {DirectionInput} from '../../../packages/director/types';
import type {RoutedNote} from '../../../packages/director/state';
const evidencePath=(folder:string,identity:ReviewIdentity)=>{
 // ReviewTarget structurally contains ReviewIdentity plus the captured view.
 // Validate the identity projection; the command boundary validates the full target.
 const {blockId,directionId,iterationId,revision,assetRevision}=identity;
 const key=reviewIdentitySchema.parse({blockId,directionId,iterationId,revision,assetRevision});
 return resolve(folder,'.reports','review',key.revision,key.assetRevision+'.json');
};
export async function recordPreviewEvidence(folder:string,evidence:PreviewEvidence){
 const file=evidencePath(folder,evidence.identity);await mkdir(resolve(file,'..'),{recursive:true});const pending=file+'.'+randomUUID();
 try{await writeFile(pending,JSON.stringify(evidence),{flag:'wx'});await link(pending,file);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}finally{await rm(pending,{force:true});}
}
export async function readPreviewEvidence(folder:string,identity:ReviewIdentity):Promise<PreviewEvidence>{return JSON.parse(await readFile(evidencePath(folder,identity),'utf8'));}
export async function archiveReviewSource(from:string,to:string,revision:string){
 if(!/^[a-f0-9]{64}$/.test(revision))throw new Error('INVALID_PREVIEW_REVISION');
 try{const text=await readFile(resolve(from,'.reports','live',revision,'source.json'),'utf8'),source=JSON.parse(text);if(source.revision!==revision)throw new Error('REVIEW_SOURCE_CHANGED');await atomicFile(resolve(to,'.reports','review-sources',revision+'.json'),text);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
export async function prepareReviewNotes(folder:string,input:DirectionInput,notes:RoutedNote[]){
 const result:RoutedNote[]=[],known=new Map<string,string>();
 for(const note of notes){
  if(!note.target){result.push(note);continue;}const {sourceFile,...base}=note;void sourceFile;
  if(note.target.directionId!==input.directionId)throw new Error('UNISSUED_REVIEW_DIRECTION');
  const revision=note.target.revision,cached=known.get(revision);if(cached){result.push({...base,sourceFile:cached});continue;}
  const root=resolve('artifacts/m08/workspaces',input.runId,input.roundId,input.directionId,note.target.iterationId);await archiveReviewSource(root,root,revision);await archiveReviewSource(folder,folder,revision);
  let saved:string|undefined;
  for(const candidate of [resolve(root,'.reports','review-sources',revision+'.json'),resolve(folder,'.reports','review-sources',revision+'.json')])try{const text=await readFile(candidate,'utf8');if(JSON.parse(text).revision!==revision)throw new Error('REVIEW_SOURCE_CHANGED');await atomicFile(resolve(folder,'.reports','review-sources',revision+'.json'),text);saved='.reports/review-sources/'+revision+'.json';known.set(revision,saved);break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  result.push({...base,...(saved?{sourceFile:saved}:{})});
 }
 return result;
}
export async function sourceChecks(folder:string,revision:string,sealed?:SourceChecks):Promise<SourceChecks>{
 if(!/^[a-f0-9]{64}$/.test(revision))throw new Error('INVALID_PREVIEW_REVISION');
 const proof=JSON.parse(await readFile(resolve(folder,'.reports','live',revision,'typecheck.json'),'utf8').catch(()=>'null'));
 return {revision,build:'passed',typecheck:proof?.revision===revision&&proof.typecheck==='passed'&&proof.scope==='source-only'||sealed?.revision===revision&&sealed.typecheck==='passed'?'passed':'not-checked',scope:'source-only'};
}
