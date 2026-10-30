// Standalone local CLI. Never import this entrypoint into Next.js.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { VERSION } from "remotion";
import { spikeManifest, spikeScope } from "../../fixtures/campaign";
import { sampleScene } from "../../fixtures/scene";
import { parseRenderManifest } from "../../packages/contracts/render";
import { directoryDigest, fileDigest, jsonDigest } from "./files";
import { verifyVideo } from "./verify";
import { validateFrozenRender } from "./manifest";

async function main() {
  const started = performance.now();
  const root = process.cwd();
  const output = resolve(root, "artifacts/m00");
  // Remotion may reuse an existing HTTP server; never let it select Next's 3000.
  const port = Number(process.env.REMOTION_PORT ?? 3111);
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, "Invalid REMOTION_PORT");
  mkdirSync(output, { recursive: true });
  const executablePath = process.env.CHROME_PATH ?? (platform() === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
  if (!executablePath) throw new Error("Set CHROME_PATH to a local Chromium executable; M00 does not download a browser.");
  for (const asset of sampleScene.assets) assert.equal(fileDigest(resolve(root, "public", asset.objectKey)), asset.sha256, `Dependency changed: ${asset.objectKey}`);
  const probeBrowser = await chromium.launch({ executablePath, headless: true });
  let browserVersion: string, gpu: string;
  try {
    browserVersion = probeBrowser.version();
    const page = await probeBrowser.newPage();
    gpu = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : "WebGL renderer unavailable";
    });
  } finally { await probeBrowser.close(); }
  const bundlePath = await bundle({ entryPoint: resolve(root, "remotion/index.tsx"), publicDir: resolve(root, "public"), outDir: resolve(output, "bundle") });
  const manifest = parseRenderManifest({
    schemaVersion: "1.0", id: "m00-render-r1", purpose: "capability-spike", campaignId: spikeScope.campaignId,
    variantId: spikeManifest.entries[0].id, variantManifest: { revisionId: spikeManifest.revisionId, sha256: jsonDigest(spikeManifest) },
    scopeRevisionId: spikeScope.revisionId, scene: { revisionId: sampleScene.revisionId, sha256: jsonDigest(sampleScene) },
    compositionId: "M00Local", props: { scene: sampleScene }, codeBundleSha256: directoryDigest(bundlePath),
    lockfileSha256: fileDigest(resolve(root, "package-lock.json")),
    dependencies: sampleScene.assets.map((a) => ({ objectKey: a.objectKey, sha256: a.sha256 })),
    output: { objectKey: "exports/m00/sample.mp4", width: 640, height: 360, fps: 30, durationFrames: 180, frameRange: [0, 180],
      container: "mp4", videoCodec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", colorSpace: "bt709",
      audioSampleRate: 48000, audioChannels: 2, expectedTracks: ["video", "audio"], crf: 18 },
    renderer: { backend: "local-chromium", remotionVersion: VERSION, nodeVersion: process.versions.node,
      browserVersion, os: `${platform()} ${release()}`, arch: arch(), gpu, concurrency: 1 },
    seed: sampleScene.seed, frozenAt: new Date().toISOString(), approvalRefs: [],
  });
  const frozen = { sha256: jsonDigest(manifest), manifest };
  validateFrozenRender(frozen, spikeScope, spikeManifest);
  writeFileSync(resolve(output, "render-manifest.json"), `${JSON.stringify(frozen, null, 2)}\n`);
  writeFileSync(resolve(output, "variant-manifest.json"), `${JSON.stringify(spikeManifest, null, 2)}\n`);
  writeFileSync(resolve(output, "scope.json"), `${JSON.stringify(spikeScope, null, 2)}\n`);
  const browser = await openBrowser("chrome", { browserExecutable: executablePath });
  try {
    const common = { serveUrl: bundlePath, puppeteerInstance: browser, inputProps: manifest.props, port };
    const composition = await selectComposition({ ...common, id: manifest.compositionId });
    assert.equal(composition.durationInFrames, manifest.output.durationFrames);
    const mediaStarted = performance.now();
    await renderMedia({ ...common, composition, outputLocation: resolve(output, "sample.mp4"), codec: "h264", audioCodec: "aac",
      pixelFormat: "yuv420p", colorSpace: "bt709", crf: 18, sampleRate: 48000, concurrency: 1,
      // Remotion uses an inclusive range; our portable contracts use half-open.
      frameRange: [manifest.output.frameRange[0], manifest.output.frameRange[1] - 1],
      onProgress: (() => { let last = -1; return ({ progress }: { progress: number }) => { const step = Math.floor(progress * 10); if (step > last) { last = step; console.log(`Local render ${step * 10}%`); } }; })(),
    });
    const renderSeconds = (performance.now() - mediaStarted) / 1000;
    const still = async (frame: number, name: string) => renderStill({ ...common, composition, frame, output: resolve(output, name), imageFormat: "png" });
    await still(60, "repeat-a.png"); await still(15, "out-of-order.png"); await still(60, "repeat-b.png");
    assert.equal(fileDigest(resolve(output, "repeat-a.png")), fileDigest(resolve(output, "repeat-b.png")), "Repeated out-of-order frame must match");
    const sampleReport = verifyVideo(resolve(output, "sample.mp4"));
    const probe = await selectComposition({ serveUrl: bundlePath, puppeteerInstance: browser, id: "M00ThreeProbe", port });
    const probeStarted = performance.now();
    await renderMedia({ serveUrl: bundlePath, puppeteerInstance: browser, composition: probe,
      outputLocation: resolve(output, "three-probe.mp4"), codec: "h264", pixelFormat: "yuv420p", colorSpace: "bt709", concurrency: 1, crf: 18, port });
    const threeReport = verifyVideo(resolve(output, "three-probe.mp4"), { width: 320, height: 320, fps: 30, frames: 60, audio: false });
    validateFrozenRender(JSON.parse(readFileSync(resolve(output, "render-manifest.json"), "utf8")), spikeScope, spikeManifest);
    const report = { sample: sampleReport, threeProbe: threeReport,
      deterministicFrame60: fileDigest(resolve(output, "repeat-a.png")),
      renderSeconds, threeProbeSeconds: (performance.now() - probeStarted) / 1000,
      totalSeconds: (performance.now() - started) / 1000, renderer: manifest.renderer };
    writeFileSync(resolve(output, "render-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: "passed", output, renderSeconds, totalSeconds: report.totalSeconds, renderer: report.renderer }, null, 2));
  } finally { await browser.close({ silent: true }); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
