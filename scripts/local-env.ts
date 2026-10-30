import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export function loadLocalEnv() {
  const path=process.env.STUDIO_DATA_ENV ?? (existsSync(".env.m02.local") ? ".env.m02.local" : ".env.local");
  if(existsSync(path)) Object.assign(process.env,parseEnv(readFileSync(path,"utf8")));
}
export function requireLoopback(value: string) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) throw new Error("This development command only targets loopback. Remote setup is manual.");
}
