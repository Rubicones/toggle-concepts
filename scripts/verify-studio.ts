import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { workerViewSchema } from "../packages/contracts/studio";

async function main() {
  const base = new URL(process.env.STUDIO_URL ?? "http://localhost:3000");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Only test a local studio");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const output = resolve("artifacts/m01"); mkdirSync(output, { recursive: true });
  const errors: string[] = []; const results: string[] = [];
  let worker: ChildProcess | null = null;
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
    page.on("pageerror", (error) => errors.push(error.message));
    const visit = async (path: string) => {
      const response = await page.goto(`${base.origin}${path}`);
      assert.equal(response?.status(), 200, `Route ${path}`);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    };
    await visit("/");
    await expect(page.getByRole("heading", { name: "Your campaigns", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(/[\u0400-\u04ff]/.test(await page.locator("body").innerText()), false, "Default dashboard is English");
    await page.screenshot({ path: resolve(output, "campaigns-desktop.png"), fullPage: true });
    await page.getByRole("textbox", { name: "Find a campaign" }).fill("No such campaign");
    await expect(page.getByRole("heading", { name: "No campaigns match your search." })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    results.push("English dashboard, demo cards, campaign search and reset");

    await page.getByRole("button", { name: "New campaign", exact: true }).first().click();
    const create = page.getByRole("dialog");
    await create.getByLabel("Campaign name", { exact: true }).fill("A brighter tomorrow");
    await create.getByLabel("Brand", { exact: true }).fill("Smoke test");
    await create.getByPlaceholder("What would you like this campaign to do?").fill("A saved local campaign note.");
    await create.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL(/\/campaigns\/local-/);
    const localPath = new URL(page.url()).pathname;
    await page.reload();
    await expect(page.getByRole("heading", { name: "A brighter tomorrow", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Brief & scope", exact: true }).click();
    await page.getByLabel("What should this campaign do?").fill("Updated note, still not a C1 submission.");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved on this device.");
    await page.reload();
    await expect(page.getByLabel("What should this campaign do?")).toHaveValue("Updated note, still not a C1 submission.");
    results.push(`Local campaign creation, deep link, note editing, and reload persistence (${localPath})`);

    await visit("/campaigns/luma-demo");
    const creative = page.getByRole("region", { name: "Variant explorer", exact: true }).getByTestId("creative-study");
    await expect(creative).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    const rect = await creative.boundingBox(); assert.ok(rect && Math.abs(rect.width / rect.height - 16 / 9) < .03, "Actual study aspect ratio changes");
    await page.getByRole("button", { name: "Meet the product", exact: true }).click();
    await expect(creative).toContainText("Meet your");
    await page.getByRole("button", { name: "Russian", exact: true }).click();
    await expect(creative).toHaveAttribute("lang", "ru");
    await expect(creative).toContainText("Знакомьтесь");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: "9:16", exact: true }).click();
    await page.getByRole("button", { name: "Next scene", exact: true }).click();
    await expect(creative).toContainText("For the things");
    await page.screenshot({ path: resolve(output, "campaign-explorer-desktop.png"), fullPage: true });
    await page.getByRole("link", { name: "Final variants", exact: false }).click();
    await expect(page.locator(".variant-table:visible tbody tr")).toHaveCount(32);
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("en-GB");
    await page.getByRole("combobox", { name: "Format", exact: true }).selectOption("vertical-9x16");
    await expect(page.locator(".variant-table:visible tbody tr")).toHaveCount(4);
    await page.getByRole("button", { name: /Preview luma-/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("No final file has been generated or approved.");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: "Drafts", exact: true }).click();
    await expect(page.locator(".study-card")).toHaveCount(3);
    results.push("Variant format/language/hook/scene controls, 32-row manifest, filters, and three explicitly illustrative studies");

    await visit("/settings");
    await page.getByLabel("Workspace name", { exact: true }).fill("Test studio");
    await page.getByRole("checkbox", { name: /Reduce interface motion/ }).check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await page.reload();
    await expect(page.getByLabel("Workspace name", { exact: true })).toHaveValue("Test studio");
    await expect(page.getByRole("checkbox", { name: /Reduce interface motion/ })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
    await page.getByRole("button", { name: "Search workspace", exact: true }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Media");
    await page.getByRole("dialog").getByRole("link", { name: "Media library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Media library", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Motion test signal/ }).click();
    await expect(page.getByRole("dialog").locator("video")).toHaveAttribute("src", "/fixtures/motion.mp4");
    await page.keyboard.press("Escape");
    results.push("Settings persistence, reduced motion, searchable navigation, and actual local media inspection");

    for (const path of ["/queue", "/models", "/media", "/settings", "/campaigns/luma-demo/brand-kit", "/campaigns/luma-demo/history", "/campaigns/kite-demo", "/preview"]) {
      await visit(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      assert.equal(/[\u0400-\u04ff]/.test(await page.locator(".studio-content").innerText()), false, `English interface at ${path}`);
    }
    results.push("All workspace/campaign routes and render lab use English interface copy");

    const readWorker = async () => workerViewSchema.parse(await (await page.request.get(`${base.origin}/api/local-worker`)).json());
    const prior = await readWorker();
    if (!prior.online) {
      worker = spawn(process.execPath, ["--import", "tsx", "apps/local-runner/worker.ts"], { env: { ...process.env, MOCK_PROVIDERS: "true" }, stdio: "pipe" });
      worker.on("error", (error) => errors.push(error.message));
    }
    await expect.poll(async () => (await readWorker()).online, { timeout: 15_000 }).toBe(true);
    await visit("/queue");
    await expect(page.getByRole("heading", { name: "Your device is ready." })).toBeVisible();
    await expect(page.locator(".device-facts")).toContainText("32 variants validated");
    await page.screenshot({ path: resolve(output, "worker-online.png"), fullPage: true });
    if (worker) {
      const processToStop = worker;
      const exited = new Promise<void>((resolveExit) => processToStop.once("exit", () => resolveExit()));
      processToStop.kill("SIGTERM"); await exited; worker = null;
      await expect.poll(async () => (await readWorker()).online).toBe(false);
      await page.getByRole("button", { name: "Refresh status", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Bring your studio online." })).toBeVisible();
    }
    results.push("Independent worker startup, contract validation, live heartbeat, and truthful offline state");

    await page.setViewportSize({ width: 390, height: 844 });
    await visit("/"); await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Your campaigns", exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No narrow viewport overflow");
    await page.screenshot({ path: resolve(output, "campaigns-narrow.png"), fullPage: true });
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("link", { name: "Models & agents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Models & agents", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await visit("/campaigns/luma-demo");
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No narrow explorer overflow");
    await page.screenshot({ path: resolve(output, "campaign-explorer-narrow.png"), fullPage: true });
    results.push("390px initial layout, accessible mobile drawer, navigation dismissal, and narrow variant explorer");
    assert.deepEqual(errors, [], "No browser runtime errors");
    const report = { status: "passed", browser: browser.version(), results, errors };
    writeFileSync(resolve(output, "studio-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { worker?.kill("SIGTERM"); await browser.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
