// Complete request recording (plan §3.1, §11): the prepared request is kept whole, without truncation, so a step can
// be replayed or compared later. Image bytes are stored once by hash, not repeated in every record. Local files for
// now (~/.toggle/local-claude/requests); S4 moves them to private object storage with references in the database.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseDataUrl,type ChatMessage,type PreparedTextRequest} from '../../../packages/agents/prepared-request';
import {toggleHome} from './device';

export const requestsDir=()=>join(toggleHome(),'local-claude','requests');
const BLOB='blob:sha256:';

/** Writes the request and its images; returns the record's path, named by the semantic hash and the whole record. */
export async function recordPreparedRequest(p:PreparedTextRequest,dir=requestsDir()):Promise<string>{
 await mkdir(join(dir,'blobs'),{recursive:true});
 const messages:ChatMessage[]=[];
 for(const m of p.messages){
  if(typeof m.content==='string'){messages.push(m);continue;}
  const content=[];
  for(const part of m.content){
   if(part.type!=='image_url'){content.push(part);continue;}
   const d=parseDataUrl(part.image_url.url);if(!d){content.push(part);continue;}
   const bytes=Buffer.from(d.dataBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex'),file=join(dir,'blobs',hash);
   try{await access(file);}catch{await writeFile(file,bytes,{mode:0o600});}
   content.push({type:'image_url' as const,image_url:{url:`${BLOB}${hash}|${part.image_url.url.slice(0,part.image_url.url.indexOf(','))}`}});
  }
  messages.push({role:m.role,content});
 }
 const text=JSON.stringify({...p,messages},null,1)+'\n',path=join(dir,`${p.semanticInputHash}-${createHash('sha256').update(text).digest('hex').slice(0,12)}.json`);
 await writeFile(path,text,{mode:0o600});
 return path;
}

/** Reads a record back into the exact prepared request, image bytes included. */
export async function readPreparedRequest(path:string):Promise<PreparedTextRequest>{
 const saved=JSON.parse(await readFile(path,'utf8')) as PreparedTextRequest,dir=join(path,'..');
 const messages:ChatMessage[]=[];
 for(const m of saved.messages){
  if(typeof m.content==='string'){messages.push(m);continue;}
  const content=[];
  for(const part of m.content){
   if(part.type!=='image_url'||!part.image_url.url.startsWith(BLOB)){content.push(part);continue;}
   const [hash,header]=part.image_url.url.slice(BLOB.length).split('|'),bytes=await readFile(join(dir,'blobs',hash));
   if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('RECORDED_IMAGE_CHANGED');
   content.push({type:'image_url' as const,image_url:{url:`${header},${bytes.toString('base64')}`}});
  }
  messages.push({role:m.role,content});
 }
 return {...saved,messages};
}
