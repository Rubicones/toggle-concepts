// Read-only provider metadata adapter. Never submits, retries or approves output.
import {z} from 'zod';
import {providerReceiptSchema,generationIdSchema,type ProviderReceipt} from '../contracts/provider-receipt';
const metadata=z.object({data:z.object({id:generationIdSchema,model:z.string(),created_at:z.string(),total_cost:z.number().finite().nonnegative(),finish_reason:z.string().min(1).nullable(),external_user:z.string().nullable().optional(),is_byok:z.boolean()})});
export async function readGenerationReceipt(id:string):Promise<ProviderReceipt>{
 generationIdSchema.parse(id);if(!process.env.OPENROUTER_API_KEY)throw new Error('PROVIDER_NOT_CONFIGURED');
 const url=new URL('https://openrouter.ai/api/v1/generation');url.searchParams.set('id',id);
 let response:Response;try{response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new Error('RECEIPT_LOOKUP_UNAVAILABLE');}
 if(!response.ok)throw new Error(response.status===404?'RECEIPT_NOT_FOUND':response.status===429?'RECEIPT_RATE_LIMITED':'RECEIPT_LOOKUP_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw new Error('INVALID_PROVIDER_RECEIPT');let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new Error('INVALID_PROVIDER_RECEIPT');}chunks.push(part.value);}
 let data;try{data=metadata.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))).data;}catch{throw new Error('INVALID_PROVIDER_RECEIPT');}
 if(data.id!==id)throw new Error('RECEIPT_ID_MISMATCH');if(data.is_byok)throw new Error('BYOK_RECONCILIATION_UNSUPPORTED');if(!data.finish_reason)throw new Error('RECEIPT_NOT_FINAL');
 const created=new Date(data.created_at);if(!Number.isFinite(created.getTime()))throw new Error('INVALID_PROVIDER_RECEIPT');
 try{return providerReceiptSchema.parse({schemaVersion:'1.0',source:'openrouter-generation',generationId:data.id,model:data.model,createdAt:created.toISOString(),observedAt:new Date().toISOString(),externalUser:data.external_user??null,finishReason:data.finish_reason,costMicroUsd:Math.ceil(data.total_cost*1000000),isByok:false});}catch{throw new Error('INVALID_PROVIDER_RECEIPT');}
}
export function bindGenerationReceipt(receipt:ProviderReceipt,step:{id:string;model_id:string;created_at:string;provider_id:string|null},lateProviderId?:string|null){
 const trusted=step.provider_id??lateProviderId??null;
 if(receipt.model!==step.model_id||trusted&&receipt.generationId!==trusted)throw new Error('RECEIPT_ID_MISMATCH');
 if(!trusted&&receipt.externalUser!==step.id)throw new Error('RECEIPT_LINK_UNPROVEN');
 const submittedAt=Date.parse(step.created_at),createdAt=Date.parse(receipt.createdAt);
 if(!Number.isFinite(submittedAt)||createdAt<submittedAt-60000||createdAt>Date.now()+60000)throw new Error('RECEIPT_TIME_MISMATCH');
 return receipt;
}
