// Local-only bytes loader. No source URL or object key is accepted from a browser.
import {createHash} from 'node:crypto';
import {imageReferenceSchema,type ImageReference} from '../agents/image-references';
import {inspectMedia,sniffMime} from './inspect.local';
export async function loadImageReferences(refs:ImageReference[],read:(ref:ImageReference)=>Promise<Uint8Array>){
 if(refs.length>3||new Set(refs.map(r=>r.id)).size!==refs.length)throw new Error('INVALID_IMAGE_REFERENCES');
 const urls:string[]=[];let total=0;
 for(const source of refs){const ref=imageReferenceSchema.parse(source),bytes=Buffer.from(await read(ref));total+=bytes.length;
  if(total>10485760||bytes.length!==ref.bytes||createHash('sha256').update(bytes).digest('hex')!==ref.sha256||sniffMime(bytes)!==ref.mime)throw new Error('IMAGE_REFERENCE_CHANGED');
  const metadata=inspectMedia(bytes,ref.mime,ref.bytes).metadata;if(metadata.width!==ref.width||metadata.height!==ref.height)throw new Error('IMAGE_REFERENCE_CHANGED');
  urls.push(`data:${ref.mime};base64,${bytes.toString('base64')}`);
 }return urls;
}
