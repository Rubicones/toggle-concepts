// Chat-shaped plan C2 (second part): the pictures of a stored brand pack as a run context freezes them. Each stored
// picture (a brand sheet page or a signature picture) is read by its content key, checked against its hash and drawn
// once as a JPEG at the pack's fixed size for its kind. The frozen context keeps these bytes, so every request of the
// run starts with exactly the same pictures in the same order. A picture that cannot be read is left out.
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {objectStore} from '../../../packages/media/s3.server';
import {PACK_IMAGE,packImageSize,packPictures,type StoredBrandPack} from '../../../packages/brand/brand-pack-contents';
import type {PackImage} from '../../../packages/agents/run-context';

const sha256=(b:Buffer|Uint8Array)=>createHash('sha256').update(b).digest('hex');
export type PictureReader=(objectKey:string)=>Promise<Buffer>;
export const storedPicture:PictureReader=async key=>Buffer.from((await objectStore().get(key)).body);

/** One picture at its kind's fixed size: white ground, JPEG at the pack's quality. */
export async function packJpeg(kind:'sheet'|'signature',bytes:Buffer){
 const image=await loadImage(bytes),size=packImageSize(kind,image.width,image.height),canvas=createCanvas(size.width,size.height),g=canvas.getContext('2d');
 g.fillStyle='#ffffff';g.fillRect(0,0,size.width,size.height);g.drawImage(image,0,0,size.width,size.height);
 return {jpeg:canvas.toBuffer('image/jpeg',PACK_IMAGE.quality),...size};
}

export async function encodePackImages(pack:Pick<StoredBrandPack,'sheet'|'signatures'|'catalogue'>,read:PictureReader=storedPicture):Promise<PackImage[]>{
 const out:PackImage[]=[];
 for(const p of packPictures(pack)){
  try{
   const bytes=await read(p.ref.objectKey);if(sha256(bytes)!==p.ref.sha256)continue;
   const {jpeg,width,height}=await packJpeg(p.kind,bytes);
   out.push({kind:p.kind,label:p.label,mediaType:'image/jpeg',dataBase64:jpeg.toString('base64'),sha256:sha256(jpeg),width,height,source:p.ref.sha256});
  }catch{/* left out: a missing or unreadable picture never stops a run */}
 }
 return out;
}
