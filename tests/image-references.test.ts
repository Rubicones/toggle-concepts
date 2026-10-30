import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {resolveImageReferences,imageReferenceTokenBound} from '../packages/agents/image-references';
import {loadImageReferences} from '../packages/media/image-references.local';
import {imageQuoteSchema,imageRequest,quoteImage} from '../packages/agents/image-provider';
import {imageOptionsSchema} from '../packages/contracts/image-generation';
import {IMAGE_MODEL} from '../packages/agents/defaults';
function reference(){const canvas=createCanvas(32,32),ctx=canvas.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,32,32);const bytes=canvas.toBuffer('image/png'),asset={id:randomUUID(),sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',bytes:bytes.length,inspection:{width:32,height:32}};return {bytes,asset};}
test('reference resolution requires ownership-scoped exact IDs, explicit permission and bounded raster metadata',()=>{
 const {asset}=reference(),refs=resolveImageReferences([asset.id],[asset]);assert.equal(refs[0].sha256,asset.sha256);assert.equal(imageReferenceTokenBound(refs),2048);
 assert.throws(()=>resolveImageReferences([randomUUID()],[asset]));assert.throws(()=>resolveImageReferences([asset.id,asset.id],[asset]));assert.throws(()=>resolveImageReferences([asset.id],[{...asset,mime:'image/svg+xml'}]));assert.throws(()=>resolveImageReferences([asset.id],[{...asset,inspection:{width:8192,height:8192}}]));
 assert.equal(imageOptionsSchema.safeParse({referenceAssetIds:[asset.id]}).success,false);assert.equal(imageOptionsSchema.safeParse({referenceAssetIds:[asset.id],referenceUseConfirmed:true}).success,true);
});
test('local source loader inspects actual bytes and rejects changed digest, MIME, size and dimensions before submission',async()=>{
 const {asset,bytes}=reference(),refs=resolveImageReferences([asset.id],[asset]);const urls=await loadImageReferences(refs,async()=>bytes);assert.equal(urls[0],`data:image/png;base64,${bytes.toString('base64')}`);
 for(const patch of [{sha256:'a'.repeat(64)},{bytes:bytes.length+1},{mime:'image/webp' as const},{width:33}])await assert.rejects(()=>loadImageReferences([{...refs[0],...patch}],async()=>bytes),/IMAGE_REFERENCE_CHANGED/);
});
test('reference-aware quote requires endpoint capability and input tariff; actual data URLs and request tags reach native Image API',async()=>{
 const original=globalThis.fetch,{asset}=reference(),refs=resolveImageReferences([asset.id],[asset]);const endpoint={provider_tag:'google-vertex/global',supported_parameters:{aspect_ratio:{values:['1:1']},n:{min:1,max:1},input_references:{min:0,max:3}},pricing:[{billable:'input_image',unit:'token',cost_usd:.0000003},{billable:'output_image',unit:'token',cost_usd:.00003}]};
 try{globalThis.fetch=async()=>Response.json({endpoints:[endpoint]});const base=await quoteImage(IMAGE_MODEL,'1:1',.0000003,10000,.0000025,8192),quote=await quoteImage(IMAGE_MODEL,'1:1',.0000003,10000,.0000025,8192,undefined,{count:1,tokens:imageReferenceTokenBound(refs)});assert.ok(quote.reservation>base.reservation);assert.equal(quote.referenceCount,1);assert.equal(quote.inputImagePrice,.0000003);
 const url='data:image/png;base64,AAAA',tag=randomUUID(),request=imageRequest(quote,'Frozen role',{},'Preserve actual product',[url],tag);assert.equal(request.input_references?.[0].image_url.url,url);assert.equal(request.user,tag);assert.match(request.prompt,/validated reference images/);assert.throws(()=>imageRequest(quote,'Frozen role',{},'Test',[]));assert.throws(()=>imageRequest(quote,'Frozen role',{},'Test',['https://outside.invalid/image.png']));
 endpoint.pricing[0].unit='megapixel';await assert.rejects(()=>quoteImage(IMAGE_MODEL,'1:1',.0000003,10000,.0000025,8192,undefined,{count:1,tokens:2048}),/PRICING/);endpoint.pricing[0].unit='token';endpoint.supported_parameters.input_references.max=0;await assert.rejects(()=>quoteImage(IMAGE_MODEL,'1:1',.0000003,10000,.0000025,8192,undefined,{count:1,tokens:2048}),/PRICING/);
 assert.equal(imageQuoteSchema.parse({...base}).referenceCount,0);
 }finally{globalThis.fetch=original;}
});
