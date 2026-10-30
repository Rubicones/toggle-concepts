import assert from "node:assert/strict";
import { test } from "node:test";
import { imageOptionsSchema, generatedImageSchema } from "../packages/contracts/image-generation";
import { imageReservation, imageQuoteSchema, imageRequest, decodeImageResult, providerReceipt, boundedProviderJson, quoteImage } from "../packages/agents/image-provider";
import { IMAGE_MODEL } from "../packages/agents/defaults";

test("image reservation includes the separate image output tariff and fails closed for unknown prices", () => {
  assert.equal(imageReservation(0.0000003, 0.00003, 10000, 0.0000025, 8192), 68398);
  assert.ok(imageReservation(0.0000003, 0.00003, 10000, 0.0000025, 8192) > imageReservation(0.0000003, 0.0000025, 10000, 0.0000025, 8192));
  for (const prices of [[NaN, 0.00003], [0.0000003, 0], [0.0000003, Infinity], [-1, 0.00003]]) assert.throws(() => imageReservation(prices[0], prices[1], 10000, 0.0000025, 8192));
  assert.equal(imageOptionsSchema.safeParse({ aspectRatio: "9:16", count: 10 }).success, false);
  assert.equal(imageOptionsSchema.safeParse({ aspectRatio: "8:1" }).success, false);
});
test("image request pins one provider, one candidate, ratio and frozen instructions/context", () => {
  const quote = imageQuoteSchema.parse({ model: IMAGE_MODEL, provider: "google-vertex/global", inputPrice: 0.0000003, outputPrice: 0.00003, outputTokensPerImage: 1290, textOutputPrice: 0.0000025, maxTextOutput: 8192, aspectRatio: "9:16", inputBound: 10000, reservation: 68398, quotedAt: "2026-10-24T12:00:00.000Z" });
  const request = imageRequest(quote, "Saved role instructions", { brand: "Luma" }, "A blue lamp");
  assert.equal(request.n, 1); assert.equal(request.aspect_ratio, "9:16"); assert.equal(request.stream, false);
  assert.deepEqual(request.provider, { only: ["google-vertex/global"], allow_fallbacks: false });
  assert.match(request.prompt, /Saved role instructions/); assert.match(request.prompt, /Luma/); assert.match(request.prompt, /no reference pixels were attached/);
});
test("provider image receipt cannot invent free cost, remote URLs or multiple image successes", async () => {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+n8AAAAASUVORK5CYII=", "base64"), b64_json = bytes.toString("base64");
  assert.deepEqual(decodeImageResult({ data: [{ b64_json }] }).bytes, bytes);
  for (const value of [{ data: [] }, { data: [{ url: "https://external.invalid/a.png" }] }, { data: [{ b64_json }, { b64_json }] }, { data: [{ b64_json: "not base64" }] }, { data: [{ b64_json, media_type: "image/svg+xml" }] }]) assert.throws(() => decodeImageResult(value));
  assert.equal(providerReceipt({ usage: {} }).cost, null);
  assert.equal(providerReceipt({ usage: { cost: -1 } }).cost, null);
  assert.equal(providerReceipt({ id: "gen-actual", usage: { cost: 0.039 } }).cost, 39000);
  assert.equal(generatedImageSchema.safeParse({ kind: "generated-image", uploadId: "fake" }).success, false);
  await assert.rejects(boundedProviderJson(new Response("x".repeat(15 * 1024 * 1024 + 1))), /IMAGE_RESPONSE_TOO_LARGE/);
});
test("quote rejects unsupported models, ratios and novel billable units without submitting generation", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    const endpoint = { provider_tag: "google-vertex/global", supported_parameters: { aspect_ratio: { values: ["1:1"] }, n: { min: 1, max: 1 } }, pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.00003 }] };
    globalThis.fetch = async input => { calls++; assert.match(String(input), /\/images\/models\/.*\/endpoints$/); return Response.json({ endpoints: [endpoint] }); };
    const quote = await quoteImage(IMAGE_MODEL, "1:1", 0.0000003, 10000, 0.0000025, 8192);
    assert.equal(quote.reservation, 68398);
    await assert.rejects(quoteImage("another-model", "1:1", 0.0000003, 10000, 0.0000025, 8192), /IMAGE_MODEL_UNSUPPORTED/);
    await assert.rejects(quoteImage(IMAGE_MODEL, "9:16", 0.0000003, 10000, 0.0000025, 8192), /IMAGE_PRICING_UNAVAILABLE/);
    endpoint.pricing.push({ billable: "new_fee", unit: "request", cost_usd: 1 });
    await assert.rejects(quoteImage(IMAGE_MODEL, "1:1", 0.0000003, 10000, 0.0000025, 8192), /IMAGE_PRICING_UNAVAILABLE/);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
