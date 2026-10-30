import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { dataConfig } from "@/packages/data/config.server";

export async function sessionClient() {
  const config = dataConfig(); const jar = await cookies();
  return createServerClient(config.url, config.key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) }) },
    cookies: { getAll: () => jar.getAll(), setAll: (values) => { for (const { name, value, options } of values) jar.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false }); } },
  });
}
