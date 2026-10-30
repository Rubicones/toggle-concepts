import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {objectStore} from '../../../packages/media/s3.server';
import type {BlockSnapshot} from '../../../packages/director/state';
import type {DirectionInput} from '../../../packages/director/types';
export async function materialize(folder:string,snapshot:BlockSnapshot){
 for(const file of snapshot.files){if(!/^[\w.-]+$/.test(file.url))throw new Error('RESOURCE_PATH_REJECTED');const bytes=file.objectKey.startsWith('fixtures/')?await readFile(resolve('public',file.objectKey)):(await objectStore().get(file.objectKey)).body;if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('RESOURCE_BYTES_CHANGED');await mkdir(resolve(folder,'public'),{recursive:true});await writeFile(resolve(folder,'public',file.url),bytes);}
}
export async function visionImages(folder:string,input:DirectionInput){
 const images:{url:string;label:string;sourceId?:string;required?:boolean}[]=[],required=new Set(input.creativeHandoff?.referenceAssetIds??[]);
 const sources=[...input.assets.filter(a=>required.has(a.id)),...input.brand.references,...input.brand.logos,...input.assets].filter((r,i,all)=>input.stage!=='draft'||all.findIndex(p=>p.url===r.url)===i);
 if(required.size>6)throw new Error('REQUIRED_REFERENCE_IMAGE_CAP');
 // Brand references and logos first; JPEG data URLs and a count cap keep the request well inside provider payload limits.
 for(const image of sources.slice(0,input.stage==='draft'?6:24)){if('mime' in image&&typeof image.mime==='string'&&!image.mime.startsWith('image/'))continue;const bytes=await readFile(resolve(folder,'public',image.url));const decoded=await loadImage(bytes),scale=Math.min(1,(input.stage==='draft'?768:1024)/Math.max(decoded.width,decoded.height)),canvas=createCanvas(Math.max(1,Math.round(decoded.width*scale)),Math.max(1,Math.round(decoded.height*scale))),g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);g.drawImage(decoded,0,0,canvas.width,canvas.height);const jpeg=canvas.toBuffer('image/jpeg',input.stage==='draft'?65:85);if(input.stage==='draft'&&jpeg.byteLength>196608)throw new Error('DIRECTOR_IMAGE_SIZE_CAP');images.push({url:`data:image/jpeg;base64,${jpeg.toString('base64')}`,label:`Supplied image ${image.id}`,...(input.creativeHandoff?{sourceId:image.id,required:required.has(image.id)}:{})});}
 return images;
}
