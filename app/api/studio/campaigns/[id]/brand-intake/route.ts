import { effectiveRunAgents } from "@/packages/data/run-limits";
import { providerFailureSummary } from "@/packages/contracts/provider-error";
import {
    intakeOutputRequest,
    universalIntakeProfile as brandIntakeProfile,
    intakeValidatorVersion,
} from "@/packages/brand/intake-output";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { api, body, json, sameOrigin, ApiError } from "@/lib/server/api";
import { intakeContext, intakeError } from "@/lib/server/brand-intake";
import { schemaMissing } from "@/lib/server/brief";
import { checked, campaignRecord, studioContext } from "@/lib/server/studio";
import {
    brandFileExtensions,
    brandUploadMetadataSchema,
    parseIntakeProposal,
    intakeKitDraft,
    diagnoseIntakeOutput,
    canRecoverIntake,
} from "@/packages/contracts/brand-intake";
import {
    brandDraftSchema,
    emptyBrandDraft,
} from "@/packages/contracts/brand-kit";
import { emptyBrief } from "@/packages/contracts/brief";
import { objectStore } from "@/packages/media/s3.server";
import {
    startLocalWorkflow,
    requireLocalDevice,
} from "@/lib/server/local-compute";
import { modelCatalog } from "@/packages/agents/catalog";
const commands = z.discriminatedUnion("action", [
    z.strictObject({
        action: z.literal("build"),
        requestId: z.uuid(),
        capMicroUsd: z.number().int().min(10000).max(10000000),
        outputTokens: z.number().int().min(64).max(32768).optional(),
    }),
    z.strictObject({
        action: z.literal("include"),
        materialId: z.uuid(),
        included: z.boolean(),
    }),
    z.strictObject({
        action: z.literal("apply"),
        stepId: z.uuid(),
        target: z.enum(["kit", "brief"]),
        expectedVersion: z.number().int().nonnegative(),
    }),
    z.strictObject({ action: z.literal("revalidate"), stepId: z.uuid() }),
    z.strictObject({ action: z.literal("resume") }),
    z.strictObject({ action: z.literal("retry"), materialId: z.uuid() }),
]);
export async function GET(
    request: Request,
    ctx: RouteContext<"/api/studio/campaigns/[id]/brand-intake">,
) {
    return api(async () => {
        const { id } = await ctx.params;
        const textId = new URL(request.url).searchParams.get("text");
        if (textId) {
            await campaignRecord(z.uuid().parse(id));
            const { admin, tenant } = await studioContext();
            const material = checked(
                await admin
                    .from("studio_brand_materials")
                    .select("text:extraction->>text")
                    .eq("tenant_id", tenant)
                    .eq("campaign_id", id)
                    .eq("id", z.uuid().parse(textId))
                    .maybeSingle(),
            );
            if (!material)
                throw new ApiError(
                    404,
                    "MATERIAL_NOT_FOUND",
                    "Brand source not found.",
                );
            return json({
                text: (material.text ?? "").slice(0, 4000),
                characters: (material.text ?? "").length,
            });
        }
        let saved;
        try {
            saved = await intakeContext(z.uuid().parse(id), true);
        } catch (e) {
            if (
                e instanceof ApiError &&
                e.code === "BRAND_INTAKE_SCHEMA_REQUIRED"
            )
                return json({
                    schemaReady: false,
                    materials: [],
                    proposals: [],
                });
            throw e;
        }
        const { admin, tenant } = saved;
        const query = new URL(request.url).searchParams,
            source = query.get("source"),
            preview = query.get("preview");
        if (source || preview) {
            const material = saved.materials.find(
                (m) => m.id === z.uuid().parse(source ?? preview),
            );
            if (!material)
                throw new ApiError(
                    404,
                    "MATERIAL_NOT_FOUND",
                    "Brand source not found.",
                );
            const visual = preview
                ? material.extraction?.images.find(
                      (i) => i.page === Number(query.get("page") ?? 1),
                  )
                : null;
            if (preview && !visual)
                throw new ApiError(
                    404,
                    "PREVIEW_NOT_READY",
                    "This visual preview is not available yet.",
                );
            const key =
                    visual?.objectKey ??
                    `media/${tenant}/${saved.campaign.id}/brand/${material.id}/source`,
                bytes = (await objectStore().get(key)).body;
            if (
                createHash("sha256").update(bytes).digest("hex") !==
                (visual?.sha256 ?? material.sha256)
            )
                throw new Error("SOURCE_HASH_MISMATCH");
            return new Response(new Uint8Array(bytes), {
                headers: {
                    "Content-Type": visual
                        ? "image/jpeg"
                        : "application/octet-stream",
                    "Content-Disposition": `${visual ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(visual ? material.filename + ".jpg" : material.filename)}`,
                    "Cache-Control": "private, no-store",
                    "X-Content-Type-Options": "nosniff",
                    "Content-Security-Policy": "default-src 'none'; sandbox",
                },
            });
        }
        const steps =
            checked(
                await admin
                    .from("studio_agent_steps")
                    .select(
                        "id,status,output,error_code,cost_micro_usd,config_snapshot,usage",
                    )
                    .eq("tenant_id", tenant)
                    .eq("campaign_id", saved.campaign.id)
                    .eq("role", "brand-kit")
                    .order("created_at", { ascending: false })
                    .limit(20),
            ) ?? [];
        const recoveryResult = await admin
            .from("studio_brand_intake_validations")
            .select("step_id,output_sha256,validator_version")
            .eq("tenant_id", tenant)
            .eq("campaign_id", saved.campaign.id);
        if (recoveryResult.error && !schemaMissing(recoveryResult.error))
            throw new Error(recoveryResult.error.message);
        const recoveryReady = !recoveryResult.error;
        const allowanceResult = await admin
            .from("studio_intake_output_revisions")
            .select("id")
            .limit(0);
        if (allowanceResult.error && !schemaMissing(allowanceResult.error))
            throw new Error(allowanceResult.error.message);
        const outputAllowanceReady = !allowanceResult.error;
        const proposals = steps
            .filter((s) => s.config_snapshot.materialFingerprint)
            .map((s) => {
                const sources = (
                        (s.config_snapshot.brandMaterialIds ?? []) as string[]
                    ).map((id) => ({ id })),
                    recoverable = canRecoverIntake(s, sources),
                    recovered =
                        recoverable &&
                        !!recoveryResult.data?.some(
                            (v) =>
                                v.step_id === s.id &&
                                v.validator_version ===
                                    intakeValidatorVersion &&
                                v.output_sha256 ===
                                    createHash("sha256")
                                        .update(s.output!)
                                        .digest("hex"),
                        );
                let proposal = null;
                try {
                    if ((s.status === "succeeded" || recovered) && s.output)
                        proposal = parseIntakeProposal(s.output, sources);
                } catch {}
                const providerFailure = s.error_code?.startsWith("PROVIDER_")
                    ? providerFailureSummary(s.error_code, s.output, s.usage)
                    : null;
                const diagnostic = recovered
                    ? null
                    : providerFailure
                      ? {
                            code: s.error_code,
                            message: providerFailure.message,
                            issues: providerFailure.details,
                        }
                      : diagnoseIntakeOutput(
                            s.output,
                            sources,
                            s.config_snapshot.maxOutputTokens,
                            s.usage?._studio?.finishReason,
                        );
                return {
                    ...s,
                    outputTokens: s.config_snapshot.maxOutputTokens,
                    config_snapshot: undefined,
                    usage: undefined,
                    current:
                        s.config_snapshot.materialFingerprint ===
                        saved.fingerprint,
                    proposal,
                    recoverable: recoverable && !recovered,
                    recovered,
                    diagnostic,
                };
            });
        const updates = await admin
            .from("studio_brandbook_brief_prefills")
            .select("submission_id")
            .limit(0);
        if (updates.error && !schemaMissing(updates.error))
            throw new Error(updates.error.message);
        const updatesReady = !updates.error;
        const runId =
            saved.c1?.run_id ??
            checked(
                await admin
                    .from("studio_brand_intake_runs")
                    .select("run_id")
                    .eq("campaign_id", saved.campaign.id)
                    .maybeSingle(),
            )?.run_id;
        const run = runId
            ? checked(
                  await admin
                      .from("studio_runs")
                      .select(
                          "id,cap_micro_usd,charged_micro_usd,reserved_micro_usd,status,config_snapshot",
                      )
                      .eq("tenant_id", tenant)
                      .eq("id", runId)
                      .single(),
              )
            : null;
        return json({
            schemaReady: true,
            updatesReady,
            recoveryReady,
            outputAllowanceReady,
            notesDraft: saved.campaign.document.brandIntakeNotes ?? "",
            campaignVersion: saved.campaign.version,
            materials: saved.materials.map((m) => ({
                id: m.id,
                filename: m.filename,
                relative_path: m.relative_path,
                mime: m.mime,
                bytes: m.bytes,
                sha256: m.sha256,
                state: m.state,
                included: m.included,
                error_code: m.error_code,
                extraction_sha: m.extraction_sha,
                created_at: m.created_at,
                extractedChars: m.extractedChars,
                extraction: m.extraction
                    ? {
                          ...m.extraction,
                          text: m.extraction.text.slice(0, 4000),
                      }
                    : null,
            })),
            fingerprint: saved.fingerprint,
            hasC1: !!saved.c1,
            a1Accepted: saved.a1Accepted,
            briefVersion: saved.brief?.version ?? 0,
            brief: saved.brief?.payload ?? {},
            proposals,
            run: run
                ? {
                      ...run,
                      config_snapshot: undefined,
                      outputTokens:
                          (await effectiveRunAgents(admin, run)).find(
                              (a) => a.role === "brand-kit",
                          )?.max_output_tokens ?? null,
                  }
                : null,
        });
    });
}
export async function PUT(
    request: Request,
    ctx: RouteContext<"/api/studio/campaigns/[id]/brand-intake">,
) {
    return api(async () => {
        sameOrigin(request);
        requireLocalDevice();
        const { id } = await ctx.params,
            saved = await intakeContext(z.uuid().parse(id));
        const reader = request.body?.getReader();
        if (!reader)
            throw new ApiError(
                400,
                "FILE_REQUIRED",
                "Choose brand files or paste text.",
            );
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > 52428800 + 20000) {
                await reader.cancel();
                throw new ApiError(
                    413,
                    "FILE_TOO_LARGE",
                    "The current upload transport supports brand files up to 50 MiB. Content is read in resumable parts.",
                );
            }
            chunks.push(part.value);
        }
        let form: FormData;
        try {
            form = await new Request(request.url, {
                method: "POST",
                headers: {
                    "Content-Type": request.headers.get("content-type") ?? "",
                },
                body: Buffer.concat(chunks),
            }).formData();
        } catch {
            throw new ApiError(
                400,
                "INVALID_UPLOAD",
                "The file upload could not be read. Select the files again and retry.",
            );
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 1 || file.size > 52428800)
            throw new ApiError(
                400,
                "FILE_REQUIRED",
                "Choose a nonempty file up to the 50 MiB upload transport limit.",
            );
        const metadata = brandUploadMetadataSchema.safeParse({
            filename: file.name,
            relativePath: form.get("relativePath") || file.name,
            requestId: form.get("requestId"),
        });
        if (!metadata.success) {
            const field = metadata.error.issues[0]?.path[0];
            const messages: Record<string, string> = {
                filename:
                    "Use a file name up to 120 characters and a relative folder path without parent-directory segments.",
                relativePath:
                    "Use a relative folder path up to 500 characters ending with the file name, without empty or parent-directory segments.",
                requestId:
                    "This upload is missing a valid request identifier. Select the files again.",
            };
            throw new ApiError(
                400,
                "INVALID_UPLOAD_METADATA",
                messages[String(field)] ??
                    "The file metadata is invalid. Select the files again.",
            );
        }
        const { filename, relativePath: path, requestId } = metadata.data;
        const ext = filename.split(".").pop()?.toLowerCase();
        if (
            !brandFileExtensions.includes(
                ext as (typeof brandFileExtensions)[number],
            )
        )
            throw new ApiError(
                415,
                "UNSUPPORTED_FORMAT",
                `${filename}: choose an image, PDF, Word/text document or TTF/OTF/WOFF font.`,
            );
        const prior = checked(
            await saved.admin
                .from("studio_brand_materials")
                .select("id,sha256")
                .eq("tenant_id", saved.tenant)
                .eq("campaign_id", saved.campaign.id)
                .eq("request_id", requestId)
                .maybeSingle(),
        );
        const data = Buffer.from(await file.arrayBuffer()),
            sha = createHash("sha256").update(data).digest("hex");
        if (prior) {
            if (prior.sha256 !== sha) throw new Error("REQUEST_CONFLICT");
            await startLocalWorkflow();
            return json({ id: prior.id });
        }
        const duplicate = saved.materials.find(
            (m) => m.relative_path === path && m.sha256 === sha,
        );
        if (duplicate) {
            await startLocalWorkflow();
            return json({ id: duplicate.id });
        }
        if (file.size > 10485760 || saved.materials.length >= 100) {
            const schema = await saved.admin
                .from("studio_brand_material_parts")
                .select("material_id")
                .limit(0);
            if (schema.error)
                throw new ApiError(
                    503,
                    "BRAND_FIELDS_SCHEMA_REQUIRED",
                    "Enable incremental Brand Kit fields in Settings before larger source uploads.",
                );
        }
        const materialId = randomUUID(),
            key = `media/${saved.tenant}/${saved.campaign.id}/brand/${materialId}/source`;
        await objectStore().promote(key, data, "application/octet-stream");
        const result = await saved.admin.rpc("studio_add_brand_material", {
            target_campaign: saved.campaign.id,
            material: materialId,
            request_key: requestId,
            name: filename,
            path,
            mime_type: file.type || "application/octet-stream",
            size_bytes: data.length,
            digest: sha,
            source_key: key,
            acting_user: saved.actorId,
        });
        if (result.error) {
            await objectStore()
                .delete(key)
                .catch(() => {});
            intakeError(result.error);
        }
        if (result.data.id !== materialId)
            await objectStore()
                .delete(key)
                .catch(() => {});
        await startLocalWorkflow();
        return json({ id: result.data.id }, 201);
    });
}
export async function POST(
    request: Request,
    ctx: RouteContext<"/api/studio/campaigns/[id]/brand-intake">,
) {
    return api(async () => {
        const { id } = await ctx.params,
            input = await body(request, commands),
            saved = await intakeContext(z.uuid().parse(id)),
            { admin, tenant, actorId } = saved;
        if (input.action === "retry") {
            intakeError(
                (
                    await admin.rpc("studio_retry_brand_material", {
                        target_material: input.materialId,
                        acting_user: actorId,
                    })
                ).error,
            );
            await startLocalWorkflow();
            return json({
                message:
                    "File queued for another local extraction. No AI call was made.",
            });
        }
        if (input.action === "resume") {
            await startLocalWorkflow();
            return json({ message: "Local brand-file processing resumed." });
        }
        if (input.action === "include") {
            if (!saved.materials.some((m) => m.id === input.materialId))
                throw new ApiError(
                    404,
                    "MATERIAL_NOT_FOUND",
                    "Brand source not found.",
                );
            intakeError(
                (
                    await admin.rpc("studio_include_brand_material", {
                        target_material: input.materialId,
                        selected: input.included,
                        acting_user: actorId,
                    })
                ).error,
            );
            return json({ message: "Included brand pack updated." });
        }
        const included = saved.materials.filter((m) => m.included);
        if (input.action === "revalidate") {
            const step = checked(
                await admin
                    .from("studio_agent_steps")
                    .select("*")
                    .eq("id", input.stepId)
                    .eq("tenant_id", tenant)
                    .eq("campaign_id", saved.campaign.id)
                    .eq("role", "brand-kit")
                    .single(),
            );
            if (
                !step ||
                step.config_snapshot.materialFingerprint !== saved.fingerprint
            )
                throw new ApiError(
                    409,
                    "STALE_PROPOSAL",
                    "Sources changed. This response cannot be recovered for the current pack.",
                );
            const sources = (
                (step.config_snapshot.brandMaterialIds ?? []) as string[]
            ).map((id) => ({ id }));
            if (!canRecoverIntake(step, sources))
                throw new ApiError(
                    409,
                    "INVALID_PROPOSAL",
                    "This saved output is incomplete, uncertain or fails the current sourced-kit contract. No provider request was made.",
                );
            const result = await admin.rpc("studio_revalidate_intake", {
                target_step: step.id,
                output_sha: createHash("sha256")
                    .update(step.output)
                    .digest("hex"),
                validator: intakeValidatorVersion,
                acting_user: actorId,
            });
            if (result.error && schemaMissing(result.error))
                throw new ApiError(
                    503,
                    "INTAKE_RECOVERY_SCHEMA_REQUIRED",
                    "Enable saved response recovery with the migration in this panel first.",
                );
            intakeError(result.error);
            return json({
                message:
                    "Saved response recovered for review. No AI call or additional charge. Original failure and costs are preserved.",
            });
        }
        if (input.action === "apply") {
            const step = checked(
                await admin
                    .from("studio_agent_steps")
                    .select("*")
                    .eq("id", input.stepId)
                    .eq("tenant_id", tenant)
                    .eq("campaign_id", saved.campaign.id)
                    .eq("role", "brand-kit")
                    .single(),
            );
            if (
                !step ||
                step.config_snapshot.materialFingerprint !== saved.fingerprint
            )
                throw new ApiError(
                    409,
                    "STALE_PROPOSAL",
                    "Sources changed; this proposal cannot replace current work.",
                );
            if (step.status !== "succeeded") {
                const validation = checked(
                    await admin
                        .from("studio_brand_intake_validations")
                        .select("output_sha256,validator_version")
                        .eq("step_id", step.id)
                        .maybeSingle(),
                );
                if (
                    !canRecoverIntake(
                        step,
                        (
                            (step.config_snapshot.brandMaterialIds ??
                                []) as string[]
                        ).map((id) => ({ id })),
                    ) ||
                    validation?.validator_version !== intakeValidatorVersion ||
                    validation.output_sha256 !==
                        createHash("sha256").update(step.output).digest("hex")
                )
                    throw new ApiError(
                        409,
                        "INVALID_PROPOSAL",
                        "Recover this saved response for review first.",
                    );
            }
            let proposal;
            try {
                proposal = parseIntakeProposal(
                    step.output,
                    (
                        (step.config_snapshot.brandMaterialIds ??
                            []) as string[]
                    ).map((id) => ({ id })),
                );
            } catch {
                throw new ApiError(
                    409,
                    "INVALID_PROPOSAL",
                    "The response does not contain a complete sourced kit. Inspect agent activity or request a correction.",
                );
            }
            if (input.target === "brief") {
                if (saved.c1)
                    throw new ApiError(
                        409,
                        "C1_IMMUTABLE",
                        "The submitted C1 brief is unchanged. These answers are suggestions only.",
                    );
                let version = saved.brief?.version ?? 0;
                if (version !== input.expectedVersion)
                    throw new ApiError(
                        409,
                        "STALE_BRIEF",
                        "Reload the questionnaire before applying suggestions.",
                    );
                if (!saved.brief) {
                    const created = await admin.rpc("studio_save_brief", {
                        target_campaign: saved.campaign.id,
                        expected_version: 0,
                        draft: emptyBrief(saved.campaign.goal),
                        acting_user: actorId,
                    });
                    intakeError(created.error);
                    version = created.data.version;
                }
                const patch = Object.fromEntries(
                    proposal.briefSuggestions.map((s) => [s.field, s.value]),
                );
                const result = await admin.rpc("studio_apply_intake_brief", {
                    target_step: step.id,
                    expected_version: version,
                    patch,
                    acting_user: actorId,
                });
                intakeError(result.error);
                return json({
                    message:
                        "Unanswered brief fields filled as editable suggestions. Existing answers, approvals, rights and scope were preserved.",
                });
            }
            if (!saved.c1)
                throw new ApiError(
                    409,
                    "C1_REQUIRED",
                    "Your proposed kit is saved. Submit C1 first, then bring it into A1 review.",
                );
            if (saved.a1Accepted)
                throw new ApiError(
                    409,
                    "A1_IMMUTABLE",
                    "The accepted kit cannot be overwritten.",
                );
            const existing = checked(
                await admin
                    .from("studio_brand_drafts")
                    .select("version,payload")
                    .eq("tenant_id", tenant)
                    .eq("campaign_id", saved.campaign.id)
                    .maybeSingle(),
            );
            if ((existing?.version ?? 0) !== input.expectedVersion)
                throw new ApiError(
                    409,
                    "STALE_BRAND",
                    "The kit changed. Refresh before applying.",
                );
            const base = existing
                    ? brandDraftSchema.parse(existing.payload)
                    : emptyBrandDraft(saved.c1.payload.scope.locales),
                draft = brandDraftSchema.parse(
                    intakeKitDraft(
                        proposal,
                        base,
                        included,
                        step.id,
                        randomUUID,
                    ),
                );
            // The source proposal may predate C1. Keep its original provider-step provenance; guarded import binds its exact source set to this campaign.
            const result = await admin.rpc("studio_import_intake_kit", {
                target_campaign: saved.campaign.id,
                target_step: step.id,
                expected_version: input.expectedVersion,
                draft,
                acting_user: actorId,
            });
            intakeError(result.error);
            return json({
                message:
                    "Complete proposed kit loaded for A1 review. Source, rights and approval confirmations remain yours.",
            });
        }
        requireLocalDevice();
        if (saved.a1Accepted)
            throw new ApiError(
                409,
                "A1_IMMUTABLE",
                "The accepted Brand Kit remains fixed. New analysis requires an explicit future reopen.",
            );
        if (!included.length)
            throw new ApiError(
                409,
                "NO_MATERIALS",
                "Add your brand files or paste notes first.",
            );
        if (included.some((m) => m.state !== "ready"))
            throw new ApiError(
                409,
                "MATERIALS_NOT_READY",
                "Files are still processing, or need attention. Exclude unreadable items explicitly before building.",
            );
        if (included.some((m) => m.extraction?.metadata.paged))
            throw new ApiError(
                409,
                "USE_INCREMENTAL_BRAND_FIELDS",
                "Use Analyze new / unfinished files in Brand Kit. Long sources are processed as individual saved parts.",
            );
        const images = included.flatMap((m) =>
            m.extraction!.images.map((i) => ({ ...i, materialId: m.id })),
        );
        if (images.length > 160)
            throw new ApiError(
                409,
                "VISION_PACK_LIMIT",
                "This pack has more than 160 visual pages. Split it into a smaller selection; no source will be silently skipped.",
            );
        if (!process.env.OPENROUTER_API_KEY)
            throw new Error("PROVIDER_NOT_CONFIGURED");
        const prior = checked(
            await admin
                .from("studio_agent_steps")
                .select("id,campaign_id,config_snapshot")
                .eq("tenant_id", tenant)
                .eq("request_id", input.requestId)
                .maybeSingle(),
        );
        if (prior) {
            if (
                prior.campaign_id !== saved.campaign.id ||
                prior.config_snapshot.materialFingerprint !== saved.fingerprint
            )
                throw new Error("REQUEST_CONFLICT");
            await startLocalWorkflow();
            return json({ message: "Existing brand build resumed." }, 202);
        }
        const active = checked(
            await admin
                .from("studio_agent_steps")
                .select("id")
                .eq("tenant_id", tenant)
                .eq("campaign_id", saved.campaign.id)
                .eq("role", "brand-kit")
                .in("status", ["reserved", "running"])
                .eq("config_snapshot->>materialFingerprint", saved.fingerprint)
                .limit(1),
        );
        if (active?.length) {
            await startLocalWorkflow();
            return json(
                {
                    message:
                        "This brand pack already has an active build. Its original request and budget are retained.",
                },
                202,
            );
        }
        const runResult = await admin.rpc("studio_intake_run", {
            target_campaign: saved.campaign.id,
            cap: input.capMicroUsd,
            acting_user: actorId,
        });
        intakeError(runResult.error);
        let run = runResult.data;
        const frozenAgent = (await effectiveRunAgents(admin, run)).find(
            (a) => a.role === "brand-kit",
        );
        const requestedOutput =
            input.outputTokens ??
            (saved.c1 ? frozenAgent?.max_output_tokens : 16384);
        const truncated = checked(
            await admin
                .from("studio_agent_steps")
                .select("config_snapshot")
                .eq("tenant_id", tenant)
                .eq("campaign_id", saved.campaign.id)
                .eq("role", "brand-kit")
                .eq("error_code", "OUTPUT_TOKEN_LIMIT")
                .eq("config_snapshot->>materialFingerprint", saved.fingerprint)
                .order("created_at", { ascending: false })
                .limit(1),
        )?.[0];
        if (
            truncated &&
            Number(requestedOutput) <=
                Number(truncated.config_snapshot.maxOutputTokens)
        )
            throw new ApiError(
                409,
                "OUTPUT_ALLOWANCE_TOO_SMALL",
                "This source pack already exceeded that output limit. Choose a larger allowance before building again. A submitted C1 cannot be changed in place. No AI request was made.",
            );
        if (saved.c1 && requestedOutput !== frozenAgent?.max_output_tokens)
            throw new ApiError(
                409,
                "C1_IMMUTABLE",
                "The submitted C1 output limit is fixed. Configure larger output before submitting a future C1.",
            );
        if (!saved.c1 && requestedOutput !== frozenAgent?.max_output_tokens) {
            const changed = await admin.rpc("studio_set_intake_output", {
                target_campaign: saved.campaign.id,
                output_tokens: requestedOutput,
                acting_user: actorId,
            });
            if (changed.error && schemaMissing(changed.error))
                throw new ApiError(
                    503,
                    "OUTPUT_ALLOWANCE_SCHEMA_REQUIRED",
                    "Enable the Brand output allowance migration in this panel before building. No AI request was made.",
                );
            intakeError(changed.error);
            run = changed.data;
        }
        const agent = (await effectiveRunAgents(admin, run)).find(
            (a) => a.role === "brand-kit",
        );
        if (agent?.model_id !== "google/gemini-2.5-flash")
            throw new ApiError(
                409,
                "VISION_MODEL_UNSUPPORTED",
                "This brand-vision adapter requires the saved Gemini 2.5 Flash model. Existing runs keep their frozen settings.",
            );
        const model = (await modelCatalog()).find(
            (m) => m.id === agent.model_id,
        );
        if (!model) throw new Error("MODEL_UNAVAILABLE");
        if (
            !model.supportedParameters.includes("structured_outputs") ||
            !model.supportedParameters.includes("response_format")
        )
            throw new ApiError(
                409,
                "STRUCTURED_OUTPUT_UNAVAILABLE",
                "This model endpoint cannot enforce the Brand Kit response contract. No generation was submitted.",
            );
        const maxOutput = Math.min(agent.max_output_tokens, model.maxOutput);
        if (
            truncated &&
            maxOutput <= Number(truncated.config_snapshot.maxOutputTokens)
        )
            throw new ApiError(
                409,
                "MODEL_OUTPUT_ALLOWANCE_TOO_SMALL",
                "This model endpoint cannot provide more output than the previous truncated attempt. No AI request was made.",
            );
        const { prompt, responseSchema } = intakeOutputRequest(
            included.length,
            maxOutput,
        );
        const campaignContext = {
            draftReplay: saved.draftReplay,
            checkpointId: saved.c1?.id ?? null,
            campaign: {
                name: saved.campaign.name,
                brand: saved.campaign.brand,
                goal: saved.campaign.goal,
            },
            brief: saved.c1
                ? JSON.parse(saved.c1.brief_text)
                : (saved.brief?.payload ?? emptyBrief(saved.campaign.goal)),
            brandMaterials: included.map((m, sourceIndex) => ({
                sourceIndex,
                id: m.id,
                filename: m.relative_path,
                sha256: m.sha256,
                extractionSha: m.extraction_sha,
                extraction: m.extraction,
            })),
        };
        if (Buffer.byteLength(JSON.stringify(campaignContext), "utf8") > 300000)
            throw new ApiError(
                409,
                "TEXT_PACK_LIMIT",
                "This source pack exceeds the per-request text limit. Include a smaller selection; no text will be silently dropped.",
            );
        const inputBound =
            Buffer.byteLength(
                agent.instructions +
                    prompt +
                    JSON.stringify(campaignContext) +
                    JSON.stringify(responseSchema),
                "utf8",
            ) +
            2048 +
            images.length * (4096 + 128);
        if (inputBound + maxOutput > model.contextLength)
            throw new Error("PROMPT_TOO_LONG");
        const reservation = Math.max(
            1,
            Math.ceil(
                (inputBound * model.inputPrice +
                    maxOutput * model.outputPrice) *
                    1000000 *
                    1.1,
            ),
        );
        const result = await admin.rpc("studio_enqueue_text", {
            target_run: run.id,
            request_key: input.requestId,
            agent_role: "brand-kit",
            model: agent.model_id,
            prompt_text: prompt,
            snapshot: {
                instructions: agent.instructions,
                maxOutputTokens: maxOutput,
                stepCapMicroUsd: agent.step_cap_micro_usd,
                pricing: model,
                campaignContext,
                budgetScopeId: saved.c1
                    ? `budget-step-${run.id}-brand-kit`
                    : null,
                outputFormat: "json_schema",
                responseSchema,
                brandIntakeProfile,
                disableReasoning: true,
                materialFingerprint: saved.fingerprint,
                brandMaterialIds: included.map((m) => m.id),
                brandVisionImages: images,
            },
            reservation,
            acting_user: actorId,
        });
        intakeError(result.error);
        await startLocalWorkflow();
        return json(
            {
                message:
                    "Gemini is reading the included brand pack and building your kit and brief suggestions.",
            },
            202,
        );
    });
}
