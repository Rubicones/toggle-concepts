import {writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
/** Readers see a complete old or new document, including overlapping writers. */
export async function atomicFile(path:string,content:string|Uint8Array){
 const temp=resolve(dirname(path),'.tmp');await mkdir(temp,{recursive:true});const pending=resolve(temp,randomUUID()+'.pending');
 try{await writeFile(pending,content,{flag:'wx'});await rename(pending,path);}finally{await rm(pending,{force:true});}
}
