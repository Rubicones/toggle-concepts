import {z} from 'zod';
export const derivedReferenceKey=/^staging\/director-derived\/[a-f0-9]{64}\.(png|jpg)$/;
/** objectKey marks an application-made reference (a director sketch or an extension canvas) held in staging storage. */
export const imageReferenceSchema=z.strictObject({id:z.uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['image/png','image/jpeg','image/webp']),bytes:z.number().int().positive().max(10485760),width:z.number().int().positive().max(2048),height:z.number().int().positive().max(2048),objectKey:z.string().regex(derivedReferenceKey).optional()}).refine(r=>r.width*r.height<=2097152,'Use references up to two megapixels.');
export type ImageReference=z.infer<typeof imageReferenceSchema>;
export function resolveImageReferences(ids:string[],assets:{id:string;sha256:string;mime:string;bytes:number;inspection:unknown}[]):ImageReference[]{
 if(ids.length>3||new Set(ids).size!==ids.length)throw new Error('INVALID_IMAGE_REFERENCES');
 const refs=ids.map(id=>{const source=assets.find(a=>a.id===id);if(!source)throw new Error('INVALID_IMAGE_REFERENCES');const dimensions=z.object({width:z.number(),height:z.number()}).parse(source.inspection);return imageReferenceSchema.parse({id:source.id,sha256:source.sha256,mime:source.mime,bytes:source.bytes,...dimensions});});
 if(refs.reduce((n,r)=>n+r.bytes,0)>10485760)throw new Error('IMAGE_REFERENCE_LIMIT');return refs;
}
export function imageReferenceTokenBound(refs:ImageReference[]){
 // Intentionally conservative: 1024 tokens per 384px tile plus 1024 per image.
 // Only <=2048px / <=2MP raster inputs are admitted; encoded bytes are not text tokens.
 return refs.reduce((n,r)=>n+1024+Math.ceil(r.width/384)*Math.ceil(r.height/384)*1024,0);
}
