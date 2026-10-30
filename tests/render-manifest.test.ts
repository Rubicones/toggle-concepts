import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleScene } from "../fixtures/scene";
import { spikeManifest, spikeScope } from "../fixtures/campaign";
import { jsonDigest } from "../apps/local-runner/files";
import { parseRenderManifest } from "../packages/contracts/render";
import { validateFrozenRender } from "../apps/local-runner/manifest";

const manifest = {
  schemaVersion: "1.0", id: "test-render", purpose: "capability-spike", campaignId: spikeScope.campaignId,
  variantId: spikeManifest.entries[0].id, variantManifest: { revisionId: spikeManifest.revisionId, sha256: jsonDigest(spikeManifest) },
  scopeRevisionId: spikeScope.revisionId, scene: { revisionId: sampleScene.revisionId, sha256: jsonDigest(sampleScene) },
  compositionId: "M00Local", props: { scene: sampleScene }, codeBundleSha256: "a".repeat(64), lockfileSha256: "b".repeat(64),
  dependencies: sampleScene.assets.map((a) => ({ objectKey: a.objectKey, sha256: a.sha256 })),
  output: { objectKey: "exports/m00/sample.mp4", width: 640, height: 360, fps: 30, durationFrames: 180, frameRange: [0, 180],
    container: "mp4", videoCodec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", colorSpace: "bt709",
    audioSampleRate: 48000, audioChannels: 2, expectedTracks: ["video", "audio"], crf: 18 },
  renderer: { backend: "local-chromium", remotionVersion: "4.0.538", nodeVersion: "22.13.1",
    browserVersion: "mock-browser", os: "mock-os", arch: "arm64", gpu: "unmeasured-test", concurrency: 1 },
  seed: 42, frozenAt: "2026-10-24T10:00:00Z", approvalRefs: [],
};

test("RenderManifest freezes exact props, resource digests, backend, tracks, and half-open frames", () => {
  const parsed = parseRenderManifest(manifest);
  assert.equal(parsed.props.scene.revisionId, sampleScene.revisionId);
  assert.deepEqual(parsed.output.frameRange, [0, 180]);
  assert.throws(() => parseRenderManifest({ ...manifest, output: { ...manifest.output, frameRange: [0, 179] } }), /mismatch/);
  assert.throws(() => parseRenderManifest({ ...manifest, dependencies: manifest.dependencies.slice(1) }), /Unfrozen/);
  assert.throws(() => parseRenderManifest({ ...manifest, renderer: { ...manifest.renderer, backend: "hosted" } }));
  assert.throws(() => parseRenderManifest({ ...manifest, props: { scene: { ...sampleScene, stage: "draft" } } }), /mismatch/);
});
test("M00 limits cannot silently expand to unverified profiles", () => {
  assert.throws(() => parseRenderManifest({ ...manifest, output: { ...manifest.output, width: 3840, height: 2160 } }));
  assert.throws(() => parseRenderManifest({ ...manifest, output: { ...manifest.output, fps: 60 } }));
  assert.throws(() => parseRenderManifest({ ...manifest, output: { ...manifest.output, audioCodec: "opus" } }));
  assert.throws(() => parseRenderManifest({ ...manifest, approvalRefs: [{ revisionId: "fake-A3", sha256: "a".repeat(64) }] }));
});

test("frozen hashes and ordered variant/profile must match actual input snapshots", () => {
  const frozen = { sha256: jsonDigest(manifest), manifest };
  assert.equal(validateFrozenRender(frozen, spikeScope, spikeManifest).id, "test-render");
  assert.throws(() => validateFrozenRender({ ...frozen, sha256: "0".repeat(64) }, spikeScope, spikeManifest), /digest/);
  const tampered = { ...manifest, scene: { ...manifest.scene, sha256: "0".repeat(64) } };
  assert.throws(() => validateFrozenRender({ sha256: jsonDigest(tampered), manifest: tampered }, spikeScope, spikeManifest), /Scene digest/);
  const unordered = { ...manifest, variantId: "not-ordered" };
  assert.throws(() => validateFrozenRender({ sha256: jsonDigest(unordered), manifest: unordered }, spikeScope, spikeManifest), /explicitly ordered/);
});
