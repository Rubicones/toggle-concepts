import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { demoData as d } from "../fixtures/data-demo";
import { loadLocalEnv, requireLoopback } from "./local-env";

async function main(){
  loadLocalEnv();const base=new URL(process.env.STUDIO_URL ?? "http://127.0.0.1:3100");requireLoopback(base.href);
  const credentials=JSON.parse(readFileSync("artifacts/m02/demo-credentials.json","utf8"));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
  const folder=resolve("artifacts/m02");mkdirSync(folder,{recursive:true});const errors:string[]=[],results:string[]=[];const scripts:Promise<string>[]=[];
  const wire=(page:Page)=>{page.on("pageerror",(e)=>errors.push(e.message));page.on("response",(r)=>{if(r.url().startsWith(base.origin) && r.url().includes("/_next/static/") && r.url().endsWith(".js"))scripts.push(r.text().catch(()=>""));});};
  const login=async(page:Page,role:string)=>{await page.goto(`${base.origin}/login`);await page.getByRole("button",{name:"Use a password instead",exact:true}).click();await page.getByRole("textbox",{name:"Email",exact:true}).fill(credentials[role].email);await page.getByLabel("Password",{exact:true}).fill(credentials[role].password);await page.getByRole("button",{name:"Sign in",exact:true}).click();try {await page.waitForURL(role==="producer" ? /\/workspace$/ : /\/portal$/);}catch{throw new Error(`Login navigation failed for ${role}: ${(await page.getByRole("alert").allTextContents()).join(" ")}`);}};
  try{
    const context=await browser.newContext({viewport:{width:1512,height:1100},acceptDownloads:true});const page=await context.newPage();wire(page);
    await page.goto(`${base.origin}/workspace`);await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole("heading",{name:"Good to see you."})).toBeVisible();
    await page.screenshot({path:resolve(folder,"sign-in-desktop.png"),fullPage:true});
    assert.equal((await page.request.get(`${base.origin}/api/secure/workspace`)).status(),401);
    await login(page,"producer");await expect(page.getByText("Authenticated workspace",{exact:true})).toBeVisible();
    const authCookies=(await context.cookies()).filter((c)=>/auth-token(?:\.\d+)?$/.test(c.name));assert.ok(authCookies.length);assert.ok(authCookies.every((c)=>c.httpOnly && c.sameSite==="Lax"));
    assert.equal((await page.evaluate(()=>document.cookie)).includes("auth-token"),false);
    const priorWorkspace=await (await page.request.get(`${base.origin}/api/secure/workspace`)).json();
    for(const c of priorWorkspace.campaigns.filter((c:{brand:string;name:string})=>c.brand==="Toggle test" && c.name.startsWith("Shared smoke test"))) {
      const revoked=await page.request.post(`${base.origin}/api/secure/campaign-access`,{headers:{Origin:base.origin},data:{campaignId:c.id,userId:credentials.client.id,allowAccess:false}});assert.ok(revoked.ok());
    }
    await page.getByRole("combobox",{name:"Shared campaign"}).selectOption(d.campaign);await expect(page.getByRole("heading",{name:"Evening essentials",exact:true})).toBeVisible();
    const note=`Browser access test ${Date.now()} · internal only`;
    await page.getByLabel("Internal note",{exact:true}).fill(note);await page.getByRole("button",{name:"Save internal note",exact:true}).click();await expect(page.locator(".saved-notes")).toContainText(note);
    const filename=`browser-reference-${Date.now()}.wav`;
    await page.getByLabel("Choose a reference",{exact:true}).setInputFiles({name:filename,mimeType:"audio/wav",buffer:readFileSync("public/fixtures/tone.wav")});
    await page.getByRole("button",{name:"Upload for validation",exact:true}).click();await expect(page.getByRole("status")).toContainText("Waiting for the local validator.");
    const ran=await new Promise<number|null>((resolveExit,reject)=>{const child=spawn(process.execPath,["--import","tsx","apps/local-runner/validate-uploads.ts","--once"],{stdio:"pipe"});child.once("error",reject);child.once("exit",resolveExit);});assert.equal(ran,0);
    await page.getByRole("button",{name:"Refresh",exact:true}).click();const card=page.locator(".shared-asset-card").filter({has:page.getByRole("heading",{name:filename,exact:true})});await expect(card).toBeVisible();await expect(card).toContainText("Private · validated");
    const workspace=await (await page.request.get(`${base.origin}/api/secure/workspace?campaign=${d.campaign}`)).json();const asset=workspace.assets.find((a:{filename:string})=>a.filename===filename);assert.ok(asset);
    const badOrigin=await page.request.post(`${base.origin}/api/secure/assets/${asset.id}/read-access`,{headers:{Origin:"https://foreign.example"}});assert.equal(badOrigin.status(),403);
    const injected=await page.request.post(`${base.origin}/api/secure/uploads/sessions`,{headers:{Origin:base.origin},data:{schemaVersion:"1.0",campaignId:d.campaign,requestId:crypto.randomUUID(),filename:"forged.wav",mime:"audio/wav",bytes:42,userId:credentials.other.id}});assert.equal(injected.status(),400);
    const clientContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const portal=await clientContext.newPage();wire(portal);await login(portal,"client");
    await expect(portal.getByText("Client access",{exact:true})).toBeVisible();assert.equal((await portal.request.get(`${base.origin}/api/secure/workspace`)).status(),403);
    assert.equal((await portal.request.get(`${base.origin}/api/secure/portal?campaign=${d.privateCampaign}`)).status(),404);
    assert.equal((await portal.request.post(`${base.origin}/api/secure/assets/${asset.id}/read-access`,{headers:{Origin:base.origin}})).status(),404);
    assert.equal(await portal.locator(".studio-sidebar").count(),0);assert.equal((await portal.locator("body").innerText()).includes(note),false);
    results.push("Protected sign-in, real producer/client sessions, server-persisted note, upload and independent CLI validation; CSRF/body injection denied");

    await card.getByRole("button",{name:"Share reference",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Share reference",exact:true}).click();await expect(dialog).toHaveCount(0);await expect(card).toContainText("Shared reference");
    await portal.getByRole("button",{name:"Refresh",exact:true}).click();const clientCard=portal.locator(".shared-asset-card").filter({has:portal.getByRole("heading",{name:filename,exact:true})});await expect(clientCard).toBeVisible();
    const pending=portal.waitForEvent("download");await clientCard.getByRole("button",{name:"Download reference",exact:true}).click();const download=await pending;await download.saveAs(resolve(folder,"verified-reference.wav"));await expect(portal.getByRole("status")).toContainText("verified SHA-256");assert.deepEqual(readFileSync(resolve(folder,"verified-reference.wav")),readFileSync("public/fixtures/tone.wav"));
    const projection=await (await portal.request.get(`${base.origin}/api/secure/portal`)).json();assert.deepEqual(Object.keys(projection).sort(),["assets","campaigns","email"]);assert.equal(JSON.stringify(projection).includes(note),false);
    assert.equal(await portal.getByRole("combobox",{name:"Client campaign"}).locator("option").count(),1);
    await page.locator("body").click({position:{x:700,y:120}});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:resolve(folder,"workspace-desktop.png"),fullPage:true});await portal.screenshot({path:resolve(folder,"client-portal-desktop.png"),fullPage:true});
    results.push("Private file withheld until explicit rights-confirmed sharing; allowlisted client projection and actual hash-verified download");

    await page.getByRole("button",{name:"New shared campaign",exact:true}).click();const create=page.getByRole("dialog");await create.getByLabel("Campaign name",{exact:true}).fill(`Shared smoke test ${Date.now()}`);await create.getByLabel("Brand",{exact:true}).fill("Toggle test");await create.getByRole("button",{name:"Create shared campaign",exact:true}).click();await expect(create).toHaveCount(0);await expect(page.getByRole("heading",{name:/Shared smoke test/})).toBeVisible();await page.reload();
    const campaigns=await (await page.request.get(`${base.origin}/api/secure/workspace`)).json();assert.ok(campaigns.campaigns.some((c:{brand:string})=>c.brand==="Toggle test"));
    await page.getByRole("combobox",{name:"Shared campaign"}).selectOption(d.campaign);await expect(page.locator(".saved-notes")).toContainText(note);
    const createdCampaign=campaigns.campaigns.find((c:{brand:string;name:string})=>c.brand==="Toggle test" && c.name.includes("Shared smoke test"));assert.ok(createdCampaign);
    await page.getByRole("combobox",{name:"Shared campaign"}).selectOption(createdCampaign.id);
    await page.getByRole("button",{name:"Manage access",exact:true}).click();let access=page.getByRole("dialog");let assigned=access.getByRole("checkbox",{name:/^client@toggle.local/});await assigned.check();await expect(assigned).toBeChecked();await expect(access.getByRole("status")).toHaveText("Campaign access updated.");await page.keyboard.press("Escape");
    await portal.getByRole("button",{name:"Refresh",exact:true}).click();await expect(portal.getByRole("combobox",{name:"Client campaign"}).locator("option")).toHaveCount(2);
    await page.getByRole("button",{name:"Manage access",exact:true}).click();access=page.getByRole("dialog");assigned=access.getByRole("checkbox",{name:/^client@toggle.local/});await assigned.uncheck();await expect(assigned).not.toBeChecked();await expect(access.getByRole("status")).toHaveText("Campaign access updated.");await page.keyboard.press("Escape");
    assert.equal((await portal.request.get(`${base.origin}/api/secure/portal?campaign=${createdCampaign.id}`)).status(),404);
    await portal.getByRole("button",{name:"Refresh",exact:true}).click();await expect(portal.getByRole("combobox",{name:"Client campaign"}).locator("option")).toHaveCount(1);
    await page.getByRole("combobox",{name:"Shared campaign"}).selectOption(d.campaign);await expect(page.locator(".saved-notes")).toContainText(note);
    results.push("Shared campaign persistence and producer access management; client assignment/revocation changes server access immediately");
    await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByText("Authenticated workspace",{exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Evening essentials",exact:true})).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(folder,"workspace-narrow.png"),fullPage:true});
    await portal.setViewportSize({width:390,height:844});await portal.reload();await expect(portal.getByText("Client access",{exact:true})).toBeVisible();assert.ok(await portal.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await portal.screenshot({path:resolve(folder,"client-portal-narrow.png"),fullPage:true});
    await portal.getByRole("button",{name:"Sign out",exact:true}).click();await expect(portal).toHaveURL(/\/login$/);assert.equal((await portal.request.get(`${base.origin}/api/secure/portal`)).status(),401);await portal.goto(`${base.origin}/portal`);await expect(portal).toHaveURL(/\/login$/);
    await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/\/login$/);
    assert.equal(/[\u0400-\u04ff]/.test(await page.locator("body").innerText()),false);
    const source=(await Promise.all(scripts)).join("\n");for(const value of [process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.S3_SECRET_ACCESS_KEY,process.env.MEDIA_WORKER_PASSWORD]){assert.ok(value);assert.equal(source.includes(value),false,"Server credential must not enter browser JavaScript");}
    assert.deepEqual(errors,[]);
    results.push("390px studio/client layouts, English copy, session logout/denial, no runtime errors and no server credentials in loaded client chunks");
    const report={status:"passed",browser:browser.version(),server:base.origin,results,errors};writeFileSync(resolve(folder,"access-ui-report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();}
}
main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "Access UI verification failed");process.exitCode=1;});
