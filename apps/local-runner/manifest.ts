import assert from "node:assert/strict";
import { z } from "zod";
import { sha256 } from "../../packages/contracts/common";
import { validateVariantManifest } from "../../packages/contracts/campaign";
import { parseRenderManifest, renderManifestSchema } from "../../packages/contracts/render";
import { jsonDigest } from "./files";

export function validateFrozenRender(input: unknown, scopeInput: unknown, variantsInput: unknown) {
  const frozen = z.strictObject({ sha256, manifest: renderManifestSchema }).parse(input);
  assert.equal(jsonDigest(frozen.manifest), frozen.sha256, "Manifest digest mismatch");
  const manifest = parseRenderManifest(frozen.manifest);
  const { scope, manifest: variants } = validateVariantManifest(scopeInput, variantsInput);
  assert.equal(manifest.scene.sha256, jsonDigest(manifest.props.scene), "Scene digest mismatch");
  assert.equal(manifest.variantManifest.sha256, jsonDigest(variants), "Variant manifest digest mismatch");
  assert.equal(manifest.variantManifest.revisionId, variants.revisionId);
  assert.equal(manifest.scopeRevisionId, scope.revisionId);
  assert.equal(manifest.campaignId, scope.campaignId);
  const variant = variants.entries.find((v) => v.id === manifest.variantId);
  assert.ok(variant, "Render variant must be explicitly ordered");
  const placement = scope.placements.find((p) => p.id === variant.placementId)!;
  assert.equal(manifest.props.scene.locale, variant.locale);
  assert.equal(manifest.props.scene.placementId, placement.id);
  assert.equal(manifest.output.width, placement.width);
  assert.equal(manifest.output.height, placement.height);
  assert.equal(manifest.output.fps, placement.fps);
  assert.equal(manifest.output.durationFrames / manifest.output.fps, variant.durationSeconds);
  return manifest;
}
