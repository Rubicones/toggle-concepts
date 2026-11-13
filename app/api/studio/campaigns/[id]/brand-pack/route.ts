import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {campaignRecord} from '@/lib/server/studio';
import {objectStore} from '@/packages/media/s3.server';
import {brandPackPicture,brandPackView,editBrandPack,rewriteBrandCharacter} from '@/lib/server/brand-pack';

// Chat-shaped plan C2 (second part): "What every agent sees about this brand" — the stored brand pack of the
// campaign's accepted brand, its pictures, and the AD's edits (each edit is a new version).
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-pack'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),url=new URL(request.url),picture=url.searchParams.get('picture');
 if(picture){
  const key=await brandPackPicture(campaign.id,z.string().regex(/^[a-f0-9]{64}$/).parse(picture));
  if(!key)throw new ApiError(404,'PICTURE_NOT_FOUND','This picture is not part of this brand pack.');
  return new Response(new Uint8Array((await objectStore().get(key)).body),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400, immutable','X-Content-Type-Options':'nosniff'}});
 }
 return json(await brandPackView(campaign.id));
});}
const commands=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('write')}),
 z.strictObject({action:z.literal('edit'),expectedVersion:z.number().int().positive(),character:z.string().max(12000).optional(),signatures:z.array(z.string().max(80)).max(6).optional()}),
]);
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-pack'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),input=await body(request,commands,40000);
 if(input.action==='write')return json(await rewriteBrandCharacter(campaign.id),202);
 return json(await editBrandPack(campaign.id,input));
});}
