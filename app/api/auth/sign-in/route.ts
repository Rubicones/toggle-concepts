import { z } from "zod";
import { sessionClient } from "@/lib/supabase/server";
import { api, body, json, ApiError } from "@/lib/server/api";
import { signInDestination } from "@/packages/data/auth";
export async function POST(request: Request) { return api(async () => {
  const input = await body(request,z.strictObject({email:z.email().max(200),password:z.string().min(1).max(200)}));
  const client = await sessionClient(); const {error} = await client.auth.signInWithPassword(input);
  if (error) throw new ApiError(401,"INVALID_CREDENTIALS","Sign-in failed. Check your email and password.");
  const {data:members,error:membershipError} = await client.rpc("my_memberships");
  if (membershipError) throw new ApiError(503,"MEMBERSHIP_UNAVAILABLE","Signed in, but workspace membership is unavailable. Try refreshing.");
  return json({ destination:signInDestination(members) });
}); }
