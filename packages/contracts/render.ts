import { z } from "zod";
import { frame, id, positiveInt, revisionRef, sha256, unique, version } from "./common";
import { objectKey, parseScene, sceneSpecSchema } from "./scene";

// M00 certifies only a deliberately small local profile, not 1080p/4K production.
export const renderManifestSchema = z.strictObject({
  schemaVersion: version, id, purpose: z.literal("capability-spike"), campaignId: id,
  variantId: id, variantManifest: revisionRef, scopeRevisionId: id,
  scene: revisionRef, compositionId: z.literal("M00Local"),
  props: z.strictObject({ scene: sceneSpecSchema }),
  codeBundleSha256: sha256, lockfileSha256: sha256,
  dependencies: z.array(z.strictObject({ objectKey, sha256 })).nonempty(),
  output: z.strictObject({
    objectKey, width: z.literal(640), height: z.literal(360),
    fps: z.literal(30), durationFrames: z.literal(180),
    frameRange: z.tuple([frame, positiveInt]), // Half-open [start, end).
    container: z.literal("mp4"), videoCodec: z.literal("h264"), audioCodec: z.literal("aac"),
    pixelFormat: z.literal("yuv420p"), colorSpace: z.literal("bt709"),
    audioSampleRate: z.literal(48000), audioChannels: z.literal(2),
    expectedTracks: z.tuple([z.literal("video"), z.literal("audio")]),
    crf: z.literal(18),
  }),
  renderer: z.strictObject({
    backend: z.literal("local-chromium"), remotionVersion: id, nodeVersion: id,
    browserVersion: z.string().min(1), os: z.string().min(1), arch: id,
    gpu: z.string().min(1), concurrency: z.literal(1),
  }),
  seed: frame, frozenAt: z.string().datetime(),
  // A spike is never a release and has no fabricated approvals.
  approvalRefs: z.array(revisionRef).length(0),
});
export type RenderManifest = z.infer<typeof renderManifestSchema>;

export function parseRenderManifest(input: unknown): RenderManifest {
  const manifest = renderManifestSchema.parse(input);
  const scene = parseScene(manifest.props.scene);
  const output = manifest.output;
  if (scene.stage !== "final" || scene.revisionId !== manifest.scene.revisionId || scene.seed !== manifest.seed ||
    output.width !== scene.width || output.height !== scene.height || output.fps !== scene.fps ||
    output.durationFrames !== scene.durationFrames || output.frameRange[0] !== 0 || output.frameRange[1] !== scene.durationFrames) {
    throw new Error("Render profile/props/scene mismatch");
  }
  unique(manifest.dependencies.map((d) => d.objectKey), "render dependency");
  const dependencies = new Map(manifest.dependencies.map((d) => [d.objectKey, d.sha256]));
  for (const asset of scene.assets) if (dependencies.get(asset.objectKey) !== asset.sha256) throw new Error("Unfrozen render asset");
  return manifest;
}
