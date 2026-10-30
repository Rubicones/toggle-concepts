import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseScene } from "../packages/contracts/scene";

const root = process.cwd();
mkdirSync(resolve(root, "public/fixtures"), { recursive: true });
// Tiny authored control signals. No network, AI, or stock-media licensing required.
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
  "testsrc2=size=320x180:rate=30:duration=6", "-an", "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p",
  "-map_metadata", "-1", "-movflags", "+faststart", resolve(root, "public/fixtures/motion.mp4")]);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
  "sine=frequency=440:sample_rate=48000:duration=6", "-af", "afade=t=in:st=0:d=0.15,afade=t=out:st=5.6:d=0.4,volume=0.6",
  "-c:a", "pcm_s16le", "-map_metadata", "-1", resolve(root, "public/fixtures/tone.wav")]);
for (const subset of ["latin", "cyrillic"]) copyFileSync(
  resolve(root, `node_modules/@fontsource/noto-sans/files/noto-sans-${subset}-400-normal.woff2`),
  resolve(root, `public/fixtures/noto-${subset}.woff2`));
copyFileSync(resolve(root, "node_modules/@fontsource/noto-sans/LICENSE"), resolve(root, "public/fixtures/OFL.txt"));
const hash = (key: string) => createHash("sha256").update(readFileSync(resolve(root, "public", key))).digest("hex");
const common = { startFrame: 0, durationFrames: 180, required: true };
const scene = parseScene({
  schemaVersion: "1.0", sceneId: "m00-demo", revisionId: "m00-scene-r1", semanticRole: "demo",
  scriptRevisionId: "m00-script-r1", brandRevisionId: "m00-brand-r1",
  width: 640, height: 360, durationFrames: 180, fps: 30, seed: 42,
  locale: "ru-RU", placementId: "spike-wide", stage: "final",
  mandatoryCopyKeys: ["headline", "cta"],
  copy: { headline: "Свет для важных дел", cta: "Посмотреть Luma One", logo: "LUMA / ЛОКАЛЬНЫЙ ТЕСТ" },
  slots: [
    { id: "m00-demo.headline", role: "headline", bounds: { x: 0.06, y: 0.22, w: 0.49, h: 0.30 } },
    { id: "m00-demo.cta", role: "cta", bounds: { x: 0.06, y: 0.78, w: 0.49, h: 0.12 } },
    { id: "m00-demo.logo", role: "logo", bounds: { x: 0.06, y: 0.08, w: 0.53, h: 0.08 } },
    { id: "m00-demo.hero", role: "hero", bounds: { x: 0.60, y: 0.12, w: 0.34, h: 0.47 } },
    { id: "m00-demo.motion", role: "hero", bounds: { x: 0.60, y: 0.65, w: 0.34, h: 0.24 } },
    { id: "m00-demo.audio", role: "audio", bounds: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  layers: [
    { ...common, id: "logo", kind: "text", slotId: "m00-demo.logo", copyKey: "logo", fontSize: 12, color: "#bac69e", maxLines: 1 },
    { ...common, id: "headline", kind: "text", slotId: "m00-demo.headline", copyKey: "headline", fontSize: 34, color: "#f3f1e8", maxLines: 2 },
    { ...common, id: "image", kind: "image", slotId: "m00-demo.hero", assetRevisionId: "lamp-r1", fit: "contain" },
    { ...common, id: "video", kind: "video", slotId: "m00-demo.motion", draftProxyRevisionId: "lamp-r1",
      finalAssetRevisionId: "motion-r1", contractRevisionId: "motion-contract-r1", fit: "contain" },
    { ...common, id: "cta", kind: "text", slotId: "m00-demo.cta", copyKey: "cta", fontSize: 19, color: "#d0df90", maxLines: 1 },
    { ...common, id: "audio", kind: "audio", slotId: "m00-demo.audio", assetRevisionId: "tone-r1", gain: 0.5, trimStartSeconds: 0 },
  ],
  assets: [
    { kind: "image", revisionId: "lamp-r1", objectKey: "fixtures/lamp.svg", sha256: hash("fixtures/lamp.svg"), width: 400, height: 400 },
    { kind: "video", revisionId: "motion-r1", objectKey: "fixtures/motion.mp4", sha256: hash("fixtures/motion.mp4"), width: 320, height: 180,
      durationSeconds: 6, fps: 30, codec: "h264", protectedArea: { x: 0, y: 0, w: 1, h: 1 } },
    { kind: "audio", revisionId: "tone-r1", objectKey: "fixtures/tone.wav", sha256: hash("fixtures/tone.wav"), durationSeconds: 6, sampleRate: 48000, channels: 1 },
    ...["latin", "cyrillic"].map((subset) => ({ kind: "font", revisionId: `font-${subset}-r1`, objectKey: `fixtures/noto-${subset}.woff2`,
      sha256: hash(`fixtures/noto-${subset}.woff2`), family: "StudioNoto" })),
  ],
  resourceContracts: [{ schemaVersion: "1.0", revisionId: "motion-contract-r1", logicalResourceId: "local-motion", slotId: "m00-demo.motion",
    referenceAssetRevisionId: "lamp-r1", compositionIntent: "Local test signal, fully visible; authored lamp proxy in draft.",
    protectedArea: { x: 0, y: 0, w: 1, h: 1 }, aspectRatio: 16 / 9, aspectTolerance: 0.001,
    requirement: { kind: "video", requiredDurationSeconds: 6, trimStartSeconds: 0, motionIntent: "Frame-addressable moving test pattern" } }],
  fontAssetRevisionIds: ["font-latin-r1", "font-cyrillic-r1"], fallbackPolicy: "review-required-for-visual-change",
});
writeFileSync(resolve(root, "fixtures/scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
console.log("Generated 6-second local video/audio, packaged font, and validated SceneSpec.");
