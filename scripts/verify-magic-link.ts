import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect, type Page } from "@playwright/test";
import { loadLocalEnv, requireLoopback } from "./local-env";

async function main() {
  loadLocalEnv();
  const base = new URL(process.env.STUDIO_URL ?? "http://127.0.0.1:3100"); requireLoopback(base.href);
  requireLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const stack = JSON.parse(readFileSync("artifacts/m02/stack-status.json", "utf8"));
  const inbox = new URL(stack.env.MAILPIT_URL); requireLoopback(inbox.href);
  const identities = JSON.parse(readFileSync("artifacts/m02/demo-credentials.json", "utf8"));
  const results: string[] = [], errors: string[] = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  async function emailLink(page: Page, role: string) {
    const previous = await (await fetch(`${inbox.origin}/api/v1/messages`)).json();
    const ids = new Set(previous.messages.map((message: {ID:string}) => message.ID));
    await page.goto(`${base.origin}/login`);
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(identities[role].email);
    await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("If this email has an account");
    for (let attempt = 0; attempt < 40; attempt++) {
      const messages = await (await fetch(`${inbox.origin}/api/v1/messages`)).json();
      const message = messages.messages.find((m: {ID:string;To:{Address:string}[]}) => !ids.has(m.ID) && m.To.some((to) => to.Address === identities[role].email));
      if (message) {
        const detail = await (await fetch(`${inbox.origin}/api/v1/message/${message.ID}`)).json();
        const href = /href="([^"]+)"/.exec(detail.HTML)?.[1]?.replaceAll("&amp;", "&");
        assert.ok(href, "A captured Auth email contains a link");
        const link = new URL(href); requireLoopback(link.href);
        assert.equal(link.origin, new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin);
        assert.equal(link.pathname, "/auth/v1/verify");
        assert.equal(link.searchParams.get("redirect_to"), `${base.origin}/auth/callback`);
        return link;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("No new local email captured. Wait at least one minute before rerunning; Auth throttles repeat email requests.");
  }
  const post = (page:Page,path:string,data:unknown,origin=base.origin) => page.request.post(`${base.origin}${path}`, { headers: { Origin: origin }, data });
  try {
    for (const role of ["producer", "client"]) {
      const context = await browser.newContext({ viewport: { width: role === "client" ? 390 : 1440, height: 1000 } });
      const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
      const link = await emailLink(page, role);
      const pendingCookies = await context.cookies();
      assert.ok(pendingCookies.some((cookie) => cookie.name.includes("code-verifier") && cookie.httpOnly));
      // Do not let Playwright errors print credential-bearing email URLs.
      try { await page.goto(link.href); } catch { throw new Error("Email verification navigation failed"); }
      await expect(page).toHaveURL(`${base.origin}/auth/confirm`);
      assert.equal((await page.request.get(`${base.origin}/api/secure/workspace`)).status(), 401, "GET stages a code without signing in");
      const pending = (await context.cookies()).find((cookie) => cookie.name === "toggle-pending-auth");
      assert.ok(pending?.httpOnly && pending.sameSite === "Lax");
      await page.getByRole("button", { name: "Continue to Toggle", exact: true }).click();
      await expect(page).toHaveURL(`${base.origin}${role === "producer" ? "/workspace" : "/portal"}`);
      await expect(page.getByText(role === "producer" ? "Authenticated workspace" : "Client access", { exact: true })).toBeVisible();
      const cookies = (await context.cookies()).filter((cookie) => /auth-token(?:\.\d+)?$/.test(cookie.name));
      assert.ok(cookies.length && cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"));
      assert.equal((await page.evaluate(() => document.cookie)).includes("auth-token"), false);
      await page.reload(); await expect(page.getByText(identities[role].email, { exact: true })).toBeVisible();
      await page.screenshot({ path: `artifacts/m02/magic-${role}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(`${base.origin}/login`);
      assert.equal((await page.request.get(`${base.origin}/api/secure/workspace`)).status(), 401);
      try { await page.goto(link.href); } catch { throw new Error("Used-link navigation failed"); }
      // Supabase returns a safe error fragment on used links; no code is staged.
      await expect(page.getByRole("button", { name: "Continue to Toggle", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue to Toggle", exact: true }).click();
      await expect(page.locator(".form-error[role=alert]")).toContainText("incomplete");
      assert.equal((await page.request.get(`${base.origin}/api/secure/workspace`)).status(), 401);
      results.push(`Captured-email PKCE ${role} sign-in, explicit confirmation, role landing, HttpOnly session, reload, logout and used-link rejection`);
      await context.close();
    }

    // Native templates cannot be customized. Exercise the provided hosted
    // template's token-hash protocol using an actual captured email token.
    const sender = await browser.newContext(), device = await browser.newContext();
    const senderPage = await sender.newPage(), page = await device.newPage();
    const link = await emailLink(senderPage, "director");
    const token = link.searchParams.get("token"); assert.ok(token);
    try { await page.goto(`${base.origin}/auth/confirm#token_hash=${encodeURIComponent(token)}`); } catch { throw new Error("Token-hash confirmation navigation failed"); }
    assert.equal((await page.request.get(`${base.origin}/api/secure/workspace`)).status(), 401);
    await page.reload(); // Plain GET/reload leaves an unconsumed token valid.
    await page.getByRole("button", { name: "Continue to Toggle", exact: true }).click();
    await expect(page).toHaveURL(`${base.origin}/workspace`);
    await expect(page.getByText(identities.director.email, { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).hash, "");
    const fresh = await browser.newContext(), anonymous = await fresh.newPage(); await anonymous.goto(`${base.origin}/login`);
    assert.equal((await post(anonymous, "/api/auth/confirm", { tokenHash: token })).status(), 401);
    assert.equal((await post(anonymous, "/api/auth/confirm", { tokenHash: "a".repeat(64) })).status(), 401);
    results.push("Real token-hash verification in a different browser, inert GET/reload, URL clearing, invalid-token and replay rejection (hosted email template delivery remains unverified)");

    const unknown = `missing-${crypto.randomUUID()}@toggle.local`;
    const response = await post(anonymous, "/api/auth/magic-link", { email: unknown });
    assert.equal(response.status(), 200); assert.match((await response.json()).message, /If this email has an account/);
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.listUsers(); assert.equal(error, null); assert.equal(data.users.some((user) => user.email === unknown), false);
    assert.equal((await post(anonymous, "/api/auth/magic-link", { email: unknown, redirectTo: "https://foreign.example" })).status(), 400);
    assert.equal((await post(anonymous, "/api/auth/magic-link", { email: unknown }, "https://foreign.example")).status(), 403);
    assert.equal((await post(anonymous, "/api/auth/confirm", { tokenHash: "b".repeat(64) }, "https://foreign.example")).status(), 403);
    assert.equal((await post(anonymous, "/api/auth/confirm", { tokenHash: "b".repeat(64), type: "recovery" })).status(), 400);
    assert.equal((await anonymous.request.get(`${base.origin}/api/secure/workspace`)).status(), 401);
    results.push("Unknown email gets generic response without creating an account; cross-origin, redirect and verification-type injection rejected");
    assert.deepEqual(errors, []);
    writeFileSync("artifacts/m02/magic-link-report.json", JSON.stringify({ checkedAt: new Date().toISOString(), base: base.origin, results, pageErrors: errors }, null, 2));
    console.log(`Passed ${results.length} magic-link flows. Captured emails and tokens are local-only; report: artifacts/m02/magic-link-report.json`);
  } finally { await browser.close(); }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : "Magic-link verification failed";
  console.error(message.replace(/((?:token_hash|token|code)=)[^\s&"'<>]+/g, "$1[REDACTED]"));
  process.exitCode = 1;
});
