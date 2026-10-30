import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { dataConfig } from "@/packages/data/config.server";

export async function proxy(request: NextRequest) {
  if(process.env.STUDIO_SHARED_MODE==="true")return NextResponse.next({request});
  let config;
  try { config = dataConfig(); } catch { return NextResponse.next({ request }); }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      for (const {name,value} of values) request.cookies.set(name,value);
      response = NextResponse.next({ request });
      for (const {name,value,options} of values) response.cookies.set(name,value,{...options,httpOnly:true,sameSite:"lax",secure:request.nextUrl.protocol === "https:"});
    },
  }, global: { fetch: (input,init) => fetch(input,{...init,cache:"no-store",signal:AbortSignal.timeout(10_000)}) } });
  // Refresh in Proxy; each protected handler separately verifies identity and RLS.
  const {data} = await supabase.auth.getUser();
  if (!data.user && ["/workspace","/portal"].some((p)=>request.nextUrl.pathname.startsWith(p))) {
    const url = request.nextUrl.clone(); url.pathname="/login"; url.search="";
    const redirect = NextResponse.redirect(url); for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control","private, no-store"); return redirect;
  }
  response.headers.set("Cache-Control","private, no-store"); return response;
}
export const config = { matcher: ["/workspace/:path*", "/portal/:path*", "/login"] };
