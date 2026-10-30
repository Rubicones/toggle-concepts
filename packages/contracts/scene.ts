import { z } from "zod";
import { frame, id, positiveInt, rect, sha256, unique, version } from "./common";

// Portable object keys only; no signed URLs, device paths, traversal, or network.
export const objectKey = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/)
  .refine((v) => !v.split("/").some((part) => part === ".." || part === "." || part === ""), "Invalid object key");
const assetBase = { revisionId: id, objectKey, sha256 };
export const assetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...assetBase, kind: z.literal("image"), width: positiveInt, height: positiveInt }),
  z.strictObject({ ...assetBase, kind: z.literal("video"), width: positiveInt, height: positiveInt,
    durationSeconds: z.number().positive(), fps: positiveInt, codec: z.literal("h264"),
    protectedArea: rect }),
  z.strictObject({ ...assetBase, kind: z.literal("audio"), durationSeconds: z.number().positive(),
    sampleRate: positiveInt, channels: positiveInt.max(2) }),
  z.strictObject({ ...assetBase, kind: z.literal("font"), family: id }),
  z.strictObject({ ...assetBase, kind: z.literal("model3d"), cameraRecipeId: id,
    boundsMeters: z.strictObject({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() }) }),
]);
export const finalResourceContractSchema = z.strictObject({
  schemaVersion: version, revisionId: id, logicalResourceId: id, slotId: id,
  referenceAssetRevisionId: id, compositionIntent: z.string().min(1),
  protectedArea: rect, aspectRatio: z.number().positive(), aspectTolerance: z.number().min(0).max(0.1),
  requirement: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("video"), requiredDurationSeconds: z.number().positive(),
      trimStartSeconds: z.number().nonnegative(), motionIntent: z.string().min(1) }),
    z.strictObject({ kind: z.literal("model3d"), cameraRecipeId: id,
      boundsMeters: z.strictObject({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() }) }),
  ]),
});
const layerBase = { id, slotId: id, startFrame: frame, durationFrames: positiveInt, required: z.boolean() };
const heavyBinding = { draftProxyRevisionId: id, finalAssetRevisionId: id.nullable(), contractRevisionId: id };
export const layerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...layerBase, kind: z.literal("text"), copyKey: id, fontSize: positiveInt,
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/), maxLines: positiveInt }),
  z.strictObject({ ...layerBase, kind: z.literal("image"), assetRevisionId: id, fit: z.enum(["contain", "cover"]) }),
  z.strictObject({ ...layerBase, ...heavyBinding, kind: z.literal("video"), fit: z.literal("contain") }),
  z.strictObject({ ...layerBase, ...heavyBinding, kind: z.literal("model3d") }),
  z.strictObject({ ...layerBase, kind: z.literal("audio"), assetRevisionId: id,
    gain: z.number().min(0).max(1), trimStartSeconds: z.number().nonnegative() }),
]);
export const sceneSpecSchema = z.strictObject({
  schemaVersion: version, sceneId: id, revisionId: id, semanticRole: z.enum(["hook", "demo", "proof", "offer", "cta"]),
  scriptRevisionId: id, brandRevisionId: id,
  durationFrames: positiveInt, fps: positiveInt.max(60), seed: frame,
  locale: id, placementId: id, width: positiveInt, height: positiveInt,
  stage: z.enum(["draft", "final"]),
  mandatoryCopyKeys: z.array(id).nonempty(), copy: z.record(id, z.string().min(1)),
  slots: z.array(z.strictObject({ id, role: z.enum(["hero", "headline", "cta", "logo", "audio"]), bounds: rect })).nonempty(),
  layers: z.array(layerSchema).nonempty(), assets: z.array(assetSchema).nonempty(),
  resourceContracts: z.array(finalResourceContractSchema), fontAssetRevisionIds: z.array(id).nonempty(),
  fallbackPolicy: z.literal("review-required-for-visual-change"),
});
export type SceneSpec = z.infer<typeof sceneSpecSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type FinalResourceContract = z.infer<typeof finalResourceContractSchema>;

