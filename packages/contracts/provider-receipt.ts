import {z} from 'zod';
export const generationIdSchema=z.string().regex(/^gen-[A-Za-z0-9_-]+$/).max(250);
export const providerReceiptSchema=z.strictObject({schemaVersion:z.literal('1.0'),source:z.literal('openrouter-generation'),generationId:generationIdSchema,model:z.string().min(1).max(250),createdAt:z.iso.datetime(),observedAt:z.iso.datetime(),externalUser:z.string().max(256).nullable(),finishReason:z.string().min(1).max(100),costMicroUsd:z.number().int().nonnegative().safe(),isByok:z.literal(false)});
export type ProviderReceipt=z.infer<typeof providerReceiptSchema>;
export const receiptCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('recoverUnsubmitted'),stepId:z.uuid(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('reconcile'),stepId:z.uuid(),generationId:generationIdSchema.optional(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('reopen'),runId:z.uuid(),requestId:z.uuid(),confirm:z.literal(true)}),
]);
export type Reconciliation={id:string;step_id:string;provider_id:string;actual_cost_micro_usd:number;previous_charge_micro_usd:number;outcome:'applied'|'overrun';created_at:string};
