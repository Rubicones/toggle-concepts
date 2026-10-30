import { z } from "zod";

// Unknown versions require an explicit migration creating a new revision.
export const version = z.literal("1.0");
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).max(160);
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const positiveInt = z.number().int().positive().safe();
export const frame = z.number().int().nonnegative().safe();
export const revisionRef = z.strictObject({ revisionId: id, sha256 });
export const rect = z.strictObject({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  w: z.number().positive().max(1), h: z.number().positive().max(1),
}).refine((r) => r.x + r.w <= 1.000001 && r.y + r.h <= 1.000001,
  "Rectangle must fit normalized source/target bounds");

export function unique(values: readonly unknown[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

// Canonical identity for validated JSON contracts. Hashing stays in Node.
export function canonicalJson(value: unknown): string {
  // Same rules as JSON.stringify (and so as the stored jsonb): absent object properties are omitted and
  // array holes are null. Values that were already valid hash exactly as before.
  const absent = (v: unknown) => v === undefined || typeof v === "function" || typeof v === "symbol";
  if (Array.isArray(value)) return `[${value.map((item) => absent(item) ? "null" : canonicalJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => !absent(record[key])).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  if (typeof value === "number") return plainNumber(value);
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Non-JSON manifest value");
  return result;
}
/**
 * Numbers print as Postgres prints a jsonb numeric (no exponent), so a hash taken here equals the one
 * app_private.review_canonical takes after the value is stored: 1e-7 → 0.0000001, 1e21 → 1000000000000000000000.
 */
export function plainNumber(n: number): string {
  const text = JSON.stringify(n);
  if (text === undefined || text === "null" || !/e/i.test(text)) return text ?? "null";
  const [mantissa, exponentText] = text.toLowerCase().split("e"), exponent = Number(exponentText);
  const negative = mantissa.startsWith("-"), [whole, fraction = ""] = mantissa.replace("-", "").split(".");
  const digits = whole + fraction, point = whole.length + exponent;
  const body = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? "-" : "") + body.replace(/^0+(?=\d)/, "");
}