export function validateSubstitution(contractInput: unknown, assetInput: unknown) {
  const contract = finalResourceContractSchema.parse(contractInput);
  const asset = assetSchema.parse(assetInput);
  if (asset.kind !== contract.requirement.kind) throw new Error("Final resource kind mismatch");
  if (asset.kind === "video" && contract.requirement.kind === "video") {
    if (Math.abs(asset.width / asset.height - contract.aspectRatio) > contract.aspectTolerance) throw new Error("Final aspect ratio mismatch");
    if (asset.durationSeconds + 1e-6 < contract.requirement.trimStartSeconds + contract.requirement.requiredDurationSeconds) throw new Error("Final video too short for trim/duration");
    const a = asset.protectedArea, c = contract.protectedArea;
    if (a.x > c.x || a.y > c.y || a.x + a.w < c.x + c.w || a.y + a.h < c.y + c.h) throw new Error("Final protected area not preserved");
  }
  if (asset.kind === "model3d" && contract.requirement.kind === "model3d") {
    if (asset.cameraRecipeId !== contract.requirement.cameraRecipeId) {
      throw new Error("Final 3D camera mismatch");
    }
    const bounds = contract.requirement.boundsMeters;
    if ((["x", "y", "z"] as const).some((axis) => asset.boundsMeters[axis] > bounds[axis])) throw new Error("Final 3D bounds mismatch");
  }
}

export function parseScene(input: unknown): SceneSpec {
  const scene = sceneSpecSchema.parse(input);
  unique(scene.slots.map((s) => s.id), "slot ID");
  unique(scene.layers.map((l) => l.id), "layer ID");
  unique(scene.assets.map((a) => a.revisionId), "asset revision");
  unique(scene.resourceContracts.map((c) => c.revisionId), "resource contract");
  const slots = new Map(scene.slots.map((s) => [s.id, s]));
  const assets = new Map(scene.assets.map((a) => [a.revisionId, a]));
  for (const slot of scene.slots) if (!slot.id.startsWith(`${scene.sceneId}.`)) throw new Error("Slot ID must be stable and scene-qualified");
  for (const key of scene.mandatoryCopyKeys) {
    if (!scene.copy[key] || !scene.layers.some((l) => l.kind === "text" && l.required && l.copyKey === key)) throw new Error("Missing mandatory copy layer");
  }
  for (const fontId of scene.fontAssetRevisionIds) if (assets.get(fontId)?.kind !== "font") throw new Error("Missing font dependency");
  for (const layer of scene.layers) {
    if (!slots.has(layer.slotId)) throw new Error("Unknown semantic slot");
    if (layer.startFrame + layer.durationFrames > scene.durationFrames) throw new Error("Layer outside half-open scene interval");
    if (layer.kind === "text" && !scene.copy[layer.copyKey]) throw new Error("Missing localized copy");
    if (layer.kind === "image" && assets.get(layer.assetRevisionId)?.kind !== "image") throw new Error("Missing image dependency");
    if (layer.kind === "audio") {
      const audio = assets.get(layer.assetRevisionId);
      if (audio?.kind !== "audio" || audio.durationSeconds < layer.trimStartSeconds + layer.durationFrames / scene.fps) throw new Error("Missing/short audio dependency");
    }
    if (layer.kind === "video" || layer.kind === "model3d") {
      const contract = scene.resourceContracts.find((c) => c.revisionId === layer.contractRevisionId);
      if (!contract || contract.slotId !== layer.slotId || contract.requirement.kind !== layer.kind ||
        contract.referenceAssetRevisionId !== layer.draftProxyRevisionId || assets.get(layer.draftProxyRevisionId)?.kind !== "image") throw new Error("Invalid proxy-to-final binding");
      if (contract.requirement.kind === "video" && contract.requirement.requiredDurationSeconds < layer.durationFrames / scene.fps) throw new Error("Contract duration does not cover layer");
      if (scene.stage === "final") {
        const asset = layer.finalAssetRevisionId ? assets.get(layer.finalAssetRevisionId) : null;
        if (!asset) throw new Error("Final asset required; proxy cannot masquerade as final");
        validateSubstitution(contract, asset);
      }
    }
  }
  return scene;
}
