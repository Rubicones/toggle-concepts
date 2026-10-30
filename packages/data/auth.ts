import { z } from "zod";

export const magicLinkRequestSchema = z.strictObject({ email: z.email().max(200) });
export const magicLinkVerifySchema = z.strictObject({ tokenHash: z.string().regex(/^[a-zA-Z0-9_-]{32,256}$/).optional() });
export const magicLinkSentMessage = "If this email has an account, a sign-in link is on its way. Check your inbox and spam folder. Please wait a minute before requesting another.";

// Never derive email destinations from Host, forwarded headers, or caller input.
export function magicLinkRedirectUrl(applicationUrl: string | undefined) {
  if (!applicationUrl) throw new Error("DATA_NOT_CONFIGURED");
  const url = new URL(applicationUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("DATA_NOT_CONFIGURED");
  return new URL("/auth/callback", url).href;
}

export function signInDestination(members: { role: string }[] | null) {
  return members?.some((member) => ["owner", "producer", "art_director"].includes(member.role)) ? "/workspace" : "/portal";
}
