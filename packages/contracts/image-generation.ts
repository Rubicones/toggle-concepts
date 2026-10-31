import { z } from "zod";

export const imageAspectRatios = ["1:1", "9:16", "16:9", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "21:9"] as const;
export const derivedReferenceSchema=z.strictObject({sha256:z.string().regex(/^[a-f0-9]{64}$/),mime:z.enum(['image/png','image/jpeg']),bytes:z.number().int().positive().max(4194304),width:z.number().int().positive().max(2048),height:z.number().int().positive().max(2048),objectKey:z.string().regex(/^staging\/director-derived\/[a-f0-9]{64}\.(png|jpg)$/)});
export const imageOptionsSchema = z.strictObject({aspectRatio:z.enum(imageAspectRatios).default('1:1'),referenceAssetIds:z.array(z.uuid()).max(3).default([]),referenceUseConfirmed:z.boolean().default(false),derivedReferences:z.array(derivedReferenceSchema).max(2).optional()}).superRefine((v,ctx)=>{if(new Set(v.referenceAssetIds).size!==v.referenceAssetIds.length||v.referenceAssetIds.length&&!v.referenceUseConfirmed)ctx.addIssue({code:'custom',message:'Confirm permission to use up to three distinct image references.'});});
export const generatedImageSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), kind: z.literal("generated-image"),
  uploadId: z.uuid(), filename: z.string().min(1).max(180),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]), bytes: z.number().int().positive().max(10485760),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(),
  aspectRatio: z.enum(imageAspectRatios),modelId:z.string().optional(),providerGenerationId:z.string().nullable().optional(),references:z.array(z.strictObject({id:z.uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(3).optional(),
});
export type GeneratedImage = z.infer<typeof generatedImageSchema>;
export type DerivedReference=z.infer<typeof derivedReferenceSchema>;
