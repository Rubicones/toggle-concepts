import { sessionClient } from "@/lib/supabase/server";
import { api, body, json, ApiError } from "@/lib/server/api";
import { magicLinkRedirectUrl, magicLinkRequestSchema, magicLinkSentMessage } from "@/packages/data/auth";

export async function POST(request: Request) { return api(async () => {
  const { email } = await body(request, magicLinkRequestSchema);
  const destination = magicLinkRedirectUrl(process.env.NEXT_PUBLIC_APP_URL);
  const client = await sessionClient();
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: destination } });
  // Account-specific rejections (including cooldown) must not disclose membership.
  // Auth retains provider-side email/verification throttles; no in-memory limiter.
  if (error && (!error.status || error.status >= 500)) throw new ApiError(503, "EMAIL_UNAVAILABLE", "We could not request a sign-in email. Try again shortly or use your password.");
  return json({ message: magicLinkSentMessage });
}); }
