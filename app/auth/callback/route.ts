import { cookies } from "next/headers";

// The default Supabase template verifies the email, then redirects here with a
// PKCE code. GET stages it but does not exchange it for a session. The verifier
// remains in an HttpOnly cookie in the browser that requested the email.
export async function GET(request: Request) {
  const codes = new URL(request.url).searchParams.getAll("code");
  const jar = await cookies();
  if (codes.length === 1 && /^[a-zA-Z0-9_-]{16,512}$/.test(codes[0])) {
    jar.set("toggle-pending-auth", codes[0], { httpOnly: true, sameSite: "lax", secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false, path: "/api/auth/confirm", maxAge: 300 });
  } else {
    jar.set("toggle-pending-auth", "", { httpOnly: true, sameSite: "lax", secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false, path: "/api/auth/confirm", maxAge: 0 });
  }
  return new Response(null, { status: 303, headers: { Location: "/auth/confirm", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
