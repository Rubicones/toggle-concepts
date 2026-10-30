import {createHash} from 'node:crypto';
/** Content-addressed event images are immutable and safely reusable across turns and restarts. */
export async function promoteEventImage(storage:{promote:(key:string,bytes:Buffer,mime:string)=>Promise<unknown>;get:(key:string)=>Promise<{body:Uint8Array}>},key:string,bytes:Buffer){
 const hash=createHash('sha256').update(bytes).digest('hex');
 try{await storage.promote(key,bytes,'image/png');}catch(error){if(createHash('sha256').update((await storage.get(key)).body).digest('hex')!==hash)throw error;}
}
