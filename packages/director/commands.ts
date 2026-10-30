import {z} from 'zod';
import {reviewCommand} from './review';
export const directorCommand=z.discriminatedUnion('action',[
 reviewCommand,
 z.strictObject({action:z.literal('retryCompacted'),directionId:z.uuid(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('recoverDesign'),directionId:z.uuid(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('control'),directionId:z.uuid(),control:z.enum(['wrap-up','stop','note']),recipient:z.enum(['director','assembler']).optional(),text:z.string().trim().min(1).max(4000).optional(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('note'),iterationId:z.uuid(),recipient:z.enum(['director','assembler']),text:z.string().trim().min(1).max(4000),requestId:z.uuid()}),
 z.strictObject({action:z.literal('decide'),directionId:z.uuid(),questionId:z.uuid(),decision:z.string().regex(/^(allow-resource|resume|wrap-up|keep:[a-f0-9-]{36})$/),requestId:z.uuid()}),
 z.strictObject({action:z.literal('quoteRevision'),directionId:z.uuid()}),
 z.strictObject({action:z.literal('approve'),quoteId:z.string().regex(/^[a-f0-9]{64}$/),maxCostMicroUsd:z.number().int().positive()}),
 z.strictObject({action:z.literal('quoteExtend'),directionId:z.uuid(),questionId:z.string().min(1).max(100)}),
 z.strictObject({action:z.literal('extend'),directionId:z.uuid(),questionId:z.string().min(1).max(100),maxCostMicroUsd:z.number().int().positive(),requestId:z.uuid()}),
 z.strictObject({action:z.literal('render'),iterationId:z.uuid(),variantId:z.string().min(1).max(120)})
]);
