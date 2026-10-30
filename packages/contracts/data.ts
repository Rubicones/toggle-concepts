import { z } from "zod";
export const uuid = z.uuid();
export const uploadRequestSchema = z.strictObject({ schemaVersion: z.literal("1.0"), campaignId: uuid, requestId: uuid,
  filename: z.string().trim().min(1).max(120).regex(/^[^\r\n/\\]+$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "audio/wav"]),
  bytes: z.number().int().positive().max(10 * 1024 * 1024) });
export const campaignRequestSchema = z.strictObject({ tenantId: uuid, name: z.string().trim().min(1).max(80), brand: z.string().trim().min(1).max(60) });
export const noteRequestSchema = z.strictObject({ campaignId: uuid, expectedVersion: z.number().int().positive(), note: z.string().trim().min(1).max(4000) });
export const shareRequestSchema = z.strictObject({ confirmRights: z.literal(true) });
export const membershipSchema = z.strictObject({ tenant_id: uuid, tenant_name: z.string(), role: z.enum(["owner", "producer", "art_director", "client"]) });
export const storedCampaignSchema = z.strictObject({ id: uuid, tenant_id: uuid, name: z.string(), brand: z.string(), version: z.number().int(), created_at: z.string() });
export const assetSummarySchema = z.strictObject({ id: uuid, campaign_id: uuid, filename: z.string(), mime: z.string(), bytes: z.number().int(), sha256: z.string().regex(/^[a-f0-9]{64}$/), created_at: z.string() });
export const clientCampaignSchema = z.strictObject({ id: uuid, name: z.string(), brand: z.string() });
export const clientAssetSchema = z.strictObject({ id: uuid, filename: z.string(), mime: z.string(), bytes: z.number().int(), sha256: z.string(), shared_at: z.string() });
export const uploadSummarySchema = z.strictObject({ id: uuid, campaign_id: uuid, filename: z.string(), state: z.enum(["uploading", "uploaded", "promoting", "validating", "ready", "rejected", "expired"]), error_code: z.string().nullable(), created_at: z.string() });
export const noteSummarySchema = z.strictObject({ id: uuid, payload: z.strictObject({ schemaVersion: z.literal("1.0"), note: z.string() }), created_at: z.string() });
export const workspaceResponseSchema = z.strictObject({ email: z.string(), memberships: z.array(membershipSchema), campaigns: z.array(storedCampaignSchema),
  assets: z.array(assetSummarySchema), uploads: z.array(uploadSummarySchema), publications: z.array(z.strictObject({ asset_revision_id: uuid })), notes: z.array(noteSummarySchema) });
export const clientResponseSchema = z.strictObject({ email: z.string(), campaigns: z.array(clientCampaignSchema), assets: z.array(clientAssetSchema) });
export const readAccessSchema = z.strictObject({ url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int(), mime: z.string(), filename: z.string(), expiresAt: z.string().datetime() });
export const uploadAccessSchema = z.strictObject({ id: uuid, url: z.url(), headers: z.strictObject({ "Content-Type": z.string() }), expiresAt: z.string().datetime() });
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type ClientResponse = z.infer<typeof clientResponseSchema>;
export const accessRequestSchema = z.strictObject({ campaignId: uuid, userId: uuid, allowAccess: z.boolean() });
export const accessResponseSchema = z.array(z.strictObject({ user_id: uuid, email: z.email(), role: z.enum(["art_director", "client"]), assigned: z.boolean() }));
