import { sessionClient } from "@/lib/supabase/server";
import { api, body, json, ApiError } from "@/lib/server/api";
import { magicLinkVerifySchema, signInDestination } from "@/packages/data/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) { return api(async () => {
  const { tokenHash } = await body(request, magicLinkVerifySchema);
  const client = await sessionClient();
  const jar = await cookies(); const code = jar.get("toggle-pending-auth")?.value;
  jar.set("toggle-pending-auth", "", { path: "/api/auth/confirm", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false });
  if (!tokenHash && !code) throw new ApiError(401, "INVALID_LINK", "This link is incomplete. Open the email in the browser that requested it, or request a new link.");
  const { data, error } = tokenHash ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" }) : await client.auth.exchangeCodeForSession(code!);
  if (error || !data.user || !data.session) throw new ApiError(401, "INVALID_LINK", "This sign-in link is invalid, expired, already used, or opened in another browser. Request a new link in this browser.");
  const { data: members, error: membershipError } = await client.rpc("my_memberships");
  if (membershipError) throw new ApiError(503, "MEMBERSHIP_UNAVAILABLE", "Signed in, but workspace membership is unavailable. Open your workspace or try again shortly.");
  return json({ destination: signInDestination(members) });
}); }
