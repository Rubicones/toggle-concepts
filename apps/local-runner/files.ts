import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalJson } from "../../packages/contracts/common";

export const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const jsonDigest = (value: unknown) => digest(canonicalJson(value));
export const fileDigest = (path: string) => digest(readFileSync(path));
export function directoryDigest(root: string): string {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  return jsonDigest(walk(root).sort().map((file) => ({ key: relative(root, file), sha256: fileDigest(file) })));
}
