import {z} from 'zod';
import {api,json,ApiError} from '@/lib/server/api';
import {creativeEditorContext,editorFiles} from '@/lib/server/creative-editor';
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/creative/edits'>){return api(async()=>{
 const id=z.uuid().parse((await ctx.params).id),direction=z.coerce.number().int().min(0).max(2).parse(new URL(request.url).searchParams.get('direction')),c=await creativeEditorContext(id,direction);
 return json({agentProgram:c.agentProgram,source:c.source,input:{brand:c.input.brand,budget:c.input.budget,scope:c.input.scope,variants:c.input.variants,resources:c.resources,policy:c.policy},edits:c.edits,revision:c.revision,sourceHash:c.job.output_hash,approved:c.approved,...await editorFiles(c)});
});}
export async function POST(){return api(async()=>{throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical layer edits are read-only. Send a note in Draft versions to make a new revision.');});}
