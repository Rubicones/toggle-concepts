import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { verifyVideo } from "../apps/local-runner/verify";

async function main() {
  const baseUrl = process.env.PREVIEW_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only verify a local preview");
  const executablePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({ executablePath, headless: true });
  const output = resolve("artifacts/m00"); mkdirSync(output, { recursive: true });
  const errors: string[] = [], warnings: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, acceptDownloads: true });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
    await page.goto(`${url.origin}/preview`);
    await expect(page.getByTestId("main-player")).toBeVisible({ timeout: 60_000 });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await page.getByRole("button", { name: "Frame 60", exact: true }).click();
    await expect(page.getByTestId("current-frame")).toHaveText("Frame: 60");
    await page.waitForFunction(() => document.fonts.check('34px "StudioNoto"', "Light for what matters"));
    await expect(page.getByTestId("main-player").locator("img")).toBeVisible();
    assert.ok(await page.getByTestId("main-player").locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth > 0));
    const textBounds = await page.locator("[data-copy-key]").evaluateAll((nodes) => nodes.map((node) => {
      const element = node as HTMLElement;
      return { key: element.dataset.copyKey, fits: element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1 };
    }));
    assert.ok(textBounds.every((text) => text.fits), "Copy must fit its slots");
    await page.getByTestId("main-player").screenshot({ path: resolve(output, "player-frame60.png") });
    await page.getByTestId("main-player").getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="current-frame"]')?.textContent?.split(": ")[1]) >= 90);
    await page.getByTestId("main-player").getByRole("button", { name: "Pause video", exact: true }).click();
    await page.getByRole("button", { name: "Frame 0", exact: true }).click();
    await expect(page.getByTestId("current-frame")).toHaveText("Frame: 0");

    await page.getByRole("button", { name: "Separate 3D probe", exact: true }).click();
    await expect(page.getByTestId("three-player").locator("canvas")).toHaveAttribute("data-probe-frame", "0");
    await page.getByTestId("three-player").screenshot({ path: resolve(output, "three-player.png") });

    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open browser export experiment", exact: true }).click();
    const exportPage = await popup;
    exportPage.on("pageerror", (error) => errors.push(error.message));
    exportPage.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
    await exportPage.getByRole("button", { name: "Check and export in browser", exact: true }).click();
    const status = exportPage.getByTestId("export-status");
    await expect(status).toHaveText(/Browser file created|Browser export unavailable|Browser export stopped/, { timeout: 120_000 });
    const browserStatus = await status.innerText();
    let browserFile = null;
    if (browserStatus.startsWith("Browser file created")) {
      const pending = exportPage.waitForEvent("download");
      await exportPage.getByRole("link", { name: "Download test MP4" }).click();
      const download = await pending;
      const path = resolve(output, "m00-browser.mp4");
      await download.saveAs(path);
      // Retain all evidence even when the experimental backend fails timing QA.
      // Local production verification remains strict and exits nonzero on mismatch.
      browserFile = verifyVideo(path, undefined, true);
    }
    await exportPage.screenshot({ path: resolve(output, "browser-export.png"), fullPage: true });
    await exportPage.close();
    assert.equal(await page.locator("h1").count(), 1, "Experimental exporter must not disturb the preview document");
    await page.screenshot({ path: resolve(output, "preview-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId("main-player")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Frame 60", exact: true }).click();
    await expect(page.getByTestId("current-frame")).toHaveText("Frame: 60");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Narrow preview must not overflow");
    await page.screenshot({ path: resolve(output, "preview-narrow.png"), fullPage: true });
    assert.deepEqual(errors, [], "No browser runtime errors");
    const report = { status: "preview-passed", browser: browser.version(), preview: "playback + seek + packaged font + image + text bounds + 3D canvas + narrow viewport",
      textBounds, browserExporter: browserStatus, browserFile, errors, warnings: [...new Set(warnings)] };
    writeFileSync(resolve(output, "preview-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
