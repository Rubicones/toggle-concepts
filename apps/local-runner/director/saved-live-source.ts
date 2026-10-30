import {readFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {confinedPath} from '../../../packages/director/policy.local';
import {atomicFile} from './atomic-file';

type Archive={hash:string;files:{path:string;source:string;sha256:string}[]};
const restoring=new Map<string,Promise<void>>();
/** Restore once from sealed bytes. Viewing a saved draft never generates new source. */
export async function restoreSavedLiveSource(folder:string,sourceHash:string,load:()=>Promise<Archive>){
 const key=resolve(folder),pending=restoring.get(key);if(pending)return pending;
 const task=(async()=>{
  await mkdir(key,{recursive:true});const root=await realpath(key),marker=resolve(root,'.reports','restored');
  try{await readFile(marker);return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const archive=await load();if(archive.hash!==sourceHash)throw new Error('SEALED_SOURCE_CHANGED');
  // Validate all archived bytes and paths before writing or setting the completion marker.
  const files=await Promise.all(archive.files.map(async file=>{
   if(createHash('sha256').update(file.source).digest('hex')!==file.sha256)throw new Error('SEALED_SOURCE_CHANGED');
   return {...file,path:await confinedPath(root,file.path)};
  }));
  if(!files.some(file=>file.path===resolve(root,'Frame.tsx')))throw new Error('FRAME_NOT_WRITTEN');
  for(const file of files){await mkdir(dirname(file.path),{recursive:true});await atomicFile(file.path,file.source);}
  await atomicFile(marker,sourceHash);
 })();restoring.set(key,task);
 try{await task;}finally{if(restoring.get(key)===task)restoring.delete(key);}
}
