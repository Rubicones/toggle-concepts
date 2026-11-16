import {z} from 'zod';
import {api,body,json} from '@/lib/server/api';
import {newRunFromCampaign} from '@/lib/server/new-run';

// "New run with the same brief": a new campaign with the same brief and brand; the earlier one stays as history.
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/new-run'>){return api(async()=>{
 const id=z.uuid().parse((await ctx.params).id),input=await body(request,z.strictObject({requestId:z.uuid()}));
 return json(await newRunFromCampaign(id,input.requestId),201);
});}
