import {z} from 'zod';
import {api,json} from '@/lib/server/api';
import {liveDirectorPreview,liveDirectorArtifact} from '@/lib/server/director-live';
/** Authenticated, read-only preview. Never queues workflow, model calls or image exports. */
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/director/preview'>){return api(async()=>{
 const {id}=await ctx.params;z.uuid().parse(id);const url=new URL(request.url),direction=z.uuid().parse(url.searchParams.get('direction')),iterationId=url.searchParams.has('iteration')?z.uuid().parse(url.searchParams.get('iteration')):undefined,kind=url.searchParams.get('kind');
 if(!kind)return json(await liveDirectorPreview(id,direction,iterationId));
 const result=await liveDirectorArtifact(id,direction,{iterationId,kind:z.enum(['bundle','asset','source']).parse(kind),revision:url.searchParams.get('revision')??undefined,name:url.searchParams.get('name')??undefined});
 if(result.json)return json(result.json);
 return new Response(new Uint8Array(result.bytes!),{headers:{'Content-Type':result.mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});}
