import { z } from "zod";
import { api, json, body, sameOrigin, ApiError } from "@/lib/server/api";
import { listComparisons, comparisonFrames, comparisonReport, createComparison, addPair, judgePair, revealComparison, pairPicture, MAX_PICTURE_BYTES } from "@/lib/server/chat-comparison";

// C10: the owner's blind comparisons of a chat result with a pipeline run. GET: the list, a run's frames (?frames=run),
// a run's numbers (?report=run) or a pair's picture (?comparison=…&pair=…&label=A|B). POST: create, judge, reveal (JSON)
// or add a pair (a form with the chat picture).
export async function GET(request:Request){return api(async()=>{
 const url=new URL(request.url),p=url.searchParams;
 if(p.has("frames"))return json(await comparisonFrames(z.uuid().parse(p.get("frames"))));
 if(p.has("report"))return json(await comparisonReport(z.uuid().parse(p.get("report"))));
 if(p.has("pair"))return Response.redirect(await pairPicture({comparisonId:z.uuid().parse(p.get("comparison")),pairId:z.uuid().parse(p.get("pair")),label:z.enum(["A","B"]).parse(p.get("label"))}),302);
 return json(await listComparisons());
});}

const command=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("create"),runId:z.uuid(),briefKind:z.enum(["restrained","product","interface"]),title:z.string().trim().min(1).max(120),chatTokens:z.number().int().min(0).max(100000000).nullable().optional()}),
 z.strictObject({action:z.literal("judge"),comparisonId:z.uuid(),pairId:z.uuid(),verdict:z.enum(["A","B","same"]),note:z.string().max(2000).nullable().optional()}),
 z.strictObject({action:z.literal("reveal"),comparisonId:z.uuid()}),
]);
export async function POST(request:Request){return api(async()=>{
 if(request.headers.get("content-type")?.startsWith("multipart/form-data")){
  sameOrigin(request);
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"FILE_REQUIRED","Choose a picture.");const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_PICTURE_BYTES+20000){await reader.cancel();throw new ApiError(413,"FILE_TOO_LARGE","Choose a picture up to 10 MiB.");}chunks.push(part.value);}
  const form=await new Request(request.url,{method:"POST",headers:{"Content-Type":request.headers.get("content-type")??""},body:Buffer.concat(chunks)}).formData(),file=form.get("picture");
  if(!(file instanceof File))throw new ApiError(400,"FILE_REQUIRED","Choose a picture.");
  const fields=z.strictObject({comparisonId:z.uuid(),label:z.string().trim().min(1).max(80),pipelineEventId:z.uuid()}).parse({comparisonId:form.get("comparisonId"),label:form.get("label"),pipelineEventId:form.get("pipelineEventId")});
  return json(await addPair({...fields,picture:Buffer.from(await file.arrayBuffer())}),201);
 }
 const input=await body(request,command);
 if(input.action==="create")return json(await createComparison(input),201);
 if(input.action==="judge")return json(await judgePair(input));
 return json(await revealComparison(input.comparisonId));
});}
